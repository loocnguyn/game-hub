'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { realtimeReady, sb } from './supabase';
import { useAuth } from './auth';
import { useToast } from '@/components/ui';
import { gameById } from './games';
import { sfx } from './sfx';

export interface OnlineUser {
  id: string;
  name: string;
  where: string; // human readable activity
  since: number;
}

interface PresenceState {
  online: OnlineUser[];
  setWhere(where: string): void;
  invite(toId: string, game: string, code: string): Promise<void>;
}

const Ctx = createContext<PresenceState>({ online: [], setWhere: () => {}, invite: async () => {} });

/** One lobby-wide Realtime channel: presence (who is online, doing what) + invite broadcasts. */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const chan = useRef<RealtimeChannel | null>(null);
  const where = useRef('Sảnh chính');
  const toast = useToast();
  const router = useRouter();
  const uid = session?.user.id;
  const name = profile?.name;

  useEffect(() => {
    if (!uid || !name) return;
    let cancelled = false;
    const c = sb().channel('hub-lobby', { config: { presence: { key: uid }, broadcast: { self: false } } });
    chan.current = c;
    c.on('presence', { event: 'sync' }, () => {
      const st = c.presenceState<{ id: string; name: string; where: string; since: number }>();
      const list: OnlineUser[] = Object.values(st).map((metas) => metas[metas.length - 1]).filter(Boolean) as OnlineUser[];
      list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      setOnline(list);
    });
    c.on('broadcast', { event: 'invite' }, ({ payload }) => {
      if (payload?.to !== uid) return;
      const g = gameById(payload.game);
      toast.info(
        <span><b>{payload.fromName}</b> mời bạn chơi <b>{g?.name ?? payload.game}</b></span>,
        { ms: 15000, action: { label: 'Vào phòng', onClick: () => router.push(`/room/${payload.code}`) } },
      );
      sfx.notify();
    });
    realtimeReady().then(() => {
      if (cancelled) return;
      c.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await c.track({ id: uid, name, where: where.current, since: Date.now() });
      });
    });
    return () => {
      cancelled = true;
      sb().removeChannel(c);
      chan.current = null;
    };
    // toast/router are stable enough; re-subscribing on every render would spam presence
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, name]);

  const setWhere = useCallback((w: string) => {
    if (where.current === w) return;
    where.current = w;
    if (chan.current && uid && name) chan.current.track({ id: uid, name, where: w, since: Date.now() }).catch(() => {});
  }, [uid, name]);

  const invite = useCallback(async (toId: string, game: string, code: string) => {
    if (!chan.current) throw new Error('Chưa kết nối');
    await chan.current.send({ type: 'broadcast', event: 'invite', payload: { to: toId, fromName: name, game, code } });
  }, [name]);

  const value = useMemo(() => ({ online, setWhere, invite }), [online, setWhere, invite]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePresence() {
  return useContext(Ctx);
}

/** Mark what the current user is doing (shown in the online list). */
export function useWhere(where: string) {
  const { setWhere } = usePresence();
  useEffect(() => {
    setWhere(where);
  }, [where, setWhere]);
}
