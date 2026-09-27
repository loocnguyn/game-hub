'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { TetrisEngine, TetrisEvent, Piece } from '@shared/tetris.ts';
import { LiveBoard2D, MiniPiece } from './Board2D';

const TetrisScene = dynamic(() => import('./TetrisScene'), { ssr: false });

export interface Hud {
  score: number;
  lines: number;
  level: number;
  hold: Piece | null;
  holdUsed: boolean;
  next: Piece[];
  pieces: number;
  attack: number;
  frame: number;
  pending: number;
  combo: number;
  b2b: number;
}

export function readHud(e: TetrisEngine): Hud {
  return {
    score: e.score, lines: e.lines, level: e.level, hold: e.hold, holdUsed: e.holdUsed, next: e.nextPieces(5),
    pieces: e.stats.pieces, attack: e.stats.attack, frame: e.frame, pending: e.totalPending(), combo: e.combo, b2b: e.b2b,
  };
}

const LINE_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

export function popupFor(e: TetrisEvent): { text: string; sub?: string; color: string } | null {
  if (e.t === 'tspin') return { text: e.mini ? 'MINI T-SPIN' : 'T-SPIN', color: '#c084fc' };
  if (e.t !== 'clear') return null;
  let text = LINE_NAMES[e.lines];
  let color = e.lines === 4 ? '#22d3ee' : '#e2e8f0';
  if (e.tspin) { text = `${e.mini ? 'MINI ' : ''}T-SPIN ${text}`; color = '#c084fc'; }
  if (e.pc) { text = 'PERFECT CLEAR'; color = '#facc15'; }
  const subs: string[] = [];
  if (e.b2b) subs.push('BACK-TO-BACK');
  if (e.combo > 0) subs.push(`${e.combo} COMBO`);
  if (e.lines < 4 && !e.tspin && !e.pc && e.combo < 1) return null;
  return { text, sub: subs.join(' · ') || undefined, color };
}

export function Playfield({
  engine, version, mode, eventsForScene, popup, garbage, overlay, compact, sideExtra,
}: {
  engine: React.RefObject<TetrisEngine | null>;
  version: number;
  mode: '3d' | '2d';
  eventsForScene: React.RefObject<TetrisEvent[]>;
  popup: { id: number; text: string; sub?: string; color: string } | null;
  garbage?: number;
  overlay?: ReactNode;
  compact?: boolean;
  sideExtra?: ReactNode;
}) {
  const [hud, setHud] = useState<Hud | null>(null);
  const lastLevel = useRef(1);
  useEffect(() => {
    const id = setInterval(() => {
      if (engine.current) setHud(readHud(engine.current));
    }, 80);
    return () => clearInterval(id);
  }, [engine, version]);
  if (hud) lastLevel.current = hud.level;
  const secs = (hud?.frame ?? 0) / 60;
  const pps = secs > 0 ? (hud!.pieces / secs).toFixed(2) : '0.00';
  const apm = secs > 0 ? ((hud!.attack / secs) * 60).toFixed(1) : '0.0';

  return (
    <div className={clsx('flex items-start justify-center gap-3 sm:gap-5', compact && 'scale-[0.92]')}>
      {/* left: hold + stats */}
      <div className="flex w-[104px] flex-col gap-3 sm:w-[128px]">
        <div className="glass rounded-2xl p-3">
          <div className="text-[11px] font-bold uppercase tracking-widest text-muted">Giữ</div>
          <div className="mt-2 grid place-items-center"><MiniPiece piece={hud?.hold ?? null} dim={hud?.holdUsed} /></div>
        </div>
        <div className="glass space-y-2.5 rounded-2xl p-3 text-sm">
          <Stat label="Điểm" value={(hud?.score ?? 0).toLocaleString('vi-VN')} big />
          <Stat label="Hàng" value={hud?.lines ?? 0} />
          <Stat label="Level" value={hud?.level ?? 1} />
          <Stat label="Thời gian" value={`${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`} />
          <Stat label="PPS" value={pps} />
          <Stat label="APM" value={apm} />
        </div>
        {sideExtra}
      </div>

      {/* center: board */}
      <div className="relative">
        {typeof garbage === 'number' && (
          <div className="absolute -left-3 bottom-0 top-[9%] w-2 overflow-hidden rounded-full bg-white/5">
            <motion.div className="absolute bottom-0 w-full rounded-full bg-gradient-to-t from-red-600 to-orange-400 shadow-[0_0_12px_rgba(239,68,68,0.9)]" animate={{ height: `${Math.min(100, (garbage / 20) * 100)}%` }} />
          </div>
        )}
        <div className={clsx('relative overflow-hidden rounded-2xl border border-white/10 bg-black/60', mode === '3d' ? 'h-[min(78vh,720px)] w-[min(44vh,400px)]' : 'h-[min(78vh,720px)] w-[min(35.5vh,327px)]')}>
          {mode === '3d'
            ? <TetrisScene engine={engine} events={eventsForScene} level={lastLevel.current} />
            : <LiveBoard2D engine={engine} className="h-full w-full" />}
          <AnimatePresence>
            {popup && (
              <motion.div
                key={popup.id}
                initial={{ opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="pointer-events-none absolute inset-x-0 top-[38%] text-center"
              >
                <div className="font-display text-3xl font-black tracking-wider" style={{ color: popup.color, textShadow: `0 0 24px ${popup.color}` }}>{popup.text}</div>
                {popup.sub && <div className="font-display mt-1 text-sm font-bold tracking-widest text-amber-200">{popup.sub}</div>}
              </motion.div>
            )}
          </AnimatePresence>
          {overlay && <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[3px]">{overlay}</div>}
        </div>
      </div>

      {/* right: next queue */}
      <div className="glass w-[104px] rounded-2xl p-3 sm:w-[128px]">
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted">Kế tiếp</div>
        <div className="mt-2 flex flex-col items-center gap-3">
          {(hud?.next ?? []).map((p, i) => (
            <div key={i} className={clsx(i > 0 && 'opacity-70')}><MiniPiece piece={p} size={i === 0 ? 24 : 18} /></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: ReactNode; big?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-dim">{label}</div>
      <div className={clsx('font-display font-bold tabular-nums', big ? 'text-xl text-accent' : 'text-base')}>{value}</div>
    </div>
  );
}
