// Dots and Boxes. An n x n grid of boxes. Players alternately draw one line; completing a box
// scores it and the same player moves again. When every line is drawn, most boxes wins.
export const DOTS_SIZES = [3, 4, 5, 6];

export class Dots {
  readonly n: number;
  lines: Uint8Array; // 0 = free, 1 = drawn by first player, 2 = second player
  boxes: Uint8Array; // 0 = open, 1/2 = owner
  turn: 1 | 2 = 1;
  score: [number, number] = [0, 0];

  constructor(n: number) {
    if (!DOTS_SIZES.includes(n)) throw new Error('bad size');
    this.n = n;
    this.lines = new Uint8Array(2 * n * (n + 1));
    this.boxes = new Uint8Array(n * n);
  }

  get hCount() {
    return (this.n + 1) * this.n;
  }
  /** Horizontal line on dot-row r (0..n), between columns c and c+1. */
  h(r: number, c: number) {
    return r * this.n + c;
  }
  /** Vertical line on box-row r (0..n-1), dot-column c (0..n). */
  v(r: number, c: number) {
    return this.hCount + r * (this.n + 1) + c;
  }
  boxSides(r: number, c: number): number[] {
    return [this.h(r, c), this.h(r + 1, c), this.v(r, c), this.v(r, c + 1)];
  }
  /** Boxes (as [r, c]) touching a line. */
  boxesOf(line: number): [number, number][] {
    const n = this.n;
    const out: [number, number][] = [];
    if (line < this.hCount) {
      const r = Math.floor(line / n), c = line % n;
      if (r > 0) out.push([r - 1, c]);
      if (r < n) out.push([r, c]);
    } else {
      const k = line - this.hCount;
      const r = Math.floor(k / (n + 1)), c = k % (n + 1);
      if (c > 0) out.push([r, c - 1]);
      if (c < n) out.push([r, c]);
    }
    return out;
  }

  get over(): boolean {
    return this.lines.every((l) => l !== 0);
  }

  /** Draw a line. Returns the number of boxes completed, or -1 if illegal. */
  play(line: number): number {
    if (!Number.isInteger(line) || line < 0 || line >= this.lines.length || this.lines[line] !== 0) return -1;
    const p = this.turn;
    this.lines[line] = p;
    let made = 0;
    for (const [r, c] of this.boxesOf(line)) {
      if (this.boxSides(r, c).every((l) => this.lines[l] !== 0)) {
        this.boxes[r * this.n + c] = p;
        this.score[p - 1]++;
        made++;
      }
    }
    if (made === 0) this.turn = p === 1 ? 2 : 1;
    return made;
  }

  winner(): 0 | 1 | 2 | null {
    if (!this.over) return null;
    if (this.score[0] === this.score[1]) return 0;
    return this.score[0] > this.score[1] ? 1 : 2;
  }

  static replay(n: number, moves: number[]): Dots {
    const g = new Dots(n);
    for (const m of moves) if (g.play(m) < 0) throw new Error('illegal move in history');
    return g;
  }

  /** Compact position string: lines then boxes. */
  fen(): string {
    return `${this.lines.join('')}|${this.boxes.join('')}|${this.turn}`;
  }
}
