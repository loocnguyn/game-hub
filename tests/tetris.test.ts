import { describe, expect, it } from 'vitest';
import {
  A, COMBO_ATTACK, decodeInputs, encodeInputs, GARBAGE_CAP, GARBAGE_ID, gravityForLevel, H, LOCK_DELAY,
  MAX_LOCK_RESETS, PIECES, replayGame, SHAPES, TetrisEngine, TOP, W, type InputEvent, type Piece,
} from '@shared/tetris.ts';
import { mulberry32 } from '@shared/rng.ts';

const press = (a: number): InputEvent => ({ f: 0, a: a as InputEvent['a'], d: true });
const release = (a: number): InputEvent => ({ f: 0, a: a as InputEvent['a'], d: false });
const tap = (e: TetrisEngine, a: number) => { e.step([press(a)]); e.step([release(a)]); };

function engine(seed = 1, handling = {}) {
  return new TetrisEngine({ seed, mode: 'infinity', handling });
}

/** Fill row y except the given columns. */
function fillRow(e: TetrisEngine, y: number, holes: number[] = []) {
  for (let x = 0; x < W; x++) e.board[y * W + x] = holes.includes(x) ? 0 : GARBAGE_ID;
}
function setPiece(e: TetrisEngine, type: Piece, rot: number, x: number, y: number) {
  e.cur = { type, rot, x, y };
  (e as any).lowestY = y;
}
function occupied(e: TetrisEngine) {
  let n = 0;
  for (const c of e.board) if (c) n++;
  return n;
}

describe('piece shapes', () => {
  it('every piece has 4 cells in every rotation', () => {
    for (const p of PIECES) for (const s of SHAPES[p]) expect(s).toHaveLength(4);
  });
  it('O never changes when rotated', () => {
    for (const s of SHAPES.O) expect(s).toEqual(SHAPES.O[0]);
  });
  it('I is horizontal in state 0 and vertical in state R on column 2', () => {
    expect(new Set(SHAPES.I[0].map(([, y]) => y)).size).toBe(1);
    expect(SHAPES.I[1].every(([x]) => x === 2)).toBe(true);
  });
  it('T points up in spawn state and right in state R', () => {
    expect(SHAPES.T[0]).toContainEqual([1, 0]);
    expect(SHAPES.T[1]).toContainEqual([2, 1]);
    expect(SHAPES.T[2]).toContainEqual([1, 2]);
    expect(SHAPES.T[3]).toContainEqual([0, 1]);
  });
});

describe('randomizer', () => {
  it('uses a 7-bag: every aligned group of 7 contains all pieces', () => {
    const e = engine(42);
    const seq: Piece[] = [e.cur!.type];
    for (let i = 0; i < 139; i++) {
      tap(e, A.HARD);
      if (e.over) break;
      seq.push(e.cur!.type);
      e.board.fill(0); // keep the game alive
    }
    for (let i = 0; i + 7 <= seq.length; i += 7) expect(new Set(seq.slice(i, i + 7)).size).toBe(7);
  });
  it('is deterministic for a seed and differs between seeds', () => {
    const a = engine(7), b = engine(7), c = engine(8);
    expect([a.cur!.type, ...a.nextPieces()]).toEqual([b.cur!.type, ...b.nextPieces()]);
    const seqC = [c.cur!.type, ...c.nextPieces(), ...c.queue];
    const seqA = [a.cur!.type, ...a.nextPieces(), ...a.queue];
    expect(seqC).not.toEqual(seqA);
  });
  it('always shows 5 next pieces', () => {
    const e = engine(3);
    for (let i = 0; i < 50; i++) {
      expect(e.nextPieces()).toHaveLength(5);
      tap(e, A.HARD);
      e.board.fill(0);
    }
  });
});

describe('spawning', () => {
  it('spawns centred at the top of the visible area', () => {
    const e = engine(1);
    const cells = e.cells();
    const xs = cells.map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...xs)).toBeLessThanOrEqual(6);
    // the guideline drops the piece one row right after spawning, so it touches the visible area
    expect(cells.some(([, y]) => y >= TOP)).toBe(true);
  });
  it('blocks out when the spawn area is occupied', () => {
    const e = engine(1);
    for (let y = TOP - 3; y < H; y++) fillRow(e, y, [0]);
    tap(e, A.HARD);
    expect(e.over).toBe(true);
    expect(['blockout', 'lockout']).toContain(e.overReason);
  });
});

