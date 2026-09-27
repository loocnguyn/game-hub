'use client';
import { useMemo, useState } from 'react';
import { Dots } from '@shared/dots.ts';
import type { BoardProps } from '../BoardRoom';

export default function DotsBoard({ moves, settings, canMove, lastMove, onMove, colors }: BoardProps & { colors: [string, string] }) {
  const n = settings.dots?.size ?? 4;
  const game = useMemo(() => Dots.replay(n, moves.map(Number)), [moves, n]);
  const [hover, setHover] = useState<number | null>(null);
  const G = 100;
  const P = 40;
  const size = P * 2 + G * n;
  const last = lastMove !== null ? Number(lastMove) : -1;

  const lineGeom = (l: number) => {
    if (l < game.hCount) {
      const r = Math.floor(l / n), c = l % n;
      return { x1: P + c * G, y1: P + r * G, x2: P + (c + 1) * G, y2: P + r * G };
    }
    const k = l - game.hCount;
    const r = Math.floor(k / (n + 1)), c = k % (n + 1);
    return { x1: P + c * G, y1: P + r * G, x2: P + c * G, y2: P + (r + 1) * G };
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d1f]">
      <svg viewBox={`0 0 ${size} ${size}`} className="block h-auto w-full select-none">
        {Array.from({ length: n * n }, (_, i) => {
          const owner = game.boxes[i];
          if (!owner) return null;
          const r = Math.floor(i / n), c = i % n;
          const col = colors[owner - 1];
          return (
            <g key={`b${i}`}>
              <rect x={P + c * G + 6} y={P + r * G + 6} width={G - 12} height={G - 12} rx={10} fill={col} opacity={0.28} />
              <text x={P + c * G + G / 2} y={P + r * G + G / 2} textAnchor="middle" dominantBaseline="central" fontSize={32} fontWeight={800} fill={col}>
                {owner === 1 ? 'A' : 'B'}
              </text>
            </g>
          );
        })}
        {Array.from({ length: game.lines.length }, (_, l) => {
          const g = lineGeom(l);
          const owner = game.lines[l];
          const isHover = hover === l && !owner && canMove;
          return (
            <g key={`l${l}`}>
              <line {...g} stroke={owner ? colors[owner - 1] : isHover ? '#ffffff' : 'rgba(255,255,255,0.07)'} strokeWidth={owner ? 9 : 7} strokeLinecap="round"
                style={owner ? { filter: `drop-shadow(0 0 ${l === last ? 10 : 4}px ${colors[owner - 1]})` } : undefined} opacity={isHover ? 0.6 : 1} />
              {!owner && canMove && (
                <line {...g} stroke="transparent" strokeWidth={30} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover(l)} onMouseLeave={() => setHover(null)} onClick={() => onMove(String(l))} />
              )}
            </g>
          );
        })}
        {Array.from({ length: (n + 1) * (n + 1) }, (_, i) => {
          const r = Math.floor(i / (n + 1)), c = i % (n + 1);
          return <circle key={`d${i}`} cx={P + c * G} cy={P + r * G} r={8} fill="#e2e8f0" style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.6))' }} pointerEvents="none" />;
        })}
      </svg>
    </div>
  );
}
