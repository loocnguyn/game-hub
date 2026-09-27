'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { clsx } from 'clsx';
import type { TetrisRoomState } from '@shared/tetrisroom.ts';
import { marginMultiplier } from '@shared/tetrisroom.ts';
import type { EngineOptions, TetrisEngine, TetrisEvent } from '@shared/tetris.ts';
import { useAuth } from '@/lib/auth';
import { sb } from '@/lib/supabase';
import { serverNow } from '@/lib/api';
import { sfx } from '@/lib/sfx';
import type { useRoom } from '@/lib/useRoom';
import { Avatar, Button, Panel, formatMs, useToast } from '@/components/ui';
import { InvitePanel, reasonText, ResultModal, useNow } from '@/components/room/common';
import { useTetrisLoop } from './useTetrisLoop';
import { Playfield, popupFor } from './Playfield';
import { SnapshotBoard, snapshot, type BoardSnapshot } from './Board2D';
import { loadHandling, loadRender, toFrames } from './controls';

type Room = ReturnType<typeof useRoom<TetrisRoomState>>;

interface OppInfo {
  snap: BoardSnapshot | null;
  score: number;
  lines: number;
  attack: number;
  pending: number;
}

export default function TetrisVersus({ room }: { room: Room }) {
  const s = room.state!;
  const code = room.view!.code;
  const { profile } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const mySide = s.seats[0]?.id === profile?.id ? 0 : s.seats[1]?.id === profile?.id ? 1 : null;
  const oppSide = mySide === null ? null : mySide === 0 ? 1 : 0;
  const now = useNow(true, 100);
  const [render] = useState(() => loadRender().mode);
  const [popup, setPopup] = useState<{ id: number; text: string; sub?: string; color: string } | null>(null);
  const [opp, setOpp] = useState<OppInfo>({ snap: null, score: 0, lines: 0, attack: 0, pending: 0 });
  const [spectate, setSpectate] = useState<Record<number, OppInfo>>({});
  const [resultOpen, setResultOpen] = useState(false);
  const [dead, setDead] = useState(false);
  const sceneEvents = useRef<TetrisEvent[]>([]);
  const chan = useRef<RealtimeChannel | null>(null);
  const finalSent = useRef<number>(-1);
  const prevStatus = useRef(s.status);

  const playing = s.status === 'playing' && mySide !== null;
  const started = s.startAt !== null && now >= s.startAt;
  const timeUp = s.settings.mode === 'blitz' && s.endAt !== null && now >= s.endAt;

  // One engine per round (same seed for both players).
  const options = useMemo<EngineOptions | null>(
    () => (playing ? { seed: s.seed, mode: 'versus', handling: toFrames(loadHandling()) } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playing, s.round, s.seed],
  );
  useEffect(() => setDead(false), [s.round, s.seed]);

  const report = useCallback(async (body: Record<string, unknown>) => {
    try {
      await room.act('report', { round: s.round, ...body });
    } catch (e) {
      console.warn(e);
    }
  }, [room, s.round]);

  const onEvents = useCallback((events: TetrisEvent[], eng: TetrisEngine) => {
    sceneEvents.current.push(...events);
    for (const e of events) {
      if (e.t === 'harddrop') sfx.drop();
      else if (e.t === 'rotate') sfx.rotate();
      else if (e.t === 'move') sfx.move();
      else if (e.t === 'hold') sfx.hold();
      else if (e.t === 'garbage') sfx.garbage();
      else if (e.t === 'clear') { if (e.lines === 4) sfx.tetris(); else if (e.tspin) sfx.tspin(); else sfx.clear(e.lines); }
      const p = popupFor(e);
      if (p) setPopup({ id: Date.now() + Math.random(), ...p });
    }
    if (eng.over) {
      sfx.gameOver();
      const stats = { attack: eng.stats.attack, lines: eng.lines, score: eng.score, pieces: eng.stats.pieces };
      chan.current?.send({ type: 'broadcast', event: 'ko', payload: { side: mySide } });
      report({ died: true, stats });
      if (s.settings.mode === 'blitz') {
        setPopup({ id: Date.now(), text: 'BỊ KO!', color: '#f87171' });
        eng.revive();
      } else {
        setDead(true);
      }
    }
  }, [mySide, report, s.settings.mode]);

  const onFrame = useCallback((eng: TetrisEngine) => {
    eng.garbageMultiplier = marginMultiplier(s, serverNow());
    const out = eng.drainOutgoing();
    for (const n of out) chan.current?.send({ type: 'broadcast', event: 'atk', payload: { side: mySide, n, round: s.round } });
  }, [s, mySide]);

  const loop = useTetrisLoop({ options, paused: !playing || !started || timeUp || dead, onEvents, onFrame });

  // Realtime channel: attacks, KOs and board snapshots.
  useEffect(() => {
    const c = sb().channel(`tetris:${code}`, { config: { broadcast: { self: false } } });
    c.on('broadcast', { event: 'atk' }, ({ payload }) => {
      if (payload.side === mySide || payload.round !== s.round) return;
      loop.engine.current?.receiveGarbage(Number(payload.n) || 0);
      sfx.garbage();
    });
    c.on('broadcast', { event: 'snap' }, ({ payload }) => {
      if (payload.side === oppSide) setOpp(payload.info);
      if (mySide === null) setSpectate((x) => ({ ...x, [payload.side]: payload.info }));
    });
    c.on('broadcast', { event: 'ko' }, ({ payload }) => {
      if (payload.side !== mySide) setPopup({ id: Date.now(), text: 'KO!', sub: 'Đối thủ bị tràn', color: '#4ade80' });
    });
    c.subscribe();
    chan.current = c;
    return () => { sb().removeChannel(c); chan.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, mySide, oppSide, s.round]);

  // Send our board ~10 times per second.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const eng = loop.engine.current;
      if (!eng || !chan.current) return;
      const info: OppInfo = { snap: snapshot(eng), score: eng.score, lines: eng.lines, attack: eng.stats.attack, pending: eng.totalPending() };
      chan.current.send({ type: 'broadcast', event: 'snap', payload: { side: mySide, info } });
    }, 100);
    return () => clearInterval(id);
  }, [playing, mySide, loop.engine]);

  // Blitz: send final stats once time is up.
  useEffect(() => {
    if (!playing || !timeUp || finalSent.current === s.round) return;
    finalSent.current = s.round;
    const eng = loop.engine.current;
    const stats = eng ? { attack: eng.stats.attack, lines: eng.lines, score: eng.score, pieces: eng.stats.pieces } : undefined;
    report({ final: true, stats });
  }, [playing, timeUp, s.round, report, loop.engine]);

  useEffect(() => {
    if (!popup) return;
    const id = setTimeout(() => setPopup(null), 1300);
    return () => clearTimeout(id);
  }, [popup]);

  useEffect(() => {
    if (prevStatus.current !== 'finished' && s.status === 'finished') {
      setResultOpen(true);
      if (s.result?.winner === mySide) sfx.win(); else sfx.gameOver();
    }
    prevStatus.current = s.status;
  }, [s.status, s.result, mySide]);

  useEffect(() => {
    if (s.nextCode) router.push(`/room?code=${s.nextCode}`);
  }, [s.nextCode, router]);

  const act = async (action: string, params: Record<string, unknown> = {}) => {
    try { await room.act(action, params); } catch (e) { toast.err((e as Error).message); }
  };

  // Scores: KOs I scored = opponent deaths.
  const kos = (side: 0 | 1) => s.deaths[side === 0 ? 1 : 0];
  const countdown = s.startAt !== null && now < s.startAt ? Math.ceil((s.startAt - now) / 1000) : 0;
  const remaining = s.endAt !== null ? Math.max(0, s.endAt - Math.max(now, s.startAt ?? 0)) : null;

  const header = (
    <Panel className="flex flex-wrap items-center justify-between gap-4 px-5 py-3">
      {[0, 1].map((side) => {
        const seat = s.seats[side];
        return (
          <div key={side} className={clsx('flex items-center gap-3', side === 1 && 'order-3 flex-row-reverse text-right')}>
            {seat ? <Avatar name={seat.name} size={40} /> : <div className="h-10 w-10 rounded-full border-2 border-dashed border-white/20" />}
            <div>
              <div className="font-semibold">{seat?.name ?? 'Đang chờ…'}{side === mySide && <span className="ml-1 text-xs text-dim">(bạn)</span>}</div>
              <div className="text-xs text-muted">
                {s.status === 'waiting' ? (s.ready[side] ? <span className="text-emerald-300">Sẵn sàng</span> : 'Chưa sẵn sàng')
                  : s.settings.mode === 'blitz' ? `${kos(side as 0 | 1)} KO` : `${s.roundWins[side]} ván thắng`}
              </div>
            </div>
          </div>
        );
      })}
      <div className="order-2 text-center">
        <div className="font-display text-3xl font-bold tabular-nums">
          {s.settings.mode === 'blitz'
            ? (s.status === 'playing' && remaining !== null ? formatMs(remaining) : `${s.settings.duration / 60}:00`)
            : `${s.roundWins[0]} – ${s.roundWins[1]}`}
        </div>
        <div className="text-xs text-muted">
          {s.settings.mode === 'blitz' ? 'Tính giờ · đếm KO' : `Hạ gục · chạm ${s.settings.firstTo}${s.status === 'playing' ? ` · ván ${s.round}` : ''}`}
          {s.settings.rated ? ' · rating' : ''}
        </div>
      </div>
    </Panel>
  );

  if (s.status === 'waiting') {
    const me = mySide;
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        {header}
        <div className="grid gap-5 md:grid-cols-[1fr_340px]">
          <Panel className="grid place-items-center p-10 text-center">
            <div>
              <div className="font-display text-2xl font-bold">{s.seats[0] && s.seats[1] ? 'Hai bên bấm sẵn sàng để bắt đầu' : 'Đang chờ đối thủ vào phòng'}</div>
              <p className="mt-2 text-muted">{s.settings.mode === 'blitz' ? `Đấu ${s.settings.duration / 60} phút, ai hạ đối thủ nhiều lần hơn thắng.` : `Ai thắng ${s.settings.firstTo} ván trước thì thắng trận.`}</p>
              {me !== null && (
                <div className="mt-6 flex justify-center gap-2">
                  <Button size="lg" variant={s.ready[me] ? 'ghost' : 'primary'} disabled={!s.seats[0] || !s.seats[1]} onClick={() => act('ready', { ready: !s.ready[me] })}>
                    {s.ready[me] ? 'Hủy sẵn sàng' : 'Sẵn sàng'}
                  </Button>
                  <Button size="lg" variant="ghost" onClick={async () => { await room.leave(); router.push('/tetris'); }}>Rời phòng</Button>
                </div>
              )}
            </div>
          </Panel>
          <InvitePanel code={code} game="tetris" />
        </div>
      </div>
    );
  }

  const overlay = mySide === null ? null
    : countdown > 0 ? <div className="font-display text-8xl font-black text-accent">{countdown}</div>
    : dead && s.status === 'playing' ? <div className="text-center"><div className="font-display text-3xl font-bold text-rose-300">Thua ván này</div><div className="mt-1 text-muted">Chờ ván tiếp theo…</div></div>
    : timeUp && s.status === 'playing' ? <div className="font-display text-3xl font-bold">Hết giờ!</div>
    : s.status === 'finished' ? <div className="text-center"><div className="font-display text-3xl font-bold">{s.result?.winner === null ? 'Hòa' : s.result?.winner === mySide ? 'Bạn thắng!' : 'Bạn thua'}</div></div>
    : null;

  const resultTitle = !s.result ? '' : s.result.winner === null ? 'Hòa' : mySide === null ? `${s.seats[s.result.winner]?.name} thắng` : s.result.winner === mySide ? 'Bạn thắng!' : 'Bạn thua';
  const rematchState = mySide === null ? 'none' : s.rematch[mySide] ? 'sent' : s.rematch[mySide === 0 ? 1 : 0] ? 'incoming' : 'none';

  return (
    <div className="space-y-4">
      {header}
      {mySide !== null ? (
        <div className="flex flex-wrap items-start justify-center gap-6">
          <Playfield engine={loop.engine} version={loop.version} mode={render} eventsForScene={sceneEvents} popup={popup} garbage={loop.engine.current?.totalPending() ?? 0} overlay={overlay} />
          <div className="flex flex-col items-center gap-2">
            <div className="text-sm font-semibold text-muted">{s.seats[oppSide!]?.name}</div>
            <div className="relative">
              <SnapshotBoard snap={opp.snap} className="h-[min(56vh,500px)] w-auto rounded-xl border border-white/10" />
              <div className="absolute -left-2.5 bottom-0 top-[9%] w-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="absolute bottom-0 w-full rounded-full bg-red-500" style={{ height: `${Math.min(100, (opp.pending / 20) * 100)}%` }} />
              </div>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-white/5 py-1.5"><div className="text-dim">Điểm</div><div className="font-bold">{opp.score.toLocaleString('vi-VN')}</div></div>
              <div className="rounded-lg bg-white/5 py-1.5"><div className="text-dim">Hàng</div><div className="font-bold">{opp.lines}</div></div>
              <div className="rounded-lg bg-white/5 py-1.5"><div className="text-dim">Rác gửi</div><div className="font-bold">{opp.attack}</div></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-8">
          {[0, 1].map((side) => (
            <div key={side} className="flex flex-col items-center gap-2">
              <div className="font-semibold">{s.seats[side]?.name}</div>
              <SnapshotBoard snap={spectate[side]?.snap ?? null} className="h-[min(70vh,620px)] w-auto rounded-xl border border-white/10" />
              <div className="text-sm text-muted">{(spectate[side]?.score ?? 0).toLocaleString('vi-VN')} điểm · {spectate[side]?.attack ?? 0} rác</div>
            </div>
          ))}
        </div>
      )}
      {s.status === 'finished' && mySide !== null && (
        <div className="flex justify-center gap-2">
          <Button onClick={() => act('rematch')} disabled={rematchState === 'sent'}>{rematchState === 'sent' ? 'Đang chờ đối thủ…' : rematchState === 'incoming' ? 'Đồng ý đấu lại' : 'Đấu lại'}</Button>
          <Button variant="ghost" onClick={() => router.push('/tetris')}>Về sảnh Tetris</Button>
        </div>
      )}
      <ResultModal
        open={resultOpen && s.status === 'finished'}
        title={resultTitle}
        subtitle={s.result ? reasonText(s.result.reason) : undefined}
        delta={mySide !== null && s.ratingDelta ? s.ratingDelta[mySide] : null}
        onRematch={mySide !== null ? () => act('rematch') : undefined}
        rematchState={rematchState}
        onClose={() => setResultOpen(false)}
        lobbyHref="/tetris"
      />
    </div>
  );
}