describe('movement and handling', () => {
  it('moves one cell per tap and stops at the walls', () => {
    const e = engine(1, { das: 100 });
    const x0 = e.cur!.x;
    tap(e, A.LEFT);
    expect(e.cur!.x).toBe(x0 - 1);
    for (let i = 0; i < 20; i++) tap(e, A.LEFT);
    expect(Math.min(...e.cells().map(([x]) => x))).toBe(0);
    for (let i = 0; i < 20; i++) tap(e, A.RIGHT);
    expect(Math.max(...e.cells().map(([x]) => x))).toBe(W - 1);
  });
  it('auto-repeats after DAS frames at ARR speed', () => {
    const e = engine(5, { das: 10, arr: 2 });
    setPiece(e, 'T', 0, 6, TOP);
    e.step([press(A.LEFT)]); // immediate move -> x = 5
    expect(e.cur!.x).toBe(5);
    for (let i = 0; i < 9; i++) e.step();
    expect(e.cur!.x).toBe(5); // still charging
    e.step(); // DAS charged -> first repeat
    expect(e.cur!.x).toBe(4);
    e.step();
    expect(e.cur!.x).toBe(4);
    e.step(); // ARR 2
    expect(e.cur!.x).toBe(3);
  });
  it('ARR 0 teleports to the wall once DAS is charged', () => {
    const e = engine(5, { das: 5, arr: 0 });
    setPiece(e, 'T', 0, 4, TOP);
    e.step([press(A.RIGHT)]);
    for (let i = 0; i < 5; i++) e.step();
    expect(Math.max(...e.cells().map(([x]) => x))).toBe(W - 1);
  });
  it('the last pressed direction wins and releasing it falls back', () => {
    const e = engine(5, { das: 3, arr: 1 });
    setPiece(e, 'T', 0, 4, TOP);
    e.step([press(A.LEFT)]);
    e.step([press(A.RIGHT)]);
    expect(e.cur!.x).toBe(4);
    e.step([release(A.RIGHT)]);
    for (let i = 0; i < 4; i++) e.step();
    expect(e.cur!.x).toBeLessThan(4);
  });
  it('hard drop lands on the floor, scores 2 per cell and locks', () => {
    const e = engine(1);
    const ghost = e.ghostY();
    const y0 = e.cur!.y;
    const type = e.cur!.type;
    tap(e, A.HARD);
    expect(e.score).toBe((ghost - y0) * 2);
    expect(e.stats.pieces).toBe(1);
    const bottom = [...Array(W).keys()].some((x) => e.board[(H - 1) * W + x] !== 0);
    expect(bottom).toBe(true);
    expect(occupied(e)).toBe(4);
    void type;
  });
  it('soft drop scores 1 per cell and is faster than gravity', () => {
    const e = engine(1, { sdf: 20 });
    const y0 = e.cur!.y;
    e.step([press(A.SOFT)]);
    for (let i = 0; i < 10; i++) e.step();
    expect(e.cur!.y).toBeGreaterThan(y0 + 2);
    expect(e.score).toBe(e.cur!.y - y0);
  });
  it('instant soft drop (sdf 0) goes straight to the floor without locking', () => {
    const e = engine(1, { sdf: 0 });
    e.step([press(A.SOFT)]);
    expect(e.cur!.y).toBe(e.ghostY());
    expect(e.stats.pieces).toBe(0);
  });
  it('gravity at level 1 drops one row per second', () => {
    const e = engine(1);
    const y0 = e.cur!.y;
    for (let i = 0; i < 59; i++) e.step();
    expect(e.cur!.y).toBe(y0);
    e.step();
    expect(e.cur!.y).toBe(y0 + 1);
  });
  it('gravity increases with level and caps at 15', () => {
    for (let l = 2; l <= 15; l++) expect(gravityForLevel(l)).toBeGreaterThan(gravityForLevel(l - 1));
    expect(gravityForLevel(30)).toBe(gravityForLevel(15));
  });
});

