// Guideline-style Tetris engine. Pure and deterministic: the same (seed, options, inputs) always
// produce the same game, which lets the server replay a submitted game to verify its score.
// Coordinates: x grows right, y grows DOWN. The matrix is 10 x 40; rows TOP..H-1 are visible.
import { mulberry32, randInt, shuffle } from './rng.ts';

export const W = 10;
export const H = 40;
export const VISIBLE = 20;
export const TOP = H - VISIBLE; // first visible row
export const FPS = 60;
export const LOCK_DELAY = 30; // frames
export const MAX_LOCK_RESETS = 15;
export const GARBAGE_CAP = 8; // max garbage rows inserted per piece lock
export const NEXT_COUNT = 5;

export type Piece = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECES: Piece[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
export const PIECE_ID: Record<Piece, number> = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
export const ID_PIECE: Piece[] = ['I', 'I', 'O', 'T', 'S', 'Z', 'J', 'L']; // index 0 unused
export const GARBAGE_ID = 8;

type Cell = [number, number];

const BASE: Record<Piece, Cell[]> = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const BOX: Record<Piece, number> = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };

/** SHAPES[piece][rotation] -> cells relative to the piece box. Rotation 0=spawn,1=R,2=180,3=L. */
export const SHAPES: Record<Piece, Cell[][]> = Object.fromEntries(
  PIECES.map((p) => {
    const states: Cell[][] = [BASE[p]];
    for (let r = 1; r < 4; r++) {
      const n = BOX[p];
      states.push(p === 'O' ? BASE[p] : states[r - 1].map(([x, y]) => [n - 1 - y, x] as Cell));
    }
    return [p, states];
  }),
) as Record<Piece, Cell[][]>;

// SRS kick tables, written in the usual y-UP notation and converted to y-down below.
const JLSTZ_KICKS: Record<string, Cell[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS: Record<string, Cell[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};
// Simple 180° kicks (y-up), in the spirit of modern clients.
const KICKS_180: Cell[] = [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]];

const toDown = (k: Cell[]): Cell[] => k.map(([x, y]) => [x, -y] as Cell);
function kicksFor(p: Piece, from: number, to: number): Cell[] {
  if (p === 'O') return [[0, 0]];
  if ((from + 2) % 4 === to) return toDown(KICKS_180);
  const key = `${from}>${to}`;
  return toDown((p === 'I' ? I_KICKS : JLSTZ_KICKS)[key]);
}

// Guideline tables.
const LINE_SCORE = [0, 100, 300, 500, 800];
const TSPIN_SCORE = [400, 800, 1200, 1600];
const MINI_SCORE = [100, 200, 400];
const PC_SCORE = [0, 800, 1200, 1800, 2000];
const LINE_ATTACK = [0, 0, 1, 2, 4];
const TSPIN_ATTACK = [0, 2, 4, 6];
const MINI_ATTACK = [0, 0, 1];
export const COMBO_ATTACK = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
export const PC_ATTACK = 10;

/** Input actions. Movement/soft-drop are held; the rest fire on key-down. */
export const A = { LEFT: 0, RIGHT: 1, SOFT: 2, HARD: 3, CW: 4, CCW: 5, R180: 6, HOLD: 7 } as const;
export type Action = (typeof A)[keyof typeof A];
export interface InputEvent {
  f: number; // frame at which the event applies
  a: Action;
  d: boolean; // true = key down, false = key up
}

export interface Handling {
  das: number; // frames before auto-repeat starts
  arr: number; // frames between repeats (0 = instant)
  sdf: number; // soft-drop factor (multiplier of gravity), 0 = instant
}
export const DEFAULT_HANDLING: Handling = { das: 10, arr: 2, sdf: 20 };

export type Mode = 'infinity' | 'versus';
export interface EngineOptions {
  seed: number;
  mode: Mode;
  handling?: Partial<Handling>;
  startLevel?: number;
}

export interface ActivePiece {
  type: Piece;
  rot: number;
  x: number;
  y: number;
}

