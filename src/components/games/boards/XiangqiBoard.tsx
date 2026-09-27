'use client';
import { useMemo, useState } from 'react';
import { Xiangqi, iccsToSq, sqToIccs, isRed } from '@shared/xiangqi.ts';
import type { BoardProps } from '../BoardRoom';

const CHARS: Record<string, string> = {
  K: '帥', A: '仕', B: '相', N: '傌', R: '俥', C: '炮', P: '兵',
  k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒',
};
const VN: Record<string, string> = { k: 'Tướng', a: 'Sĩ', b: 'Tượng', n: 'Mã', r: 'Xe', c: 'Pháo', p: 'Tốt' };

const CELL = 60;
const PAD = 44;
const W = PAD * 2 + CELL * 8;
const H = PAD * 2 + CELL * 9;

export default function XiangqiBoard({ fen, mySide, canMove, lastMove, check, onMove }: BoardProps) {
  const [sel, setSel] = useState<number | null>(null);
  const game = useMemo(() => new Xiangqi(fen), [fen]);
  const flip = mySide === 1;
  const myColor = mySide === 0 ? 'r' : mySide === 1 ? 'b' : null;

  const pos = (sq: number) => {
    let r = Math.floor(sq / 9), c = sq % 9;
    if (flip) { r = 9 - r; c = 8 - c; }
    return { x: PAD + c * CELL, y: PAD + r * CELL };
  };
  const targets = sel !== null && canMove ? game.moves(sel).map((m) => m.to) : [];
  const last = lastMove && lastMove.length === 4 ? [iccsToSq(lastMove.slice(0, 2)), iccsToSq(lastMove.slice(2))] : [];
  const kingInCheck = check ? game.kingSquare(game.turn) : -1;

  function click(sq: number) {
    const p = game.board[sq];
    if (sel !== null && targets.includes(sq)) {
      onMove(sqToIccs(sel) + sqToIccs(sq));
      setSel(null);
      return;
    }
    if (p && myColor && (isRed(p) ? 'r' : 'b') === myColor) setSel(sq === sel ? null : sq);
    else setSel(null);
  }

  const lines: React.ReactNode[] = [];
  for (let r = 0; r < 10; r++) lines.push(<line key={`h${r}`} x1={PAD} y1={PAD + r * CELL} x2={PAD + 8 * CELL} y2={PAD + r * CELL} />);
  for (let c = 0; c < 9; c++) {
    if (c === 0 || c === 8) lines.push(<line key={`v${c}`} x1={PAD + c * CELL} y1={PAD} x2={PAD + c * CELL} y2={PAD + 9 * CELL} />);
    else {
      lines.push(<line key={`vt${c}`} x1={PAD + c * CELL} y1={PAD} x2={PAD + c * CELL} y2={PAD + 4 * CELL} />);
      lines.push(<line key={`vb${c}`} x1={PAD + c * CELL} y1={PAD + 5 * CELL} x2={PAD + c * CELL} y2={PAD + 9 * CELL} />);
    }
  }
  // palaces
  for (const r0 of [0, 7]) {
    lines.push(<line key={`p1${r0}`} x1={PAD + 3 * CELL} y1={PAD + r0 * CELL} x2={PAD + 5 * CELL} y2={PAD + (r0 + 2) * CELL} />);
    lines.push(<line key={`p2${r0}`} x1={PAD + 5 * CELL} y1={PAD + r0 * CELL} x2={PAD + 3 * CELL} y2={PAD + (r0 + 2) * CELL} />);
  }

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" style={{ background: 'linear-gradient(135deg, #f1d9a7, #e3bf7e)' }}>
        <defs>
          <radialGradient id="xq-piece" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#fff7e3" />
            <stop offset="70%" stopColor="#f2dcaa" />
            <stop offset="100%" stopColor="#c9a86a" />
          </radialGradient>
          <filter id="xq-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodOpacity="0.45" />
          </filter>
        </defs>
        <rect x={PAD - 8} y={PAD - 8} width={CELL * 8 + 16} height={CELL * 9 + 16} fill="none" stroke="#6b3f14" strokeWidth={3} />
        <g stroke="#6b3f14" strokeWidth={1.6}>{lines}</g>
        <text x={W / 2} y={PAD + 4.5 * CELL} textAnchor="middle" dominantBaseline="middle" fontSize={26} fill="#6b3f14" opacity={0.7} style={{ fontFamily: 'serif', letterSpacing: 18 }}>
          {flip ? '漢 界　　楚 河' : '楚 河　　漢 界'}
        </text>
        {last.map((sq, i) => {
          const { x, y } = pos(sq);
          return <rect key={i} x={x - 29} y={y - 29} width={58} height={58} rx={8} fill="#22d3ee" opacity={i ? 0.35 : 0.2} />;
        })}
        {Array.from({ length: 90 }, (_, sq) => {
          const { x, y } = pos(sq);
          return <rect key={`hit${sq}`} x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} fill="transparent" onClick={() => click(sq)} style={{ cursor: 'pointer' }} />;
        })}
        {game.board.map((p, sq) => {
          if (!p) return null;
          const { x, y } = pos(sq);
          const red = isRed(p);
          const selected = sel === sq;
          const inCheck = sq === kingInCheck;
          return (
            <g key={`${sq}${p}`} transform={`translate(${x},${y})`} onClick={() => click(sq)} style={{ cursor: 'pointer', transition: 'transform 0.2s' }} filter="url(#xq-shadow)">
              <title>{VN[p.toLowerCase()]}</title>
              {inCheck && <circle r={30} fill="#ef4444" opacity={0.55} />}
              <circle r={26} fill="url(#xq-piece)" stroke={selected ? '#0891b2' : '#7c4a1a'} strokeWidth={selected ? 4 : 2} />
              <circle r={21} fill="none" stroke={red ? '#b91c1c' : '#1f2937'} strokeWidth={1.8} />
              <text textAnchor="middle" dominantBaseline="central" fontSize={25} fontWeight={700} fill={red ? '#b91c1c' : '#111827'} style={{ fontFamily: '"KaiTi","STKaiti","Noto Serif SC","SimSun",serif', pointerEvents: 'none' }}>
                {CHARS[p]}
              </text>
            </g>
          );
        })}
        {targets.map((sq) => {
          const { x, y } = pos(sq);
          const cap = !!game.board[sq];
          return cap
            ? <circle key={`t${sq}`} cx={x} cy={y} r={29} fill="none" stroke="#0891b2" strokeWidth={4} opacity={0.85} pointerEvents="none" />
            : <circle key={`t${sq}`} cx={x} cy={y} r={9} fill="#0891b2" opacity={0.75} pointerEvents="none" />;
        })}
      </svg>
    </div>
  );
}