describe('lock delay', () => {
  it('locks after LOCK_DELAY frames on the ground', () => {
    const e = engine(1, { sdf: 0 });
    e.step([press(A.SOFT)]);
    e.step([release(A.SOFT)]);
    let frames = 1;
    while (e.stats.pieces === 0 && frames < 200) { e.step(); frames++; }
    expect(e.stats.pieces).toBe(1);
    expect(frames).toBeGreaterThanOrEqual(LOCK_DELAY - 1);
    expect(frames).toBeLessThanOrEqual(LOCK_DELAY + 2);
  });
  it('moving resets the lock timer but only MAX_LOCK_RESETS times', () => {
    const e = engine(1, { sdf: 0, das: 1000 });
    setPiece(e, 'T', 0, 3, H - 2);
    let frames = 0;
    let dir = A.LEFT;
    while (e.stats.pieces === 0 && frames < 2000) {
      for (let i = 0; i < 20 && e.stats.pieces === 0; i++) { e.step(); frames++; }
      if (e.stats.pieces) break;
      tap(e, dir); frames += 2;
      dir = dir === A.LEFT ? A.RIGHT : A.LEFT;
    }
    expect(e.stats.pieces).toBe(1);
    // 15 resets of ~20 frames each plus the final delay: well bounded, never infinite.
    expect(frames).toBeLessThan((MAX_LOCK_RESETS + 2) * (LOCK_DELAY + 2));
    expect(frames).toBeGreaterThan(MAX_LOCK_RESETS * 20);
  });
});

describe('rotation (SRS)', () => {
  it('rotates in place when free and 4 rotations return to start', () => {
    const e = engine(1);
    setPiece(e, 'T', 0, 4, TOP + 5);
    for (let i = 0; i < 4; i++) tap(e, A.CW);
    expect(e.cur!.rot).toBe(0);
    expect(e.cur!.x).toBe(4);
  });
  it('CCW is the inverse of CW and 180 is two CWs', () => {
    const e = engine(1);
    setPiece(e, 'L', 0, 4, TOP + 5);
    tap(e, A.CW); tap(e, A.CCW);
    expect(e.cur!.rot).toBe(0);
    tap(e, A.R180);
    expect(e.cur!.rot).toBe(2);
  });
  it('wall kicks an I piece off the right wall', () => {
    const e = engine(1);
    setPiece(e, 'I', 1, 7, TOP + 5); // vertical at column 9
    expect(e.cells().every(([x]) => x === 9)).toBe(true);
    tap(e, A.CW); // R -> 2 needs a kick to fit horizontally
    expect(e.cur!.rot).toBe(2);
    expect(e.cells().every(([x]) => x >= 0 && x < W)).toBe(true);
  });
  it('fails to rotate when every kick is blocked', () => {
    const e = engine(1);
    for (let y = TOP; y < H; y++) fillRow(e, y, [4]);
    setPiece(e, 'I', 1, 2, H - 4); // vertical in the 1-wide well at x=4
    tap(e, A.CW);
    expect(e.cur!.rot).toBe(1);
  });
});

