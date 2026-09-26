// Xiangqi (Cờ tướng) rules engine.
// Board: 90 squares, index = row * 9 + col. Row 0 is Black's back rank (top), row 9 is Red's.
// Red pieces are uppercase: K(帥) A(仕) B(相) N(傌) R(俥) C(炮) P(兵); Black is lowercase.

export type XqColor = 'r' | 'b';
export interface XqMove {
  from: number;
  to: number;
}
interface HistoryEntry extends XqMove {
  piece: string;
  captured: string;
  prevHalfmove: number;
  check: boolean;
}

export const XQ_START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
export const NO_CAPTURE_LIMIT = 120; // plies (60 moves each) without a capture => draw

const ROWS = 10;
const COLS = 9;
const ORTHO: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const rowOf = (sq: number) => Math.floor(sq / COLS);
const colOf = (sq: number) => sq % COLS;
const at = (r: number, c: number) => r * COLS + c;
const onBoard = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
export const isRed = (p: string) => p !== '' && p === p.toUpperCase();
const colorOf = (p: string): XqColor | null => (p === '' ? null : isRed(p) ? 'r' : 'b');
const inPalace = (color: XqColor, r: number, c: number) =>
  c >= 3 && c <= 5 && (color === 'r' ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
const ownSide = (color: XqColor, r: number) => (color === 'r' ? r >= 5 : r <= 4);
const opposite = (c: XqColor): XqColor => (c === 'r' ? 'b' : 'r');

export function sqToIccs(sq: number): string {
  return `${String.fromCharCode(97 + colOf(sq))}${9 - rowOf(sq)}`;
}
export function iccsToSq(s: string): number {
  const c = s.charCodeAt(0) - 97;
  const r = 9 - Number(s[1]);
  if (!/^[a-i][0-9]$/.test(s) || !onBoard(r, c)) return -1;
  return at(r, c);
}
export function moveToIccs(m: XqMove): string {
  return sqToIccs(m.from) + sqToIccs(m.to);
}
export function parseIccs(s: string): XqMove | null {
  if (typeof s !== 'string' || s.length !== 4) return null;
  const from = iccsToSq(s.slice(0, 2)), to = iccsToSq(s.slice(2, 4));
  if (from < 0 || to < 0) return null;
  return { from, to };
}

export class Xiangqi {
  board: string[] = Array(90).fill('');
  turn: XqColor = 'r';
  halfmove = 0;
  history: HistoryEntry[] = [];
  keys: string[] = [];

  constructor(fen: string = XQ_START_FEN) {
    this.load(fen);
  }

  load(fen: string): void {
    const [placement, side = 'w', , , half = '0'] = fen.trim().split(/\s+/);
    const rows = placement.split('/');
    if (rows.length !== ROWS) throw new Error('bad fen');
    const board: string[] = [];
    for (const row of rows) {
      let n = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) {
          for (let i = 0; i < Number(ch); i++) board.push('');
          n += Number(ch);
        } else {
          let p = ch;
          if (p === 'E' || p === 'e') p = p === 'E' ? 'B' : 'b';
          if (p === 'H' || p === 'h') p = p === 'H' ? 'N' : 'n';
          if (!/^[kabnrcpKABNRCP]$/.test(p)) throw new Error('bad fen');
          board.push(p);
          n++;
        }
      }
      if (n !== COLS) throw new Error('bad fen');
    }
    this.board = board;
    this.turn = side === 'b' ? 'b' : 'r';
    this.halfmove = Number(half) || 0;
    this.history = [];
    this.keys = [this.key()];
  }

  fen(): string {
    const rows: string[] = [];
    for (let r = 0; r < ROWS; r++) {
      let s = '', empty = 0;
      for (let c = 0; c < COLS; c++) {
        const p = this.board[at(r, c)];
        if (!p) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        s += p;
      }
      if (empty) s += empty;
      rows.push(s);
    }
    return `${rows.join('/')} ${this.turn === 'r' ? 'w' : 'b'} - - ${this.halfmove} ${Math.floor(this.history.length / 2) + 1}`;
  }

  key(): string {
    return this.board.map((p) => p || '.').join('') + this.turn;
  }

  kingSquare(color: XqColor): number {
    const k = color === 'r' ? 'K' : 'k';
    return this.board.indexOf(k);
  }

  /** Is `sq` attacked by `by`? Includes the flying-general rule (kings facing on a file). */
  isAttacked(sq: number, by: XqColor): boolean {
    const r = rowOf(sq), c = colOf(sq);
    const b = this.board;
    const mine = (p: string, t: string) => p !== '' && colorOf(p) === by && p.toLowerCase() === t;

    // Rook / cannon / facing king along lines.
    for (const [dr, dc] of ORTHO) {
      let rr = r + dr, cc = c + dc, screens = 0;
      while (onBoard(rr, cc)) {
        const p = b[at(rr, cc)];
        if (p) {
          if (screens === 0) {
            if (mine(p, 'r')) return true;
            if (dc === 0 && mine(p, 'k')) return true; // flying general
          } else if (screens === 1) {
            if (mine(p, 'c')) return true;
            break;
          }
          screens++;
        }
        rr += dr;
        cc += dc;
      }
    }
    // Knights: a horse at h reaches sq via its leg square (adjacent to h along the long axis).
    for (const [dr, dc] of [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2]] as [number, number][]) {
      const hr = r + dr, hc = c + dc;
      if (!onBoard(hr, hc) || !mine(b[at(hr, hc)], 'n')) continue;
      const legR = Math.abs(dr) === 2 ? hr - dr / 2 : hr;
      const legC = Math.abs(dc) === 2 ? hc - dc / 2 : hc;
      if (b[at(legR, legC)] === '') return true;
    }
    // Pawns.
    const fwd = by === 'r' ? -1 : 1; // direction the attacking pawn moves
    const pr = r - fwd;
    if (onBoard(pr, c) && mine(b[at(pr, c)], 'p')) return true;
    for (const dc of [-1, 1]) {
      const cc = c + dc;
      if (onBoard(r, cc) && mine(b[at(r, cc)], 'p') && !ownSide(by, r)) return true;
    }
    // King adjacent (only matters for completeness inside a palace).
    for (const [dr, dc] of ORTHO) {
      const rr = r + dr, cc = c + dc;
      if (onBoard(rr, cc) && mine(b[at(rr, cc)], 'k')) return true;
    }
    return false;
  }

  inCheck(color: XqColor = this.turn): boolean {
    const k = this.kingSquare(color);
    return k >= 0 && this.isAttacked(k, opposite(color));
  }

  private pseudoMoves(color: XqColor, onlyFrom = -1): XqMove[] {
    const moves: XqMove[] = [];
    const b = this.board;
    const push = (from: number, r: number, c: number) => {
      if (!onBoard(r, c)) return;
      const t = b[at(r, c)];
      if (t && colorOf(t) === color) return;
      moves.push({ from, to: at(r, c) });
    };
    for (let sq = 0; sq < 90; sq++) {
      if (onlyFrom >= 0 && sq !== onlyFrom) continue;
      const p = b[sq];
      if (!p || colorOf(p) !== color) continue;
      const r = rowOf(sq), c = colOf(sq);
      switch (p.toLowerCase()) {
        case 'k':
          for (const [dr, dc] of ORTHO) if (inPalace(color, r + dr, c + dc)) push(sq, r + dr, c + dc);
          break;
        case 'a':
          for (const [dr, dc] of DIAG) if (inPalace(color, r + dr, c + dc)) push(sq, r + dr, c + dc);
          break;
        case 'b':
          for (const [dr, dc] of DIAG) {
            const er = r + dr, ec = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
            if (!onBoard(tr, tc) || !ownSide(color, tr)) continue;
            if (b[at(er, ec)] !== '') continue; // elephant eye blocked
            push(sq, tr, tc);
          }
          break;
        case 'n':
          for (const [dr, dc] of ORTHO) {
            const lr = r + dr, lc = c + dc;
            if (!onBoard(lr, lc) || b[at(lr, lc)] !== '') continue; // horse leg blocked
            if (dr !== 0) {
              push(sq, r + 2 * dr, c - 1);
              push(sq, r + 2 * dr, c + 1);
            } else {
              push(sq, r - 1, c + 2 * dc);
              push(sq, r + 1, c + 2 * dc);
            }
          }
          break;
        case 'r':
          for (const [dr, dc] of ORTHO) {
            let rr = r + dr, cc = c + dc;
            while (onBoard(rr, cc)) {
              const t = b[at(rr, cc)];
              if (t) {
                if (colorOf(t) !== color) moves.push({ from: sq, to: at(rr, cc) });
                break;
              }
              moves.push({ from: sq, to: at(rr, cc) });
              rr += dr;
              cc += dc;
            }
          }
          break;
        case 'c':
          for (const [dr, dc] of ORTHO) {
            let rr = r + dr, cc = c + dc, jumped = false;
            while (onBoard(rr, cc)) {
              const t = b[at(rr, cc)];
              if (!jumped) {
                if (t) jumped = true;
                else moves.push({ from: sq, to: at(rr, cc) });
              } else if (t) {
                if (colorOf(t) !== color) moves.push({ from: sq, to: at(rr, cc) });
                break;
              }
              rr += dr;
              cc += dc;
            }
          }
          break;
        case 'p': {
          const f = color === 'r' ? -1 : 1;
          push(sq, r + f, c);
          if (!ownSide(color, r)) {
            push(sq, r, c - 1);
            push(sq, r, c + 1);
          }
          break;
        }
      }
    }
    return moves;
  }

  private rawMake(m: XqMove): string {
    const captured = this.board[m.to];
    this.board[m.to] = this.board[m.from];
    this.board[m.from] = '';
    return captured;
  }
  private rawUnmake(m: XqMove, captured: string): void {
    this.board[m.from] = this.board[m.to];
    this.board[m.to] = captured;
  }

  /** Legal moves for the side to move (optionally only from one square). */
  moves(from = -1): XqMove[] {
    const color = this.turn;
    const legal: XqMove[] = [];
    for (const m of this.pseudoMoves(color, from)) {
      const cap = this.rawMake(m);
      const k = this.kingSquare(color);
      if (!this.isAttacked(k, opposite(color))) legal.push(m);
      this.rawUnmake(m, cap);
    }
    return legal;
  }

  isLegal(m: XqMove): boolean {
    return this.moves(m.from).some((x) => x.to === m.to);
  }

  /** Plays a legal move; returns false if illegal. */
  move(m: XqMove): boolean {
    if (!this.isLegal(m)) return false;
    const piece = this.board[m.from];
    const prevHalfmove = this.halfmove;
    const captured = this.rawMake(m);
    this.halfmove = captured ? 0 : this.halfmove + 1;
    this.turn = opposite(this.turn);
    const check = this.inCheck(this.turn);
    this.history.push({ ...m, piece, captured, prevHalfmove, check });
    this.keys.push(this.key());
    return true;
  }

  undo(): boolean {
    const h = this.history.pop();
    if (!h) return false;
    this.keys.pop();
    this.rawUnmake(h, h.captured);
    this.turn = opposite(this.turn);
    this.halfmove = h.prevHalfmove;
    return true;
  }

  /**
   * Game status for the side to move.
   * - No legal move (checkmate OR stalemate) loses in xiangqi.
   * - Threefold repetition: if exactly one side checked on every one of its moves in the cycle,
   *   that side loses (perpetual check); otherwise a draw.
   */
  status(): { over: boolean; winner: XqColor | null; reason: string } {
    if (this.kingSquare('r') < 0) return { over: true, winner: 'b', reason: 'checkmate' };
    if (this.kingSquare('b') < 0) return { over: true, winner: 'r', reason: 'checkmate' };
    if (this.moves().length === 0) {
      return { over: true, winner: opposite(this.turn), reason: this.inCheck() ? 'checkmate' : 'stalemate' };
    }
    const cur = this.keys[this.keys.length - 1];
    const occurrences = this.keys.reduce((n, k) => n + (k === cur ? 1 : 0), 0);
    if (occurrences >= 3) {
      const prev = this.keys.lastIndexOf(cur, this.keys.length - 2);
      // Moves history[prev .. end) form the cycle.
      const cycle = this.history.slice(prev);
      const by = (color: XqColor) => cycle.filter((h) => colorOf(h.piece) === color);
      const perpetual = (color: XqColor) => by(color).length > 0 && by(color).every((h) => h.check);
      const pr = perpetual('r'), pb = perpetual('b');
      if (pr && !pb) return { over: true, winner: 'b', reason: 'perpetual_check' };
      if (pb && !pr) return { over: true, winner: 'r', reason: 'perpetual_check' };
      return { over: true, winner: null, reason: 'repetition' };
    }
    if (this.halfmove >= NO_CAPTURE_LIMIT) return { over: true, winner: null, reason: 'no_capture' };
    return { over: false, winner: null, reason: '' };
  }

  /** A side that only has king/advisors/elephants can never deliver mate. */
  hasMatingMaterial(color: XqColor): boolean {
    return this.board.some((p) => p && colorOf(p) === color && 'nrcp'.includes(p.toLowerCase()));
  }

  /** Vietnamese notation, e.g. "P2-5", "M8.7", "X1/1". Computed BEFORE the move is played. */
  notation(m: XqMove): string {
    const p = this.board[m.from];
    const color = colorOf(p)!;
    const names: Record<string, string> = { k: 'Tg', a: 'S', b: 'T', n: 'M', r: 'X', c: 'P', p: 'B' };
    const file = (c: number) => (color === 'r' ? 9 - c : c + 1);
    const fr = rowOf(m.from), fc = colOf(m.from), tr = rowOf(m.to), tc = colOf(m.to);
    const t = p.toLowerCase();
    let sign: string, num: number;
    if (fr === tr) {
      sign = '-';
      num = file(tc);
    } else {
      const forward = color === 'r' ? tr < fr : tr > fr;
      sign = forward ? '.' : '/';
      num = 'nba'.includes(t) ? file(tc) : Math.abs(tr - fr);
    }
    return `${names[t]}${file(fc)}${sign}${num}`;
  }
}

/** Perft: number of leaf nodes at a given depth (used by tests to validate move generation). */
export function perft(g: Xiangqi, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of g.moves()) {
    if (depth === 1) { n++; continue; }
    g.move(m);
    n += perft(g, depth - 1);
    g.undo();
  }
  return n;
}
