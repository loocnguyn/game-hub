'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, serverNow } from './api';
import { realtimeReady, sb } from './supabase';

export interface RoomView<S = any> {
  code: string;
  game: string;
  version: number;
  state: S;
  serverNow?: number;
}

/** Earliest future server timestamp at which the room needs a server-side check. */
function nextDue(s: any): number | null {
  const t: number[] = [];
  const push = (v: unknown) => typeof v === 'number' && t.push(v);
  if (!s) return null;
  if (s.kind === 'board' && s.status === 'playing') {
    push(s.firstMoveDeadline);
    if (s.clock?.turnStart != null) push(s.clock.turnStart + s.clock.rem[s.turn]);
  }
  if (s.kind === 'tetris' && s.status === 'playing' && s.endAt) push(s.endAt + 5_000);
  if (s.kind === 'tienlen') {
    if (s.status === 'playing') push(s.deadline);
    if (s.status === 'finished') push(s.nextStartAt);
  }
  if (s.kind === 'monopoly' && s.status === 'playing') push(s.deadline);
  if (!t.length) return null;
  return Math.min(...t);
}

export function useRoom<S = any>(code: string, opts: { userId?: string; onUpdate?: (prev: S | null, next: S) => void } = {}) {
  const [view, setView] = useState<RoomView<S> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const latest = useRef<RoomView<S> | null>(null);
  const onUpdate = useRef(opts.onUpdate);
  onUpdate.current = opts.onUpdate;
  const userId = useRef(opts.userId);
  userId.current = opts.userId;

  const accept = useCallback((v: RoomView<S>, keepPrivate = false) => {
    const prev = latest.current;
    if (prev && v.version < prev.version) return;
    if (prev && v.version === prev.version && !keepPrivate) {
      // same version (e.g. our own action echoed back): still take it if it carries private data
      if (!(v.state as any)?.hand) return;
    }
    let next = v;
    if (keepPrivate && prev && (prev.state as any)?.hand) {
      next = { ...v, state: { ...(v.state as any), hand: (prev.state as any).hand } };
    }
    latest.current = next;
    setView(next);
    onUpdate.current?.(prev?.state ?? null, next.state);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const v = await api<RoomView<S>>('room.view', { code });
      if (latest.current && v.version === latest.current.version) {
        latest.current = v;
        setView(v);
      } else accept(v);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && /không tồn tại/.test(e.message)) setGone(true);
      setError((e as Error).message);
    }
  }, [code, accept]);

  // initial load + realtime
  useEffect(() => {
    latest.current = null;
    setView(null);
    setGone(false);
    refresh();
    let ch: ReturnType<ReturnType<typeof sb>['channel']> | null = null;
    let cancelled = false;
    realtimeReady().then(() => {
      if (cancelled) return;
      ch = sb()
      .channel(`room-db:${code}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hub_rooms', filter: `code=eq.${code}` }, (payload) => {
        const row = payload.new as { code: string; game: string; version: number; state: any };
        const prev = latest.current?.state as any;
        const s = row.state;
        accept({ code: row.code, game: row.game, version: row.version, state: s }, true);
        // Hidden info (tiến lên hand) is not in the public row: refetch when it may have changed.
        if (s?.kind === 'tienlen' && prev) {
          const mine = (s.seats || []).findIndex((x: any) => x?.id === userId.current);
          if (s.gameNo !== prev.gameNo || (mine >= 0 && s.counts?.[mine] !== prev.hand?.length)) refresh();
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hub_rooms' }, (payload) => {
        if ((payload.old as { code?: string })?.code === code) setGone(true);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh(); // catch up on anything missed while connecting
      });
    });
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      if (ch) sb().removeChannel(ch);
      window.removeEventListener('focus', onFocus);
    };
  }, [code, refresh, accept]);

  const act = useCallback(async (action: string, params: Record<string, unknown> = {}) => {
    const v = await api<RoomView<S>>('room.act', { code, action, ...params });
    accept(v);
    return v;
  }, [code, accept]);

  const join = useCallback(async () => {
    const v = await api<RoomView<S>>('room.join', { code });
    accept(v);
    return v;
  }, [code, accept]);

  const leave = useCallback(async () => {
    await api('room.leave', { code });
  }, [code]);

  // Ask the server to resolve timeouts when they fall due.
  useEffect(() => {
    const due = nextDue(view?.state);
    if (due === null) return;
    const wait = Math.max(150, due - serverNow() + 250);
    const id = setTimeout(() => {
      act('tick').catch(() => refresh());
    }, Math.min(wait, 2_147_000_000));
    return () => clearTimeout(id);
  }, [view, act, refresh]);

  return { view, state: view?.state ?? null, error, gone, refresh, act, join, leave };
}