describe('line clears and scoring', () => {
  it.each([
    [1, 100], [2, 300], [3, 500], [4, 800],
  ])('%i line(s) score %i at level 1', (n, pts) => {
    const e = engine(1);
    for (let i = 0; i < n; i++) fillRow(e, H - 1 - i, [0]);
    e.board[(H - 1 - n) * W + 9] = GARBAGE_ID; // keep a block so this is not a perfect clear
    setPiece(e, 'I', 1, -2, H - 4); // vertical in column 0
    const before = e.score;
    tap(e, A.HARD);
    expect(e.lines).toBe(n);
    expect(e.score - before).toBe(pts);
  });
  it('clears rows and shifts everything above down', () => {
    const e = engine(1);
    fillRow(e, H - 1, [0]);
    e.board[(H - 2) * W + 5] = GARBAGE_ID;
    setPiece(e, 'I', 1, -2, H - 4);
    tap(e, A.HARD);
    // the lone block from row H-2 fell to H-1; the I's 3 remaining cells stack in column 0
    expect(e.board[(H - 1) * W + 5]).toBe(GARBAGE_ID);
    expect(e.board[(H - 1) * W + 0]).not.toBe(0);
    expect(occupied(e)).toBe(4);
  });
  it('levels up every 10 lines in infinity mode', () => {
    const e = engine(1);
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 4; i++) fillRow(e, H - 1 - i, [0]);
      setPiece(e, 'I', 1, -2, H - 4);
      tap(e, A.HARD);
    }
    expect(e.lines).toBe(12);
    expect(e.level).toBe(2);
  });
  it('back-to-back tetrises get x1.5 and +1 attack', () => {
    const e = engine(1);
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 4; i++) fillRow(e, H - 1 - i, [0]);
      e.board[(H - 5) * W + 9] = GARBAGE_ID; // avoid a perfect clear
      setPiece(e, 'I', 1, -2, H - 5 - (k === 0 ? 0 : 0));
      e.cur!.y = e.ghostY();
      tap(e, A.HARD);
      e.drainEvents();
    }
    // second tetris: 800 * 1.5 = 1200; b2b chain length 1
    expect(e.b2b).toBe(1);
    expect(e.stats.attack).toBe(4 + (4 + 1 + COMBO_ATTACK[1]));
  });
  it('a non-difficult clear breaks back-to-back', () => {
    const e = engine(1);
    for (let i = 0; i < 4; i++) fillRow(e, H - 1 - i, [0]);
    e.board[(H - 6) * W + 9] = GARBAGE_ID;
    setPiece(e, 'I', 1, -2, H - 4);
    tap(e, A.HARD);
    expect(e.b2b).toBe(0);
    fillRow(e, H - 1, [0]);
    setPiece(e, 'I', 1, -2, H - 4);
    e.cur!.y = e.ghostY();
    tap(e, A.HARD);
    expect(e.b2b).toBe(-1);
  });
  it('combo counts consecutive clearing pieces and resets on a non-clear', () => {
    const e = engine(1);
    const clearOne = () => {
      e.board.fill(0);
      e.board[(H - 10) * W + 9] = GARBAGE_ID;
      fillRow(e, H - 1, [0]);
      setPiece(e, 'I', 1, -2, 0);
      e.cur!.y = e.ghostY();
      tap(e, A.HARD);
    };
    e.board[(H - 10) * W + 9] = GARBAGE_ID;
    clearOne(); expect(e.combo).toBe(0);
    clearOne(); expect(e.combo).toBe(1);
    clearOne(); expect(e.combo).toBe(2);
    setPiece(e, 'O', 0, 6, 0);
    tap(e, A.HARD);
    expect(e.combo).toBe(-1);
    expect(e.stats.maxCombo).toBe(2);
  });
  it('detects a perfect clear and adds 10 attack', () => {
    const e = engine(1);
    for (let i = 0; i < 4; i++) fillRow(e, H - 1 - i, [0]);
    setPiece(e, 'I', 1, -2, H - 4);
    tap(e, A.HARD);
    const clear = e.drainEvents().find((ev) => ev.t === 'clear');
    expect(clear && clear.t === 'clear' && clear.pc).toBe(true);
    expect(e.stats.perfectClears).toBe(1);
    expect(e.stats.attack).toBe(4 + 10);
    expect(e.score).toBe(800 + 2000);
  });
});

describe('T-spins', () => {
  function tsdSetup() {
    const e = engine(1);
    fillRow(e, H - 1, [4]);
    fillRow(e, H - 2, [3, 4, 5]);
    for (let x = 0; x <= 3; x++) e.board[(H - 3) * W + x] = GARBAGE_ID; // overhang
    return e;
  }
  it('T-spin double via a real rotation: 1200 points, 4 attack', () => {
    const e = tsdSetup();
    setPiece(e, 'T', 1, 3, H - 3);
    tap(e, A.CW);
    expect(e.cur!.rot).toBe(2);
    const before = e.score;
    tap(e, A.HARD);
    const clear = e.drainEvents().find((ev) => ev.t === 'clear');
    expect(clear).toMatchObject({ t: 'clear', lines: 2, tspin: true, mini: false });
    expect(e.score - before).toBe(1200);
    expect(e.stats.attack).toBe(4);
    expect(e.stats.tspins).toBe(1);
  });
  it('the same placement without a rotation is not a T-spin', () => {
    const e = tsdSetup();
    setPiece(e, 'T', 2, 3, H - 3);
    tap(e, A.HARD);
    const clear = e.drainEvents().find((ev) => ev.t === 'clear');
    expect(clear).toMatchObject({ lines: 2, tspin: false });
    expect(e.stats.attack).toBe(1);
  });
  it('classifies a mini T-spin (only one front corner filled)', () => {
    const e = engine(1);
    e.board[(H - 2) * W + 0] = GARBAGE_ID; // top-left corner; bottom corners are the floor
    setPiece(e, 'T', 0, 0, H - 2);
    (e as any).lastRotate = true;
    (e as any).lastKick = 0;
    tap(e, A.HARD);
    const ev = e.drainEvents().find((x) => x.t === 'tspin');
    expect(ev).toMatchObject({ t: 'tspin', mini: true });
    expect(e.score).toBe(100);
  });
  it('the 5th kick upgrades a mini to a full T-spin', () => {
    const e = engine(1);
    e.board[(H - 2) * W + 0] = GARBAGE_ID;
    setPiece(e, 'T', 0, 0, H - 2);
    (e as any).lastRotate = true;
    (e as any).lastKick = 4;
    tap(e, A.HARD);
    expect(e.drainEvents().find((x) => x.t === 'tspin')).toMatchObject({ mini: false });
    expect(e.score).toBe(400);
  });
});

