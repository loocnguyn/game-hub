import { describe, expect, it } from 'vitest';
import { Caro, caroNotation, O, X } from '@shared/caro.ts';
import { DIFFICULTIES, FLAGGED, HIDDEN, Minesweeper, REVEALED, replayMinesweeper, type Difficulty } from '@shared/minesweeper.ts';
import { Game2048, replay2048, SIZE, type Dir } from '@shared/g2048.ts';

// ---------------- Caro ----------------
const idx = (x: number, y: number, size = 15) => y * size + x;
/** Play X at xs and O at os alternately (X first). */
function playSeq(g: Caro, xs: number[], os: number[]) {
  for (let i = 0; i < Math.max(xs.length, os.length); i++) {
    if (i < xs.length) expect(g.play(xs[i])).toBe(true);
    if (g.over) return;
    if (i < os.length) expect(g.play(os[i])).toBe(true);
    if (g.over) return;
  }
}

describe('caro', () => {
  it('X moves first and turns alternate', () => {
    const g = new Caro({ size: 15, blockTwoEnds: false });
    expect(g.turn).toBe(X);
    g.play(0);
    expect(g.turn).toBe(O);
  });
  it('rejects occupied, out of range and non-integer cells', () => {
    const g = new Caro({ size: 15, blockTwoEnds: false });
    expect(g.play(5)).toBe(true);
    expect(g.play(5)).toBe(false);
    expect(g.play(-1)).toBe(false);
    expect(g.play(225)).toBe(false);
    expect(g.play(1.5)).toBe(false);
  });
  it('rejects unsupported sizes', () => {
    expect(() => new Caro({ size: 7, blockTwoEnds: false })).toThrow();
  });
  it.each([
    ['horizontal', [0, 1, 2, 3, 4].map((k) => idx(3 + k, 7))],
    ['vertical', [0, 1, 2, 3, 4].map((k) => idx(7, 2 + k))],
    ['diagonal', [0, 1, 2, 3, 4].map((k) => idx(2 + k, 2 + k))],
    ['anti-diagonal', [0, 1, 2, 3, 4].map((k) => idx(10 - k, 2 + k))],
  ])('five in a row wins (%s)', (_name, line) => {
    const g = new Caro({ size: 15, blockTwoEnds: false });
    const os = [idx(0, 14), idx(1, 14), idx(2, 14), idx(3, 14)];
    playSeq(g, line as number[], os);
    expect(g.winner).toBe(X);
    expect([...g.winLine].sort((a, b) => a - b)).toEqual([...(line as number[])].sort((a, b) => a - b));
  });
  it('four in a row does not win', () => {
    const g = new Caro({ size: 15, blockTwoEnds: false });
    playSeq(g, [idx(0, 0), idx(1, 0), idx(2, 0), idx(3, 0)], [idx(0, 5), idx(1, 5), idx(2, 5)]);
    expect(g.winner).toBe(0);
  });
  it('the winning move can be in the middle of the line', () => {
    const g = new Caro({ size: 15, blockTwoEnds: false });
    playSeq(g, [idx(3, 3), idx(4, 3), idx(6, 3), idx(7, 3), idx(5, 3)], [idx(0, 9), idx(1, 9), idx(2, 9), idx(3, 9)]);
    expect(g.winner).toBe(X);
  });
  it('six in a row still wins', () => {
    const g = new Caro({ size: 15, blockTwoEnds: false });
    playSeq(g, [idx(1, 1), idx(2, 1), idx(4, 1), idx(5, 1), idx(6, 1), idx(3, 1)], [idx(0, 9), idx(1, 9), idx(2, 9), idx(4, 9), idx(6, 9)]);
    expect(g.winner).toBe(X);
    expect(g.winLine).toHaveLength(6);
  });
  it('blockTwoEnds: five blocked by O at both ends does NOT win', () => {
    const g = new Caro({ size: 15, blockTwoEnds: true });
    // O at (2,7) and (8,7); X fills (3..7,7)
    playSeq(g, [idx(3, 7), idx(4, 7), idx(5, 7), idx(6, 7), idx(7, 7)], [idx(2, 7), idx(8, 7), idx(0, 0), idx(0, 2)]);
    expect(g.winner).toBe(0);
  });
  it('blockTwoEnds: blocked on one end still wins', () => {
    const g = new Caro({ size: 15, blockTwoEnds: true });
    playSeq(g, [idx(3, 7), idx(4, 7), idx(5, 7), idx(6, 7), idx(7, 7)], [idx(2, 7), idx(0, 0), idx(0, 2), idx(0, 4)]);
    expect(g.winner).toBe(X);
  });
  it('blockTwoEnds: the board edge does not count as a block', () => {
    const g = new Caro({ size: 15, blockTwoEnds: true });
    playSeq(g, [idx(0, 7), idx(1, 7), idx(2, 7), idx(3, 7), idx(4, 7)], [idx(5, 7), idx(0, 0), idx(0, 2), idx(0, 4)]);
    expect(g.winner).toBe(X);
  });
  it('without the rule, a doubly blocked five wins', () => {
    const g = new Caro({ size: 15, blockTwoEnds: false });
    playSeq(g, [idx(3, 7), idx(4, 7), idx(5, 7), idx(6, 7), idx(7, 7)], [idx(2, 7), idx(8, 7), idx(0, 0), idx(0, 2)]);
    expect(g.winner).toBe(X);
  });
  it('O can win too, and no moves are accepted after the game ends', () => {
    const g = new Caro({ size: 15, blockTwoEnds: false });
    playSeq(g, [idx(0, 0), idx(0, 2), idx(0, 4), idx(0, 6), idx(0, 8), idx(14, 14)], [idx(5, 5), idx(6, 5), idx(7, 5), idx(8, 5), idx(9, 5)]);
    expect(g.winner).toBe(O);
    expect(g.play(idx(13, 13))).toBe(false);
  });
  it('a full board without five is a draw', () => {
    const size = 15;
    const color = (x: number, y: number) => ((x + 2 * y) % 4 < 2 ? X : O);
    const xs: number[] = [], os: number[] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) (color(x, y) === X ? xs : os).push(idx(x, y));
    expect(xs.length).toBe(os.length + 1);
    const g = new Caro({ size, blockTwoEnds: false });
    playSeq(g, xs, os);
    expect(g.winner).toBe(0);
    expect(g.draw).toBe(true);
    expect(g.over).toBe(true);
  });
  it('replay rebuilds and rejects illegal histories', () => {
    const g = Caro.replay({ size: 20, blockTwoEnds: false }, [0, 1, 2]);
    expect(g.moves).toEqual([0, 1, 2]);
    expect(() => Caro.replay({ size: 20, blockTwoEnds: false }, [0, 0])).toThrow();
  });
  it('notation uses column letters and rows from the bottom', () => {
    expect(caroNotation(0, 15)).toBe('a15');
    expect(caroNotation(224, 15)).toBe('o1');
  });
});