export type TetrisEvent =
  | { t: 'spawn'; piece: Piece }
  | { t: 'move' }
  | { t: 'rotate'; kick: number }
  | { t: 'hold' }
  | { t: 'harddrop'; dist: number; cells: Cell[] }
  | { t: 'lock'; cells: Cell[] }
  | {
      t: 'clear';
      lines: number;
      rows: number[];
      tspin: boolean;
      mini: boolean;
      b2b: boolean;
      combo: number;
      pc: boolean;
      attack: number;
      score: number;
    }
  | { t: 'tspin'; mini: boolean } // T-spin with no lines
  | { t: 'level'; level: number }
  | { t: 'garbage'; lines: number }
  | { t: 'over'; reason: 'blockout' | 'lockout' | 'topout' };

export interface Stats {
  pieces: number;
  attack: number; // total attack generated
  sent: number; // attack left after cancelling incoming garbage
  received: number;
  tspins: number;
  tetrises: number;
  maxCombo: number;
  maxB2b: number;
  perfectClears: number;
}

/** Guideline marathon gravity in rows per frame; capped at level 15 so infinity stays playable. */
export function gravityForLevel(level: number): number {
  const l = Math.min(Math.max(level, 1), 15);
  const secondsPerRow = Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  return 1 / (secondsPerRow * FPS);
}

export class TetrisEngine {
  readonly mode: Mode;
  readonly seed: number;
  readonly handling: Handling;
  readonly startLevel: number;

  board = new Uint8Array(W * H);
  queue: Piece[] = [];
  cur: ActivePiece | null = null;
  hold: Piece | null = null;
  holdUsed = false;

  frame = 0;
  score = 0;
  lines = 0;
  level: number;
  combo = -1;
  b2b = -1; // -1 = no chain; n = chain length
  over = false;
  overReason: 'blockout' | 'lockout' | 'topout' | null = null;
  stats: Stats = { pieces: 0, attack: 0, sent: 0, received: 0, tspins: 0, tetrises: 0, maxCombo: 0, maxB2b: 0, perfectClears: 0 };

  pendingGarbage: { lines: number; col: number }[] = [];
  outgoing: number[] = [];
  garbageMultiplier = 1;
  events: TetrisEvent[] = [];

  private rng: () => number;
  private garbageRng: () => number;
  private gravityAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = -1;
  private lastRotate = false;
  private lastKick = 0;
  private held = { left: false, right: false, soft: false };
  private dir = 0;
  private dasTimer = 0;
  private arrTimer = 0;
  private dasCharged = false;

  constructor(opts: EngineOptions) {
    this.mode = opts.mode;
    this.seed = opts.seed >>> 0;
    this.handling = { ...DEFAULT_HANDLING, ...(opts.handling || {}) };
    this.startLevel = Math.max(1, Math.min(15, Math.floor(opts.startLevel ?? 1)));
    this.level = this.startLevel;
    this.rng = mulberry32(this.seed);
    this.garbageRng = mulberry32((this.seed ^ 0x9e3779b9) >>> 0);
    this.fillQueue();
    this.spawn();
  }

  // ---------- queries ----------
  get(x: number, y: number): number {
    if (x < 0 || x >= W || y >= H) return 9; // walls/floor
    if (y < 0) return 0;
    return this.board[y * W + x];
  }