describe('hold', () => {
  it('holds the current piece and can only hold once per piece', () => {
    const e = engine(9);
    const first = e.cur!.type;
    const next = e.nextPieces()[0];
    tap(e, A.HOLD);
    expect(e.hold).toBe(first);
    expect(e.cur!.type).toBe(next);
    tap(e, A.HOLD);
    expect(e.cur!.type).toBe(next); // blocked until the piece locks
    tap(e, A.HARD);
    tap(e, A.HOLD);
    expect(e.cur!.type).toBe(first);
  });
});

describe('garbage (versus)', () => {
  function vs(seed = 1) {
    return new TetrisEngine({ seed, mode: 'versus' });
  }
  it('inserts pending garbage with a single hole after a non-clearing lock', () => {
    const e = vs();
    e.receiveGarbage(3);
    expect(e.totalPending()).toBe(3);
    tap(e, A.HARD);
    expect(e.totalPending()).toBe(0);
    for (let y = H - 3; y < H; y++) {
      const row = [...e.board.subarray(y * W, y * W + W)];
      expect(row.filter((c) => c === 0).length).toBeLessThanOrEqual(1);
      expect(row.filter((c) => c === GARBAGE_ID).length).toBeGreaterThanOrEqual(W - 1 - 4);
    }
  });
  it('caps inserted garbage per lock', () => {
    const e = vs();
    e.receiveGarbage(12);
    tap(e, A.HARD);
    expect(e.totalPending()).toBe(12 - GARBAGE_CAP);
  });
  it('line clears cancel pending garbage before sending', () => {
    const e = vs();
    e.receiveGarbage(3);
    for (let i = 0; i < 4; i++) fillRow(e, H - 1 - i, [0]);
    e.board[(H - 6) * W + 9] = GARBAGE_ID;
    setPiece(e, 'I', 1, -2, H - 4);
    tap(e, A.HARD);
    expect(e.totalPending()).toBe(0);
    expect(e.drainOutgoing()).toEqual([1]); // tetris 4 - 3 cancelled
    expect(e.stats.sent).toBe(1);
  });
  it('tops out when garbage pushes blocks off the top', () => {
    const e = vs();
    for (let y = 0; y < 3; y++) e.board[y * W + 0] = GARBAGE_ID;
    e.receiveGarbage(4);
    setPiece(e, 'O', 0, 6, TOP);
    tap(e, A.HARD);
    expect(e.over).toBe(true);
    expect(e.overReason).toBe('topout');
  });
  it('garbage multiplier scales attack', () => {
    const e = vs();
    e.garbageMultiplier = 1.5;
    for (let i = 0; i < 4; i++) fillRow(e, H - 1 - i, [0]);
    e.board[(H - 6) * W + 9] = GARBAGE_ID;
    setPiece(e, 'I', 1, -2, H - 4);
    tap(e, A.HARD);
    expect(e.drainOutgoing()).toEqual([6]);
  });
  it('revive wipes the board and keeps playing', () => {
    const e = vs();
    for (let y = TOP - 3; y < H; y++) fillRow(e, y, [0]);
    tap(e, A.HARD);
    expect(e.over).toBe(true);
    e.revive();
    expect(e.over).toBe(false);
    expect(occupied(e)).toBe(0);
    expect(e.cur).not.toBeNull();
  });
});