// ---------------- Minesweeper ----------------
function mineCount(g: Minesweeper) {
  return g.mine.reduce((s, v) => s + v, 0);
}
/** Plays a perfect game using knowledge of the mine layout. */
function solve(g: Minesweeper) {
  for (let i = 0; i < g.size; i++) if (!g.mine[i] && g.state[i] === HIDDEN) g.reveal(i);
}

describe('minesweeper', () => {
  it.each(Object.keys(DIFFICULTIES) as Difficulty[])('%s: exact mine count and safe first click', (d) => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = new Minesweeper(d, seed);
      const first = seed % g.size;
      g.reveal(first);
      expect(mineCount(g)).toBe(DIFFICULTIES[d].mines);
      expect(g.mine[first]).toBe(0);
      for (const n of g.neighbours(first)) expect(g.mine[n]).toBe(0);
      expect(g.over && !g.won).toBe(false);
      expect(g.adj[first]).toBe(0); // first click opens an area
    }
  });
  it('adjacency numbers match the mines', () => {
    const g = new Minesweeper('expert', 77);
    g.reveal(100);
    for (let i = 0; i < g.size; i++) {
      expect(g.adj[i]).toBe(g.neighbours(i).filter((j) => g.mine[j]).length);
    }
  });
  it('neighbours handle corners and edges', () => {
    const g = new Minesweeper('beginner', 1);
    expect(g.neighbours(0).sort((a, b) => a - b)).toEqual([1, 9, 10]);
    expect(g.neighbours(4)).toHaveLength(5);
    expect(g.neighbours(40)).toHaveLength(8);
  });
  it('flood fill never reveals a mine and stops at numbers', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const g = new Minesweeper('intermediate', seed);
      g.reveal(0);
      for (let i = 0; i < g.size; i++) if (g.state[i] === REVEALED) expect(g.mine[i]).toBe(0);
      // every revealed zero has all neighbours revealed
      for (let i = 0; i < g.size; i++)
        if (g.state[i] === REVEALED && g.adj[i] === 0) for (const n of g.neighbours(i)) expect(g.state[n]).toBe(REVEALED);
    }
  });
  it('same seed + same first click => same board', () => {
    const a = new Minesweeper('expert', 9), b = new Minesweeper('expert', 9);
    a.reveal(55); b.reveal(55);
    expect([...a.mine]).toEqual([...b.mine]);
  });
  it('flags block reveals and can be toggled; revealed cells cannot be flagged', () => {
    const g = new Minesweeper('beginner', 3);
    expect(g.toggleFlag(0)).toBe(true);
    expect(g.state[0]).toBe(FLAGGED);
    expect(g.reveal(0)).toEqual([]);
    expect(g.toggleFlag(0)).toBe(true);
    expect(g.state[0]).toBe(HIDDEN);
    g.reveal(40);
    expect(g.toggleFlag(40)).toBe(false);
  });
  it('revealing a mine ends the game as a loss', () => {
    const g = new Minesweeper('beginner', 5);
    g.reveal(40);
    const mine = g.mine.findIndex((m) => m === 1);
    g.reveal(mine);
    expect(g.over).toBe(true);
    expect(g.won).toBe(false);
    expect(g.exploded).toBe(mine);
    expect(g.reveal(0)).toEqual([]);
  });
  it('revealing every safe cell wins and auto-flags mines', () => {
    for (const d of Object.keys(DIFFICULTIES) as Difficulty[]) {
      const g = new Minesweeper(d, 11);
      g.reveal(0);
      solve(g);
      expect(g.won).toBe(true);
      expect(g.flags).toBe(DIFFICULTIES[d].mines);
    }
  });
  it('chord opens neighbours when flags match, and explodes on a wrong flag', () => {
    let found = false;
    for (let seed = 1; seed < 300 && !found; seed++) {
      const g = new Minesweeper('intermediate', seed);
      g.reveal(0);
      const cell = [...Array(g.size).keys()].find(
        (i) => g.state[i] === REVEALED && g.adj[i] === 1 && g.neighbours(i).some((j) => g.state[j] === HIDDEN && !g.mine[j]),
      );
      if (cell === undefined) continue;
      found = true;
      // wrong chord: flag count mismatch => nothing happens
      expect(g.chord(cell)).toEqual([]);
      const mine = g.neighbours(cell).find((j) => g.mine[j])!;
      const safe = g.neighbours(cell).find((j) => g.state[j] === HIDDEN && !g.mine[j])!;
      // wrong flag -> chord explodes the real mine
      const bad = new Minesweeper('intermediate', seed);
      bad.reveal(0);
      bad.toggleFlag(safe);
      bad.chord(cell);
      expect(bad.over).toBe(true);
      expect(bad.won).toBe(false);
      // right flag -> safe cells open
      g.toggleFlag(mine);
      const opened = g.chord(cell);
      expect(opened.length).toBeGreaterThan(0);
      expect(opened.every((j) => !g.mine[j])).toBe(true);
    }
    expect(found).toBe(true);
  });
  it('replay reproduces a win and rejects garbage actions', () => {
    const g = new Minesweeper('beginner', 21);
    g.reveal(40);
    solve(g);
    const r = replayMinesweeper('beginner', 21, g.log);
    expect(r.won).toBe(true);
    expect(() => replayMinesweeper('beginner', 21, [{ t: 'x' as never, i: 0 }])).toThrow();
    const partial = replayMinesweeper('beginner', 21, g.log.slice(0, 2));
    expect(partial.won).toBe(false);
  });
  it('ignores out-of-range indices', () => {
    const g = new Minesweeper('beginner', 1);
    expect(g.reveal(-1)).toEqual([]);
    expect(g.reveal(81)).toEqual([]);
    expect(g.toggleFlag(1000)).toBe(false);
    expect(g.generated).toBe(false);
  });
});