  cells(p: ActivePiece | null = this.cur): Cell[] {
    if (!p) return [];
    return SHAPES[p.type][p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy] as Cell);
  }

  fits(p: ActivePiece): boolean {
    for (const [cx, cy] of SHAPES[p.type][p.rot]) {
      const x = p.x + cx, y = p.y + cy;
      if (x < 0 || x >= W || y >= H) return false;
      if (y >= 0 && this.board[y * W + x] !== 0) return false;
    }
    return true;
  }

  ghostY(): number {
    if (!this.cur) return 0;
    let y = this.cur.y;
    while (this.fits({ ...this.cur, y: y + 1 })) y++;
    return y;
  }

  nextPieces(n = NEXT_COUNT): Piece[] {
    return this.queue.slice(0, n);
  }

  gravity(): number {
    if (this.mode === 'versus') {
      // Speeds up every 30 s of play, capped so matches stay about skill, not reflexes.
      const lvl = Math.min(1 + Math.floor(this.frame / (30 * FPS)), 12);
      return gravityForLevel(lvl);
    }
    return gravityForLevel(this.level);
  }

  totalPending(): number {
    return this.pendingGarbage.reduce((s, g) => s + g.lines, 0);
  }

  // ---------- main loop ----------
  /** Advance exactly one frame, applying the inputs that belong to it. */
  step(inputs: InputEvent[] = []): void {
    if (this.over) return;
    const pressedThisFrame = new Set<number>();
    for (const ev of inputs) {
      if (this.over) break;
      this.applyInput(ev);
      if (ev.d) pressedThisFrame.add(ev.a);
    }
    if (!this.over && this.cur) {
      this.autoShift(pressedThisFrame);
      this.applyGravity();
      this.updateLock();
    }
    this.frame++;
  }

  private applyInput(ev: InputEvent): void {
    switch (ev.a) {
      case A.LEFT:
      case A.RIGHT: {
        const d = ev.a === A.LEFT ? -1 : 1;
        if (ev.a === A.LEFT) this.held.left = ev.d;
        else this.held.right = ev.d;
        if (ev.d) {
          this.dir = d;
          this.dasTimer = 0;
          this.arrTimer = 0;
          this.dasCharged = false;
          this.shift(d);
        } else if (this.dir === d) {
          this.dir = this.held.left ? -1 : this.held.right ? 1 : 0;
          this.dasTimer = 0;
          this.arrTimer = 0;
          this.dasCharged = false;
        }
        break;
      }
      case A.SOFT:
        this.held.soft = ev.d;
        break;
      case A.HARD:
        if (ev.d) this.hardDrop();
        break;
      case A.CW:
        if (ev.d) this.rotate(1);
        break;
      case A.CCW:
        if (ev.d) this.rotate(3);
        break;
      case A.R180:
        if (ev.d) this.rotate(2);
        break;
      case A.HOLD:
        if (ev.d) this.doHold();
        break;
    }
  }

  private autoShift(pressedThisFrame: Set<number>): void {
    if (this.dir === 0) return;
    const key = this.dir < 0 ? A.LEFT : A.RIGHT;
    if (pressedThisFrame.has(key)) return;
    const { das, arr } = this.handling;
    if (!this.dasCharged) {
      this.dasTimer++;
      if (this.dasTimer < das) return;
      this.dasCharged = true;
      this.arrTimer = 0;
      if (arr === 0) while (this.shift(this.dir));
      else this.shift(this.dir);
      return;
    }
    if (arr === 0) {
      while (this.shift(this.dir));
      return;
    }
    this.arrTimer++;
    if (this.arrTimer >= arr) {
      this.arrTimer = 0;
      this.shift(this.dir);
    }
  }

  private applyGravity(): void {
    const cur = this.cur!;
    const soft = this.held.soft;
    const { sdf } = this.handling;
    if (soft && sdf === 0) {
      let moved = 0;
      while (this.tryMove(0, 1)) moved++;
      this.score += moved;
      this.gravityAcc = 0;
      return;
    }
    const g = soft ? this.gravity() * sdf : this.gravity();
    this.gravityAcc += g;
    while (this.gravityAcc >= 1) {
      if (!this.tryMove(0, 1)) {
        this.gravityAcc = 0;
        break;
      }
      this.gravityAcc -= 1;
      if (soft) this.score += 1;
    }
    if (!this.fits({ ...cur, y: this.cur!.y + 1 })) this.gravityAcc = 0;
  }

  private updateLock(): void {
    const cur = this.cur!;
    const onGround = !this.fits({ ...cur, y: cur.y + 1 });
    if (!onGround) {
      this.lockTimer = 0;
      return;
    }
    this.lockTimer++;
    if (this.lockTimer >= LOCK_DELAY) this.lockPiece();
  }

  // ---------- movement ----------
  /** Moves the piece; tracks lowest row reached and lock resets. */
  private tryMove(dx: number, dy: number): boolean {
    const cur = this.cur;
    if (!cur) return false;
    const next = { ...cur, x: cur.x + dx, y: cur.y + dy };
    if (!this.fits(next)) return false;
    this.cur = next;
    if (next.y > this.lowestY) {
      this.lowestY = next.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
    if (dx !== 0 || dy !== 0) this.lastRotate = false;
    return true;
  }

  private shift(d: number): boolean {
    if (!this.cur) return false;
    if (!this.tryMove(d, 0)) return false;
    this.afterManipulation();
    this.events.push({ t: 'move' });
    return true;
  }

  private afterManipulation(): void {
    if (this.lockResets < MAX_LOCK_RESETS) {
      if (this.lockTimer > 0) this.lockResets++;
      this.lockTimer = 0;
    }
  }

  private rotate(delta: number): boolean {
    const cur = this.cur;
    if (!cur || cur.type === 'O') {
      if (cur) this.events.push({ t: 'rotate', kick: 0 });
      return cur !== null;
    }
    const to = (cur.rot + delta) % 4;
    const kicks = kicksFor(cur.type, cur.rot, to);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      const next = { ...cur, rot: to, x: cur.x + kx, y: cur.y + ky };
      if (this.fits(next)) {
        this.cur = next;
        if (next.y > this.lowestY) {
          this.lowestY = next.y;
          this.lockResets = 0;
          this.lockTimer = 0;
        }
        this.afterManipulation();
        this.lastRotate = true;
        this.lastKick = i;
        this.events.push({ t: 'rotate', kick: i });
        return true;
      }
    }
    return false;
  }

  private hardDrop(): void {
    if (!this.cur) return;
    const start = this.cur.y;
    const y = this.ghostY();
    if (y !== start) {
      this.cur = { ...this.cur, y };
      this.lastRotate = false;
    }
    const dist = y - start;
    this.score += dist * 2;
    this.events.push({ t: 'harddrop', dist, cells: this.cells() });
    this.lockPiece();
  }

  private doHold(): void {
    if (!this.cur || this.holdUsed) return;
    const current = this.cur.type;
    if (this.hold) {
      const h = this.hold;
      this.hold = current;
      this.spawn(h);
    } else {
      this.hold = current;
      this.spawn();
    }
    this.holdUsed = true;
    this.events.push({ t: 'hold' });
  }

  // ---------- pieces ----------
  private fillQueue(): void {
    while (this.queue.length < 14) this.queue.push(...shuffle(this.rng, [...PIECES]));
  }

  private spawn(type?: Piece): void {
    if (!type) {
      type = this.queue.shift()!;
      this.fillQueue();
    }
    const piece: ActivePiece = { type, rot: 0, x: 3, y: TOP - 2 };
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lastRotate = false;
    this.lastKick = 0;
    if (!this.fits(piece)) {
      this.cur = piece;
      this.gameOver('blockout');
      return;
    }
    // Guideline: the piece drops one row immediately if nothing blocks it.
    if (this.fits({ ...piece, y: piece.y + 1 })) piece.y += 1;
    this.cur = piece;
    this.lowestY = piece.y;
    this.events.push({ t: 'spawn', piece: type });
  }

  private tspinKind(): 'none' | 'mini' | 'full' {
    const cur = this.cur!;
    if (cur.type !== 'T' || !this.lastRotate) return 'none';
    const occ = (dx: number, dy: number) => this.get(cur.x + dx, cur.y + dy) !== 0;
    const corners: Cell[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const count = corners.filter(([dx, dy]) => occ(dx, dy)).length;
    if (count < 3) return 'none';
    const front: Record<number, Cell[]> = {
      0: [[0, 0], [2, 0]],
      1: [[2, 0], [2, 2]],
      2: [[0, 2], [2, 2]],
      3: [[0, 0], [0, 2]],
    };
    const frontCount = front[cur.rot].filter(([dx, dy]) => occ(dx, dy)).length;
    if (frontCount === 2 || this.lastKick === 4) return 'full';
    return 'mini';
  }

  private lockPiece(): void {
    const cur = this.cur;
    if (!cur) return;
    const cells = this.cells();
    const spin = this.tspinKind();
    for (const [x, y] of cells) {
      if (y >= 0) this.board[y * W + x] = PIECE_ID[cur.type];
    }
    this.stats.pieces++;
    this.events.push({ t: 'lock', cells });
    this.cur = null;

    if (cells.every(([, y]) => y < TOP)) {
      this.gameOver('lockout');
      return;
    }

    // Clear full rows.
    const rows: number[] = [];
    for (let y = 0; y < H; y++) {
      let full = true;
      for (let x = 0; x < W; x++) if (this.board[y * W + x] === 0) { full = false; break; }
      if (full) rows.push(y);
    }
    const n = rows.length;
    if (n > 0) {
      const next = new Uint8Array(W * H);
      let dst = H - 1;
      for (let y = H - 1; y >= 0; y--) {
        if (rows.includes(y)) continue;
        next.set(this.board.subarray(y * W, y * W + W), dst * W);
        dst--;
      }
      this.board = next;
    }

    const tspin = spin !== 'none';
    const mini = spin === 'mini';
    const level = this.level;
    let actionScore = 0;
    let attack = 0;

    if (n === 0) {
      if (tspin) {
        actionScore = (mini ? MINI_SCORE[0] : TSPIN_SCORE[0]) * level;
        this.stats.tspins++;
        this.events.push({ t: 'tspin', mini });
      }
      this.combo = -1;
      this.score += actionScore;
      this.applyGarbage();
    } else {
      this.combo++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      const difficult = n === 4 || tspin;
      const b2bBonus = difficult && this.b2b >= 0;
      if (difficult) {
        this.b2b++;
        this.stats.maxB2b = Math.max(this.stats.maxB2b, this.b2b);
      } else {
        this.b2b = -1;
      }
      if (tspin) {
        this.stats.tspins++;
        actionScore = (mini ? MINI_SCORE[Math.min(n, 2)] : TSPIN_SCORE[Math.min(n, 3)]) * level;
        attack = mini ? MINI_ATTACK[Math.min(n, 2)] : TSPIN_ATTACK[Math.min(n, 3)];
      } else {
        actionScore = LINE_SCORE[n] * level;
        attack = LINE_ATTACK[n];
      }
      if (n === 4) this.stats.tetrises++;
      if (b2bBonus) {
        actionScore = Math.floor(actionScore * 1.5);
        attack += 1;
      }
      let bonus = 0;
      if (this.combo > 0) bonus += 50 * this.combo * level;
      attack += COMBO_ATTACK[Math.min(this.combo, COMBO_ATTACK.length - 1)];

      const pc = this.board.every((c) => c === 0);
      if (pc) {
        this.stats.perfectClears++;
        bonus += (b2bBonus && n === 4 ? 3200 : PC_SCORE[n]) * level;
        attack += PC_ATTACK;
      }
      attack = Math.floor(attack * this.garbageMultiplier);
      this.score += actionScore + bonus;
      this.lines += n;
      this.stats.attack += attack;

      // Cancel incoming garbage first, send what remains.
      let left = attack;
      while (left > 0 && this.pendingGarbage.length) {
        const g = this.pendingGarbage[0];
        const used = Math.min(left, g.lines);
        g.lines -= used;
        left -= used;
        if (g.lines === 0) this.pendingGarbage.shift();
      }
      if (left > 0) {
        this.outgoing.push(left);
        this.stats.sent += left;
      }

      this.events.push({
        t: 'clear', lines: n, rows, tspin, mini, b2b: b2bBonus, combo: this.combo, pc, attack,
        score: actionScore + bonus,
      });

      if (this.mode === 'infinity') {
        const newLevel = Math.max(this.startLevel, 1 + Math.floor(this.lines / 10));
        if (newLevel !== this.level) {
          this.level = newLevel;
          this.events.push({ t: 'level', level: newLevel });
        }
      }
    }

    if (this.over) return;
    this.holdUsed = false;
    this.spawn();
  }

  // ---------- garbage ----------
  /** Queue incoming garbage (versus). Each call is one chunk sharing a single hole column. */
  receiveGarbage(lines: number): void {
    if (lines <= 0 || this.over) return;
    const col = randInt(this.garbageRng, W);
    this.pendingGarbage.push({ lines: Math.min(lines, 40), col });
    this.stats.received += lines;
  }

  private applyGarbage(): void {
    let budget = GARBAGE_CAP;
    let inserted = 0;
    while (budget > 0 && this.pendingGarbage.length) {
      const g = this.pendingGarbage[0];
      const n = Math.min(g.lines, budget);
      // Anything in the top n rows would be pushed out of the matrix.
      for (let i = 0; i < n * W; i++) {
        if (this.board[i] !== 0) {
          this.gameOver('topout');
          return;
        }
      }
      this.board.copyWithin(0, n * W);
      for (let y = H - n; y < H; y++) {
        for (let x = 0; x < W; x++) this.board[y * W + x] = x === g.col ? 0 : GARBAGE_ID;
      }
      g.lines -= n;
      budget -= n;
      inserted += n;
      if (g.lines === 0) this.pendingGarbage.shift();
    }
    if (inserted) this.events.push({ t: 'garbage', lines: inserted });
  }

  /** Blitz KO: wipe the matrix and keep playing with the same piece sequence. */
  revive(): void {
    this.board.fill(0);
    this.pendingGarbage = [];
    this.combo = -1;
    this.b2b = -1;
    this.over = false;
    this.overReason = null;
    this.hold = null;
    this.holdUsed = false;
    this.spawn();
  }

  private gameOver(reason: 'blockout' | 'lockout' | 'topout'): void {
    this.over = true;
    this.overReason = reason;
    this.events.push({ t: 'over', reason });
  }

  drainEvents(): TetrisEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  drainOutgoing(): number[] {
    const o = this.outgoing;
    this.outgoing = [];
    return o;
  }
}