describe('replays', () => {
  function randomGame(seed: number, frames: number) {
    const rng = mulberry32(seed * 31 + 7);
    const eng = new TetrisEngine({ seed, mode: 'infinity', handling: { das: 8, arr: 1, sdf: 20 } });
    const log: InputEvent[] = [];
    const held = new Set<number>();
    while (!eng.over && eng.frame < frames) {
      const batch: InputEvent[] = [];
      if (rng() < 0.25) {
        const a = Math.floor(rng() * 8);
        const down = [A.LEFT, A.RIGHT, A.SOFT].includes(a as never) ? !held.has(a) : true;
        if (down) held.add(a); else held.delete(a);
        batch.push({ f: eng.frame, a: a as InputEvent['a'], d: down });
        if (down && ![A.LEFT, A.RIGHT, A.SOFT].includes(a as never)) {
          batch.push({ f: eng.frame, a: a as InputEvent['a'], d: false });
          held.delete(a);
        }
      }
      log.push(...batch);
      eng.step(batch);
      eng.drainEvents();
      if (eng.cur && !eng.over && !eng.fits(eng.cur)) throw new Error('piece overlaps');
    }
    return { eng, log };
  }

  it('encode/decode round-trips', () => {
    const inputs: InputEvent[] = [
      { f: 0, a: 0, d: true }, { f: 0, a: 0, d: false }, { f: 5, a: 3, d: true }, { f: 900, a: 7, d: true },
    ];
    expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs);
  });
  it('rejects malformed replays', () => {
    expect(() => decodeInputs([1])).toThrow();
    expect(() => decodeInputs([-1, 0])).toThrow();
    expect(() => decodeInputs([0, 99])).toThrow();
    expect(() => decodeInputs([0.5, 1])).toThrow();
    expect(() => decodeInputs('x' as never)).toThrow();
  });
  it.each([1, 2, 3, 99, 12345])('replaying seed %i reproduces the exact result', (seed) => {
    const { eng, log } = randomGame(seed, 6000);
    const r = replayGame({ seed, mode: 'infinity', handling: { das: 8, arr: 1, sdf: 20 } }, decodeInputs(encodeInputs(log)), eng.frame);
    expect(r.score).toBe(eng.score);
    expect(r.lines).toBe(eng.lines);
    expect(r.frames).toBe(eng.frame);
    expect(r.over).toBe(eng.over);
    expect(r.stats).toEqual(eng.stats);
  });
  it('a tampered replay does not reproduce the claimed score', () => {
    const { eng, log } = randomGame(5, 4000);
    const tampered = log.filter((_, i) => i % 5 !== 0);
    const r = replayGame({ seed: 5, mode: 'infinity', handling: { das: 8, arr: 1, sdf: 20 } }, tampered, eng.frame);
    expect(r.score === eng.score && r.frames === eng.frame && r.stats.pieces === eng.stats.pieces && r.lines === eng.lines).toBe(false);
  });
});

describe('fuzz', () => {
  it('500 random games never break invariants', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rng = mulberry32(seed);
      const eng = new TetrisEngine({ seed, mode: seed % 2 ? 'infinity' : 'versus', handling: { das: 1 + (seed % 10), arr: seed % 3, sdf: seed % 4 === 0 ? 0 : 20 } });
      let lastScore = 0;
      for (let f = 0; f < 1500 && !eng.over; f++) {
        const batch: InputEvent[] = [];
        if (rng() < 0.4) batch.push({ f, a: Math.floor(rng() * 8) as InputEvent['a'], d: rng() < 0.6 });
        if (seed % 2 === 0 && rng() < 0.01) eng.receiveGarbage(1 + Math.floor(rng() * 5));
        eng.step(batch);
        eng.drainEvents();
        const problems: string[] = [];
        if (eng.score < lastScore) problems.push('score decreased');
        lastScore = eng.score;
        if (eng.board.some((c) => c > GARBAGE_ID)) problems.push('bad cell');
        if (eng.cur && !eng.over && !eng.fits(eng.cur)) problems.push('piece overlaps');
        if (eng.lines > eng.stats.pieces * 4) problems.push('too many lines');
        if (problems.length) throw new Error(`seed ${seed} frame ${f}: ${problems.join(', ')}`);
      }
    }
  });
});
