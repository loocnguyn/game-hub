// Classic Minesweeper (Windows rules). Mines are placed on the first reveal so the first click is
// always safe and always opens an area (no mine in the clicked cell or its 8 neighbours).
import { mulberry32, shuffle } from './rng.ts';

export type Difficulty = 'beginner' | 'intermediate' | 'expert';
export const DIFFICULTIES: Record<Difficulty, { w: number; h: number; mines: number; label: string }> = {
  beginner: { w: 9, h: 9, mines: 10, label: 'Dễ' },
  intermediate: { w: 16, h: 16, mines: 40, label: 'Vừa' },
  expert: { w: 30, h: 16, mines: 99, label: 'Khó' },
};

export const HIDDEN = 0;
export const REVEALED = 1;
export const FLAGGED = 2;

export type MsAction = { t: 'r' | 'f' | 'c'; i: number }; // reveal / flag toggle / chord

export class Minesweeper {
  readonly w: number;
  readonly h: number;
  readonly mines: number;
  readonly seed: number;
  mine: Uint8Array;
  adj: Uint8Array;
  state: Uint8Array;
  generated = false;
  over = false;
  won = false;
  exploded = -1;
  revealed = 0;
  flags = 0;
  log: MsAction[] = [];

  constructor(difficulty: Difficulty, seed: number) {
    const d = DIFFICULTIES[difficulty];
    if (!d) throw new Error('bad difficulty');
    this.w = d.w;
    this.h = d.h;
    this.mines = d.mines;
    this.seed = seed >>> 0;
    const n = this.w * this.h;
    this.mine = new Uint8Array(n);
    this.adj = new Uint8Array(n);
    this.state = new Uint8Array(n);
  }

  get size() {
    return this.w * this.h;
  }

  neighbours(i: number): number[] {
    const x = i % this.w, y = Math.floor(i / this.w);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h) out.push(ny * this.w + nx);
      }
    return out;
  }

  private generate(safe: number): void {
    const excluded = new Set([safe, ...this.neighbours(safe)]);
    const candidates: number[] = [];
    for (let i = 0; i < this.size; i++) if (!excluded.has(i)) candidates.push(i);
    shuffle(mulberry32(this.seed), candidates);
    for (let k = 0; k < this.mines; k++) this.mine[candidates[k]] = 1;
    for (let i = 0; i < this.size; i++) {
      this.adj[i] = this.neighbours(i).reduce((s, j) => s + this.mine[j], 0);
    }
    this.generated = true;
  }

  private valid(i: number): boolean {
    return Number.isInteger(i) && i >= 0 && i < this.size;
  }

  /** Reveal a cell. Returns the indices that were opened. */
  reveal(i: number): number[] {
    if (this.over || !this.valid(i) || this.state[i] !== HIDDEN) return [];
    this.log.push({ t: 'r', i });
    if (!this.generated) this.generate(i);
    return this.open([i]);
  }

  private open(start: number[]): number[] {
    const opened: number[] = [];
    const stack = [...start];
    while (stack.length) {
      const i = stack.pop()!;
      if (this.state[i] !== HIDDEN) continue;
      if (this.mine[i]) {
        this.state[i] = REVEALED;
        this.over = true;
        this.exploded = i;
        opened.push(i);
        return opened;
      }
      this.state[i] = REVEALED;
      this.revealed++;
      opened.push(i);
      if (this.adj[i] === 0) for (const j of this.neighbours(i)) if (this.state[j] === HIDDEN) stack.push(j);
    }
    if (this.revealed === this.size - this.mines) {
      this.over = true;
      this.won = true;
      for (let i = 0; i < this.size; i++) if (this.mine[i] && this.state[i] !== FLAGGED) {
        this.state[i] = FLAGGED;
        this.flags++;
      }
    }
    return opened;
  }

  toggleFlag(i: number): boolean {
    if (this.over || !this.valid(i) || this.state[i] === REVEALED) return false;
    this.log.push({ t: 'f', i });
    if (this.state[i] === FLAGGED) {
      this.state[i] = HIDDEN;
      this.flags--;
    } else {
      this.state[i] = FLAGGED;
      this.flags++;
    }
    return true;
  }

  /** Chord: on a revealed number whose flag count matches, open all other hidden neighbours. */
  chord(i: number): number[] {
    if (this.over || !this.valid(i) || this.state[i] !== REVEALED || this.adj[i] === 0) return [];
    const nb = this.neighbours(i);
    const flagged = nb.filter((j) => this.state[j] === FLAGGED).length;
    if (flagged !== this.adj[i]) return [];
    const targets = nb.filter((j) => this.state[j] === HIDDEN);
    if (!targets.length) return [];
    this.log.push({ t: 'c', i });
    // A wrong flag means one of the targets is a mine: open() stops at it and ends the game.
    return this.open(targets);
  }

  apply(a: MsAction): void {
    if (a.t === 'r') this.reveal(a.i);
    else if (a.t === 'f') this.toggleFlag(a.i);
    else if (a.t === 'c') this.chord(a.i);
  }
}

/** Re-run a game from its action log; used by the server to verify a win before ranking it. */
export function replayMinesweeper(difficulty: Difficulty, seed: number, actions: MsAction[]): Minesweeper {
  const g = new Minesweeper(difficulty, seed);
  for (const a of actions) {
    if (!a || !['r', 'f', 'c'].includes(a.t)) throw new Error('bad action');
    g.apply(a);
    if (g.over) break;
  }
  return g;
}
