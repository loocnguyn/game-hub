// 2048. Tiles keep ids so the UI can animate slides and merges. New tiles come from a seeded RNG,
// so a game is fully determined by (seed, moves) and the server can verify submitted scores.
import { mulberry32, randInt } from './rng.ts';

export const SIZE = 4;
export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
export const DIRS: Dir[] = [0, 1, 2, 3];

export interface Tile {
  id: number;
  value: number;
  r: number;
  c: number;
  merged?: boolean; // produced by a merge on the last move
  isNew?: boolean; // spawned on the last move
}

export class Game2048 {
  readonly seed: number;
  grid: (Tile | null)[][];
  score = 0;
  moves = 0;
  best = 0; // highest tile value
  over = false;
  /** Tiles absorbed in the last move (for the slide-into animation). */
  removed: Tile[] = [];
  private rng: () => number;
  private nextId = 1;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.grid = Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null));
    this.spawn();
    this.spawn();
  }

  tiles(): Tile[] {
    return this.grid.flat().filter((t): t is Tile => t !== null);
  }

  private emptyCells(): [number, number][] {
    const out: [number, number][] = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!this.grid[r][c]) out.push([r, c]);
    return out;
  }

  private spawn(): Tile | null {
    const empty = this.emptyCells();
    if (!empty.length) return null;
    const [r, c] = empty[randInt(this.rng, empty.length)];
    const value = this.rng() < 0.9 ? 2 : 4;
    const tile: Tile = { id: this.nextId++, value, r, c, isNew: true };
    this.grid[r][c] = tile;
    this.best = Math.max(this.best, value);
    return tile;
  }

  /** Cells of one row/column, ordered from the edge the tiles slide towards. */
  private line(dir: Dir, k: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < SIZE; i++) {
      if (dir === 0) out.push([i, k]);
      else if (dir === 2) out.push([SIZE - 1 - i, k]);
      else if (dir === 3) out.push([k, i]);
      else out.push([k, SIZE - 1 - i]);
    }
    return out;
  }

  /** Returns true if the board changed. */
  move(dir: Dir): boolean {
    if (this.over || ![0, 1, 2, 3].includes(dir)) return false;
    for (const t of this.tiles()) {
      t.merged = false;
      t.isNew = false;
    }
    this.removed = [];
    let moved = false;
    let gained = 0;
    const next: (Tile | null)[][] = Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null));

    for (let k = 0; k < SIZE; k++) {
      const cells = this.line(dir, k);
      const tiles = cells.map(([r, c]) => this.grid[r][c]).filter((t): t is Tile => t !== null);
      const placed: Tile[] = [];
      for (const t of tiles) {
        const last = placed[placed.length - 1];
        if (last && !last.merged && last.value === t.value) {
          last.value *= 2;
          last.merged = true;
          gained += last.value;
          this.best = Math.max(this.best, last.value);
          // The absorbed tile slides into the merged tile's cell before disappearing.
          this.removed.push({ ...t, r: last.r, c: last.c });
          moved = true;
        } else {
          const [r, c] = cells[placed.length];
          if (t.r !== r || t.c !== c) moved = true;
          t.r = r;
          t.c = c;
          placed.push(t);
        }
      }
      for (const t of placed) next[t.r][t.c] = t;
    }

    if (!moved) return false;
    this.grid = next;
    this.score += gained;
    this.moves++;
    this.spawn();
    if (!this.canMove()) this.over = true;
    return true;
  }

  canMove(): boolean {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const t = this.grid[r][c];
        if (!t) return true;
        if (c + 1 < SIZE && this.grid[r][c + 1]?.value === t.value) return true;
        if (r + 1 < SIZE && this.grid[r + 1][c]?.value === t.value) return true;
      }
    return false;
  }

  values(): number[][] {
    return this.grid.map((row) => row.map((t) => (t ? t.value : 0)));
  }
}

/** Moves are encoded as a string of digits 0-3. */
export function replay2048(seed: number, moves: string): Game2048 {
  if (typeof moves !== 'string' || !/^[0-3]*$/.test(moves)) throw new Error('bad moves');
  const g = new Game2048(seed);
  for (const ch of moves) {
    if (g.over) break;
    g.move(Number(ch) as Dir);
  }
  return g;
}