// ---------- replays ----------
/** Compact replay encoding: flat array [frameDelta, code, frameDelta, code, ...]; code = action*2 + down. */
export function encodeInputs(inputs: InputEvent[]): number[] {
  const out: number[] = [];
  let last = 0;
  for (const ev of inputs) {
    out.push(ev.f - last, ev.a * 2 + (ev.d ? 1 : 0));
    last = ev.f;
  }
  return out;
}

export function decodeInputs(data: number[]): InputEvent[] {
  if (!Array.isArray(data) || data.length % 2 !== 0) throw new Error('bad replay');
  const out: InputEvent[] = [];
  let f = 0;
  for (let i = 0; i < data.length; i += 2) {
    const df = data[i], code = data[i + 1];
    if (!Number.isInteger(df) || df < 0 || !Number.isInteger(code) || code < 0 || code > 15) throw new Error('bad replay');
    f += df;
    out.push({ f, a: (code >> 1) as Action, d: (code & 1) === 1 });
  }
  return out;
}

export interface ReplayResult {
  score: number;
  lines: number;
  level: number;
  frames: number;
  over: boolean;
  stats: Stats;
}

/** Re-simulate an infinity game. Stops at game over or at `endFrame`. */
export function replayGame(
  opts: EngineOptions,
  inputs: InputEvent[],
  endFrame: number,
): ReplayResult {
  const eng = new TetrisEngine(opts);
  let i = 0;
  const batch: InputEvent[] = [];
  while (!eng.over && eng.frame < endFrame) {
    batch.length = 0;
    while (i < inputs.length && inputs[i].f <= eng.frame) batch.push(inputs[i++]);
    eng.step(batch);
    eng.events.length = 0;
  }
  return { score: eng.score, lines: eng.lines, level: eng.level, frames: eng.frame, over: eng.over, stats: eng.stats };
}
