// Caro (Gomoku, Vietnamese style). X moves first. Five or more in a row wins; with the
// "chặn 2 đầu" rule a line blocked by the opponent at BOTH ends does not count.

export interface CaroOptions {
  size: number; // 15 or 20
  blockTwoEnds: boolean;
}
export const CARO_SIZES = [15, 20];
export const EMPTY = 0;
export const X = 1;
export const O = 2;

const DIRS: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

export class Caro {
  readonly size: number;
  readonly blockTwoEnds: boolean;
  board: Uint8Array;
  turn: 1 | 2 = X;
  moves: number[] = [];
  winner: 0 | 1 | 2 = 0;
  winLine: number[] = [];
  draw = false;

  constructor(opts: CaroOptions) {
    if (!CARO_SIZES.includes(opts.size)) throw new Error('bad size');
    this.size = opts.size;
    this.blockTwoEnds = !!opts.blockTwoEnds;
    this.board = new Uint8Array(this.size * this.size);
  }

  get over(): boolean {
    return this.winner !== 0 || this.draw;
  }

  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return -1; // off-board
    return this.board[y * this.size + x];
  }

  play(i: number): boolean {
    if (this.over || !Number.isInteger(i) || i < 0 || i >= this.board.length || this.board[i] !== EMPTY) return false;
    const p = this.turn;
    this.board[i] = p;
    this.moves.push(i);
    const line = this.winningLine(i);
    if (line) {
      this.winner = p;
      this.winLine = line;
    } else if (this.moves.length === this.board.length) {
      this.draw = true;
    }
    this.turn = p === X ? O : X;
    return true;
  }

  /** Winning line through cell i for the stone on it, or null. */
  winningLine(i: number): number[] | null {
    const p = this.board[i];
    if (!p) return null;
    const x0 = i % this.size, y0 = Math.floor(i / this.size);
    const opp = p === X ? O : X;
    for (const [dx, dy] of DIRS) {
      const cells = [i];
      let x = x0 + dx, y = y0 + dy;
      while (this.at(x, y) === p) { cells.push(y * this.size + x); x += dx; y += dy; }
      const endA = this.at(x, y);
      x = x0 - dx; y = y0 - dy;
      while (this.at(x, y) === p) { cells.unshift(y * this.size + x); x -= dx; y -= dy; }
      const endB = this.at(x, y);
      if (cells.length < 5) continue;
      if (this.blockTwoEnds && endA === opp && endB === opp) continue;
      return cells;
    }
    return null;
  }

  static replay(opts: CaroOptions, moves: number[]): Caro {
    const g = new Caro(opts);
    for (const m of moves) if (!g.play(m)) throw new Error('illegal move in history');
    return g;
  }
}

export function caroNotation(i: number, size: number): string {
  const x = i % size, y = Math.floor(i / size);
  return `${String.fromCharCode(97 + x)}${size - y}`;
}