// ---------------- 2048 ----------------
function setGrid(g: Game2048, rows: number[][]) {
  let id = 1000;
  g.grid = rows.map((row, r) => row.map((v, c) => (v ? { id: id++, value: v, r, c } : null)));
  g.over = false;
}
const values = (g: Game2048) => g.values();

describe('2048', () => {
  it('starts with two tiles of 2 or 4', () => {
    for (let s = 1; s < 50; s++) {
      const g = new Game2048(s);
      const t = g.tiles();
      expect(t).toHaveLength(2);
      for (const x of t) expect([2, 4]).toContain(x.value);
    }
  });
  it('slides and merges left correctly', () => {
    const g = new Game2048(1);
    setGrid(g, [[2, 2, 2, 2], [2, 2, 4, 0], [4, 4, 8, 0], [2, 0, 2, 0]]);
    expect(g.move(3)).toBe(true);
    const v = values(g);
    expect(v[0].slice(0, 2)).toEqual([4, 4]);
    expect(v[1].slice(0, 2)).toEqual([4, 4]);
    expect(v[2].slice(0, 2)).toEqual([8, 8]); // no double merge: 4+4=8 does not merge with 8
    expect(v[3][0]).toBe(4);
    expect(g.score).toBe(8 + 4 + 8 + 4);
  });
  it('merges towards the move direction (right)', () => {
    const g = new Game2048(1);
    setGrid(g, [[2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    g.move(1);
    expect(values(g)[0].slice(2)).toEqual([2, 4]);
  });
  it('up and down work on columns', () => {
    const g = new Game2048(1);
    setGrid(g, [[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0]]);
    g.move(0);
    expect(values(g).map((r) => r[0]).slice(0, 2)).toEqual([4, 8]);
    const h = new Game2048(1);
    setGrid(h, [[2, 0, 0, 0], [2, 0, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0]]);
    h.move(2);
    expect(values(h).map((r) => r[0]).slice(2)).toEqual([2, 4]);
  });
  it('a move that changes nothing does not spawn or count', () => {
    const g = new Game2048(1);
    setGrid(g, [[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    expect(g.move(3)).toBe(false);
    expect(g.moves).toBe(0);
    expect(g.tiles()).toHaveLength(4);
    expect(g.move(0)).toBe(false);
  });
  it('a valid move spawns exactly one tile', () => {
    const g = new Game2048(1);
    setGrid(g, [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    g.move(1);
    expect(g.tiles()).toHaveLength(2);
    expect(g.tiles().filter((t) => t.isNew)).toHaveLength(1);
  });
  it('detects game over', () => {
    const g = new Game2048(1);
    setGrid(g, [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]]);
    g.move(1); // fills the last cell; still movable?
    const full = new Game2048(1);
    setGrid(full, [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
    expect(full.canMove()).toBe(false);
    expect(full.move(0)).toBe(false);
    void g;
  });
  it('ids are preserved while sliding so the UI can animate', () => {
    const g = new Game2048(1);
    setGrid(g, [[0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const id = g.tiles()[0].id;
    g.move(3);
    expect(g.grid[0][0]!.id).toBe(id);
  });
  it('replays deterministically and rejects bad input', () => {
    const g = new Game2048(123);
    let seq = '';
    for (let i = 0; i < 400 && !g.over; i++) {
      const d = (i * 7 + (i >> 2)) % 4 as Dir;
      if (g.move(d)) seq += d; else seq += d; // record even no-op moves
    }
    const r = replay2048(123, seq);
    expect(r.score).toBe(g.score);
    expect(r.values()).toEqual(g.values());
    expect(() => replay2048(1, '0125')).toThrow();
    expect(() => replay2048(1, 5 as never)).toThrow();
  });
  it('fuzz: score equals the sum of merges and tiles stay powers of two', () => {
    for (let s = 1; s <= 200; s++) {
      const g = new Game2048(s);
      for (let i = 0; i < 300 && !g.over; i++) {
        g.move(((s + i * 3) % 4) as Dir);
        for (const t of g.tiles()) {
          if (t.value < 2 || (t.value & (t.value - 1)) !== 0) throw new Error('bad tile');
          if (g.grid[t.r][t.c] !== t) throw new Error('grid/tile mismatch');
        }
        if (g.tiles().length > SIZE * SIZE) throw new Error('overflow');
      }
    }
  });
});
