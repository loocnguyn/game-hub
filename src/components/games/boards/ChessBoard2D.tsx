'use client';
import { useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type Square } from 'chess.js';
import { clsx } from 'clsx';
import type { BoardProps } from '../BoardRoom';

const THEMES = {
  neon: { light: '#dcd7f5', dark: '#7563d6', name: 'Neon' },
  wood: { light: '#f0d9b5', dark: '#b58863', name: 'Gỗ' },
  green: { light: '#eeeed2', dark: '#769656', name: 'Xanh' },
} as const;
type ThemeKey = keyof typeof THEMES;

function loadTheme(): ThemeKey {
  try {
    const t = localStorage.getItem('hub:chessTheme') as ThemeKey | null;
    return t && t in THEMES ? t : 'neon';
  } catch {
    return 'neon';
  }
}

export default function ChessBoard2D({ fen, mySide, canMove, lastMove, check, onMove, premove, onPremove, turn }: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [theme, setTheme] = useState<ThemeKey>(loadTheme);
  const game = useMemo(() => new Chess(fen), [fen]);
  const myColor = mySide === 0 ? 'w' : mySide === 1 ? 'b' : null;
  const isMyTurnColor = myColor !== null && game.turn() === myColor;

  const legalFrom = (sq: string) => (game.moves({ square: sq as Square, verbose: true }) as { to: string; promotion?: string }[]);

  function needsPromotion(from: string, to: string) {
    const p = game.get(from as Square);
    return p?.type === 'p' && ((p.color === 'w' && to[1] === '8') || (p.color === 'b' && to[1] === '1'));
  }

  function tryMove(from: string, to: string): boolean {
    if (canMove) {
      const legal = legalFrom(from).some((m) => m.to === to);
      if (!legal) return false;
      if (needsPromotion(from, to)) {
        setPromo({ from, to });
        return true;
      }
      onMove(from + to);
      return true;
    }
    // Premove: any pseudo-reasonable own-piece move while waiting for the opponent.
    if (onPremove && myColor && !isMyTurnColor) {
      const p = game.get(from as Square);
      if (p && p.color === myColor && from !== to) {
        onPremove(from + to + (needsPromotion(from, to) ? 'q' : ''));
        return false;
      }
    }
    return false;
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove && lastMove.length >= 4) {
    squareStyles[lastMove.slice(0, 2)] = { background: 'rgba(250, 204, 21, 0.42)' };
    squareStyles[lastMove.slice(2, 4)] = { background: 'rgba(250, 204, 21, 0.55)' };
  }
  if (premove) {
    squareStyles[premove.slice(0, 2)] = { background: 'rgba(34, 211, 238, 0.45)' };
    squareStyles[premove.slice(2, 4)] = { background: 'rgba(34, 211, 238, 0.6)' };
  }
  if (check) {
    const kingSq = game.board().flat().find((p) => p && p.type === 'k' && p.color === game.turn())?.square;
    if (kingSq) squareStyles[kingSq] = { background: 'radial-gradient(circle, rgba(239,68,68,0.95) 0%, rgba(239,68,68,0.5) 45%, transparent 75%)' };
  }
  if (selected) {
    squareStyles[selected] = { ...(squareStyles[selected] || {}), boxShadow: 'inset 0 0 0 4px rgba(34,211,238,0.9)' };
    for (const m of legalFrom(selected)) {
      const occupied = !!game.get(m.to as Square);
      squareStyles[m.to] = {
        ...(squareStyles[m.to] || {}),
        background: occupied
          ? 'radial-gradient(circle, transparent 58%, rgba(15,23,42,0.45) 60%)'
          : 'radial-gradient(circle, rgba(15,23,42,0.4) 22%, transparent 24%)',
      };
    }
  }

  const t = THEMES[theme];
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
        <Chessboard
          options={{
            id: 'hub-chess',
            position: fen,
            boardOrientation: mySide === 1 ? 'black' : 'white',
            animationDurationInMs: 180,
            allowDrawingArrows: true,
            darkSquareStyle: { backgroundColor: t.dark },
            lightSquareStyle: { backgroundColor: t.light },
            squareStyles,
            canDragPiece: ({ piece }) => !!myColor && piece.pieceType[0] === myColor && (canMove || !!onPremove),
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              setSelected(null);
              if (!targetSquare) return false;
              return tryMove(sourceSquare, targetSquare);
            },
            onSquareClick: ({ square, piece }) => {
              if (selected && selected !== square) {
                const ok = tryMove(selected, square);
                if (ok || !piece || piece.pieceType[0] !== myColor) {
                  setSelected(null);
                  return;
                }
              }
              if (piece && myColor && piece.pieceType[0] === myColor) setSelected(square === selected ? null : square);
              else setSelected(null);
              if (!piece && onPremove) onPremove(null);
            },
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted">
        Bàn:
        {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
          <button
            key={k}
            onClick={() => { setTheme(k); try { localStorage.setItem('hub:chessTheme', k); } catch { /* ignore */ } }}
            className={clsx('rounded-md px-2 py-0.5', theme === k ? 'bg-white/15 text-text' : 'hover:bg-white/10')}
          >
            {THEMES[k].name}
          </button>
        ))}
      </div>
      {promo && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-4 text-center">
            <div className="mb-3 font-semibold">Phong cấp thành</div>
            <div className="flex gap-2">
              {(['q', 'r', 'b', 'n'] as const).map((p) => (
                <button
                  key={p}
                  className="grid h-16 w-16 place-items-center rounded-xl bg-white/10 text-4xl hover:bg-white/20"
                  onClick={() => { onMove(promo.from + promo.to + p); setPromo(null); }}
                >
                  {{ q: turn === 0 ? '♕' : '♛', r: turn === 0 ? '♖' : '♜', b: turn === 0 ? '♗' : '♝', n: turn === 0 ? '♘' : '♞' }[p]}
                </button>
              ))}
            </div>
            <button className="mt-3 text-sm text-muted underline" onClick={() => setPromo(null)}>Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}
