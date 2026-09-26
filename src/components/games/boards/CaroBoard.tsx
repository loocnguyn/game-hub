'use client';
import { useMemo, useState } from 'react';
import { Caro } from '@shared/caro.ts';
import type { BoardProps } from '../BoardRoom';

export default function CaroBoard({ moves, settings, canMove, mySide, lastMove, onMove }: BoardProps) {
  const size = settings.caro?.size ?? 15;
  const game = useMemo(() => Caro.replay({ size, blockTwoEnds: !!settings.caro?.blockTwoEnds }, moves.map(Number)), [moves, size, settings.caro?.blockTwoEnds]);
  const [hover, setHover] = useState<number | null>(null);
  const win = new Set(game.winLine);
  const last = lastMove !== null ? Number(lastMove) : -1;
  const mine = mySide === 0 ? 1 : 2;

  return (
    <div
      className="grid aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d1024] p-2 shadow-[0_30px_80px_-30px_rgba(56,189,248,0.6)]"
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: size * size }, (_, i) => {
        const v = game.board[i];
        const isWin = win.has(i);
        const showGhost = !v && canMove && hover === i;
        return (
          <button
            key={i}
            aria-label={`Ô ${i}`}
            disabled={!canMove || v !== 0}
            onMouseEnter={() => setHover(i)}
            onClick={() => onMove(String(i))}
            className="relative grid place-items-center border-[0.5px] border-white/[0.07] transition-colors hover:bg-white/[0.04] disabled:cursor-default"
            style={{ background: isWin ? 'rgba(250,204,21,0.18)' : i === last ? 'rgba(255,255,255,0.07)' : undefined }}
          >
            {(v || showGhost) && (
              <span
                className="font-display select-none leading-none"
                style={{
                  fontSize: `min(${60 / size}vmin, ${640 / size}px)`,
                  fontWeight: 800,
                  color: (v || mine) === 1 ? '#38bdf8' : '#f472b6',
                  textShadow: `0 0 12px ${(v || mine) === 1 ? '#38bdf8' : '#f472b6'}`,
                  opacity: showGhost ? 0.3 : 1,
                  animation: i === last ? 'pop-in 0.18s ease-out' : undefined,
                }}
              >
                {(v || mine) === 1 ? '✕' : '◯'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
