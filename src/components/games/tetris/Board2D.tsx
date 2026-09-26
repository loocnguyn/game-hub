'use client';
import { useEffect, useRef } from 'react';
import { H, SHAPES, W, type Piece, type TetrisEngine } from '@shared/tetris.ts';
import { PIECE_COLORS } from './TetrisScene';

export const ROWS = 22;
const FIRST = H - ROWS;
const PIECE_ID: Record<Piece, number> = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };

export interface BoardSnapshot {
  board: string; // W*ROWS chars '0'..'8'
  cur?: { id: number; cells: [number, number][] } | null;
  ghost?: [number, number][] | null;
}

export function snapshot(eng: TetrisEngine): BoardSnapshot {
  let board = '';
  for (let y = FIRST; y < H; y++) for (let x = 0; x < W; x++) board += eng.board[y * W + x];
  const cur = eng.cur && !eng.over ? { id: PIECE_ID[eng.cur.type], cells: eng.cells() } : null;
  const ghost = eng.cur && !eng.over ? eng.cells({ ...eng.cur, y: eng.ghostY() }) : null;
  return { board, cur, ghost };
}

function drawCell(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, alpha = 1) {
  const px = x * s, py = y * s;
  g.globalAlpha = alpha;
  const grad = g.createLinearGradient(px, py, px + s, py + s);
  grad.addColorStop(0, color);
  grad.addColorStop(1, shade(color, -0.35));
  g.fillStyle = grad;
  g.shadowColor = color;
  g.shadowBlur = alpha < 1 ? 0 : s * 0.5;
  const r = s * 0.16;
  g.beginPath();
  g.roundRect(px + 1.5, py + 1.5, s - 3, s - 3, r);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(px + s * 0.18, py + s * 0.14, s * 0.64, s * 0.1);
  g.globalAlpha = 1;
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + c * amt)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export function drawBoard(canvas: HTMLCanvasElement, snap: BoardSnapshot, danger = false) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const s = canvas.width / W;
  g.clearRect(0, 0, canvas.width, canvas.height);
  // grid
  g.fillStyle = danger ? 'rgba(80, 10, 20, 0.55)' : 'rgba(8, 8, 24, 0.9)';
  g.fillRect(0, 2 * s, canvas.width, canvas.height - 2 * s);
  g.strokeStyle = 'rgba(255,255,255,0.045)';
  g.lineWidth = 1;
  for (let x = 1; x < W; x++) { g.beginPath(); g.moveTo(x * s, 2 * s); g.lineTo(x * s, canvas.height); g.stroke(); }
  for (let y = 3; y < ROWS; y++) { g.beginPath(); g.moveTo(0, y * s); g.lineTo(canvas.width, y * s); g.stroke(); }
  for (let i = 0; i < snap.board.length; i++) {
    const v = snap.board.charCodeAt(i) - 48;
    if (v > 0) drawCell(g, i % W, Math.floor(i / W), s, PIECE_COLORS[v]);
  }
  if (snap.ghost) for (const [x, y] of snap.ghost) if (y >= FIRST) {
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.strokeRect(x * s + 3, (y - FIRST) * s + 3, s - 6, s - 6);
  }
  if (snap.cur) for (const [x, y] of snap.cur.cells) if (y >= FIRST) drawCell(g, x, y - FIRST, s, PIECE_COLORS[snap.cur.id]);
}

/** Canvas board that re-draws from a live engine every animation frame. */
export function LiveBoard2D({ engine, className }: { engine: React.RefObject<TetrisEngine | null>; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const eng = engine.current;
      if (eng && ref.current) drawBoard(ref.current, snapshot(eng));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);
  return <canvas ref={ref} width={300} height={660} className={className} />;
}

/** Canvas board drawn from a snapshot (opponent view). */
export function SnapshotBoard({ snap, className, danger }: { snap: BoardSnapshot | null; className?: string; danger?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawBoard(ref.current, snap ?? { board: '0'.repeat(W * ROWS) }, danger);
  }, [snap, danger]);
  return <canvas ref={ref} width={200} height={440} className={className} />;
}

export function MiniPiece({ piece, dim, size = 22 }: { piece: Piece | null; dim?: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    if (!piece) return;
    const cells = SHAPES[piece][0];
    const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = (4 - w) / 2 - Math.min(...xs), oy = (2 - h) / 2 - Math.min(...ys);
    for (const [x, y] of cells) drawCell(g, x + ox, y + oy, size, dim ? '#475569' : PIECE_COLORS[PIECE_ID[piece]]);
  }, [piece, dim, size]);
  return <canvas ref={ref} width={size * 4} height={size * 2} />;
}
