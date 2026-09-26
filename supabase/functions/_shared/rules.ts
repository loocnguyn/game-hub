// Rule adapters that let the generic board-room logic drive chess, xiangqi and caro the same way.
// Moves are strings: chess UCI ("e2e4", "e7e8q"), xiangqi ICCS ("h2e2"), caro cell index ("112").
import { Chess } from 'chess.js';
import { Xiangqi, parseIccs, XQ_START_FEN } from './xiangqi.ts';
import { Caro, caroNotation, CARO_SIZES } from './caro.ts';
import { Dots, DOTS_SIZES } from './dots.ts';

export type BoardGame = 'chess' | 'xiangqi' | 'caro' | 'dots';
export type Side = 0 | 1; // 0 moves first (white / red / X)

export interface GameOutcome {
  winner: Side | null;
  reason: string;
}
export interface MoveResult {
  fen: string;
  san: string;
  check: boolean;
  over: GameOutcome | null;
  /** Who moves next; defaults to the other side (dots keeps the turn after completing a box). */
  nextTurn?: Side;
}
export interface CaroSettings {
  size: number;
  blockTwoEnds: boolean;
}
export interface DotsSettings {
  size: number;
}
export interface VariantSettings {
  caro?: CaroSettings;
  dots?: DotsSettings;
}

export interface Rules {
  initialFen(v: VariantSettings): string;
  /** Replays `history` from the start, then tries `move`. Returns null when the move is illegal. */
  play(history: string[], move: string, v: VariantSettings): MoveResult | null;
  /** False when `side` cannot possibly win from position `fen` (used when the opponent flags). */
  canWin(fen: string, side: Side): boolean;
}

// ---------- chess ----------
function parseUci(m: string) {
  if (typeof m !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)) return null;
  return { from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] };
}
function chessFromHistory(history: string[]): Chess {
  const c = new Chess();
  for (const m of history) {
    const p = parseUci(m);
    if (!p) throw new Error('corrupt history');
    c.move(p);
  }
  return c;
}
export const chessRules: Rules = {
  initialFen: () => new Chess().fen(),
  play(history, move) {
    const p = parseUci(move);
    if (!p) return null;
    const c = chessFromHistory(history);
    const mover: Side = c.turn() === 'w' ? 0 : 1;
    let san: string;
    try {
      san = c.move(p).san;
    } catch {
      return null;
    }
    let over: GameOutcome | null = null;
    if (c.isCheckmate()) over = { winner: mover, reason: 'checkmate' };
    else if (c.isStalemate()) over = { winner: null, reason: 'stalemate' };
    else if (c.isInsufficientMaterial()) over = { winner: null, reason: 'insufficient' };
    else if (c.isThreefoldRepetition()) over = { winner: null, reason: 'repetition' };
    else if (c.isDrawByFiftyMoves()) over = { winner: null, reason: 'fifty_moves' };
    return { fen: c.fen(), san, check: c.inCheck(), over };
  },
  canWin(fen, side) {
    const c = new Chess(fen);
    const color = side === 0 ? 'w' : 'b';
    const pieces = c.board().flat().filter((sq) => sq && sq.color === color && sq.type !== 'k');
    if (pieces.length === 0) return false;
    if (pieces.length === 1 && (pieces[0]!.type === 'n' || pieces[0]!.type === 'b')) return false;
    return true;
  },
};

// ---------- xiangqi ----------
function xqFromHistory(history: string[]): Xiangqi {
  const g = new Xiangqi(XQ_START_FEN);
  for (const m of history) {
    const mv = parseIccs(m);
    if (!mv || !g.move(mv)) throw new Error('corrupt history');
  }
  return g;
}
export const xiangqiRules: Rules = {
  initialFen: () => XQ_START_FEN,
  play(history, move) {
    const mv = parseIccs(move);
    if (!mv) return null;
    const g = xqFromHistory(history);
    if (!g.isLegal(mv)) return null;
    const san = g.notation(mv);
    g.move(mv);
    const st = g.status();
    const over: GameOutcome | null = st.over
      ? { winner: st.winner === null ? null : st.winner === 'r' ? 0 : 1, reason: st.reason }
      : null;
    return { fen: g.fen(), san, check: g.inCheck(), over };
  },
  canWin(fen, side) {
    return new Xiangqi(fen).hasMatingMaterial(side === 0 ? 'r' : 'b');
  },
};

// ---------- caro ----------
function caroOpts(s?: CaroSettings) {
  const size = s && CARO_SIZES.includes(s.size) ? s.size : 15;
  return { size, blockTwoEnds: !!s?.blockTwoEnds };
}
export function caroFen(g: Caro): string {
  return Array.from(g.board).join('');
}
export const caroRules: Rules = {
  initialFen: (v) => '0'.repeat(caroOpts(v.caro).size ** 2),
  play(history, move, v) {
    const opts = caroOpts(v.caro);
    if (!/^\d{1,3}$/.test(move)) return null;
    const g = Caro.replay(opts, history.map(Number));
    const mover: Side = g.turn === 1 ? 0 : 1;
    const i = Number(move);
    if (!g.play(i)) return null;
    let over: GameOutcome | null = null;
    if (g.winner) over = { winner: mover, reason: 'five' };
    else if (g.draw) over = { winner: null, reason: 'board_full' };
    return { fen: caroFen(g), san: caroNotation(i, opts.size), check: false, over };
  },
  canWin: () => true,
};

// ---------- dots and boxes ----------
function dotsSize(v: VariantSettings) {
  return v.dots && DOTS_SIZES.includes(v.dots.size) ? v.dots.size : 4;
}
export const dotsRules: Rules = {
  initialFen: (v) => new Dots(dotsSize(v)).fen(),
  play(history, move, v) {
    if (!/^\d{1,3}$/.test(move)) return null;
    const g = Dots.replay(dotsSize(v), history.map(Number));
    const made = g.play(Number(move));
    if (made < 0) return null;
    const w = g.winner();
    const over: GameOutcome | null =
      w === null ? null : { winner: w === 0 ? null : w === 1 ? 0 : 1, reason: w === 0 ? 'boxes_tie' : 'boxes' };
    return { fen: g.fen(), san: made ? `${move}+${made}` : move, check: false, over, nextTurn: g.turn === 1 ? 0 : 1 };
  },
  canWin: () => true,
};

export const RULES: Record<BoardGame, Rules> = { chess: chessRules, xiangqi: xiangqiRules, caro: caroRules, dots: dotsRules };
