import { describe, expect, it } from 'vitest';
import { Dots } from '@shared/dots.ts';
import { conflicts, countSolutions, generateSudoku, isSolved, PEERS, SUDOKU_LEVELS, type SudokuDifficulty } from '@shared/sudoku.ts';
import { createBoardState, joinBoard, playMove, validateBoardSettings } from '@shared/boardroom.ts';

describe('dots and boxes', () => {
  it('has 2n(n+1) lines and n² boxes', () => {
    for (const n of [3, 4, 5, 6]) {
      const g = new Dots(n);
      expect(g.lines.length).toBe(2 * n * (n + 1));
      expect(g.boxes.length).toBe(n * n);
    }
    expect(() => new Dots(2)).toThrow();
  });
  it('every box has 4 distinct sides and every line touches 1-2 boxes', () => {
    const g = new Dots(4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) expect(new Set(g.boxSides(r, c)).size).toBe(4);
    for (let l = 0; l < g.lines.length; l++) {
      const b = g.boxesOf(l);
      expect(b.length).toBeGreaterThanOrEqual(1);
      expect(b.length).toBeLessThanOrEqual(2);
      for (const [r, c] of b) expect(g.boxSides(r, c)).toContain(l);
    }
  });
  it('completing a box scores it and keeps the turn', () => {
    const g = new Dots(3);
    const [top, bottom, left, right] = g.boxSides(0, 0);
    expect(g.play(top)).toBe(0); expect(g.turn).toBe(2);
    expect(g.play(bottom)).toBe(0); expect(g.turn).toBe(1);
    expect(g.play(left)).toBe(0); expect(g.turn).toBe(2);
    expect(g.play(right)).toBe(1);
    expect(g.turn).toBe(2); // player 2 completed it and moves again
    expect(g.boxes[0]).toBe(2);
    expect(g.score).toEqual([0, 1]);
  });
  it('one line can complete two boxes', () => {
    const g = new Dots(3);
    const shared = g.v(0, 1); // between box (0,0) and (0,1)
    const others = [...g.boxSides(0, 0), ...g.boxSides(0, 1)].filter((l) => l !== shared);
    for (const l of others) g.play(l);
    const mover = g.turn;
    expect(g.play(shared)).toBe(2);
    expect(g.score[mover - 1]).toBe(2);
  });
  it('rejects taken or out-of-range lines', () => {
    const g = new Dots(3);
    g.play(0);
    expect(g.play(0)).toBe(-1);
    expect(g.play(-1)).toBe(-1);
    expect(g.play(999)).toBe(-1);
    expect(g.play(1.5)).toBe(-1);
  });
  it('random full games: total boxes = n², winner matches score', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const n = 3 + (seed % 4);
      const g = new Dots(n);
      let x = seed;
      while (!g.over) {
        const free = [...g.lines.keys()].filter((l) => g.lines[l] === 0);
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        expect(g.play(free[x % free.length])).toBeGreaterThanOrEqual(0);
      }
      expect(g.score[0] + g.score[1]).toBe(n * n);
      const w = g.winner();
      if (g.score[0] > g.score[1]) expect(w).toBe(1);
      else if (g.score[1] > g.score[0]) expect(w).toBe(2);
      else expect(w).toBe(0);
    }
  });
  it('board room keeps the turn after a box and ends with the right winner', () => {
    const s = createBoardState('dots', validateBoardSettings('dots', { base: 60_000, color: 'first', dots: { size: 3 } }), { id: 'a', name: 'A' }, 0);
    joinBoard(s, { id: 'b', name: 'B' }, 0);
    const g = new Dots(3);
    let t = 0;
    while (s.status === 'playing') {
      const free = [...g.lines.keys()].filter((l) => g.lines[l] === 0);
      const line = free[0];
      const mover = s.turn;
      expect(g.turn - 1).toBe(mover);
      g.play(line);
      playMove(s, s.seats[mover]!.id, String(line), (t += 100));
    }
    const w = g.winner();
    expect(s.result!.winner).toBe(w === 0 ? null : w === 1 ? 0 : 1);
  });
});

describe('sudoku', () => {
  it('peers: every cell has exactly 20', () => {
    for (const p of PEERS) expect(p).toHaveLength(20);
  });
  it.each(Object.keys(SUDOKU_LEVELS) as SudokuDifficulty[])('%s puzzles have a unique solution and valid givens', (d) => {
    for (let seed = 1; seed <= 8; seed++) {
      const { puzzle, solution } = generateSudoku(seed * 97, d);
      expect(countSolutions(puzzle, 2)).toBe(1);
      expect(isSolved(puzzle, solution)).toBe(true);
      for (let i = 0; i < 81; i++) if (puzzle[i]) expect(puzzle[i]).toBe(solution[i]);
      const clues = puzzle.filter(Boolean).length;
      expect(clues).toBeGreaterThanOrEqual(SUDOKU_LEVELS[d].clues - 1);
      expect(clues).toBeLessThanOrEqual(SUDOKU_LEVELS[d].clues + 14);
    }
  });
  it('harder levels have fewer clues', () => {
    const c = (d: SudokuDifficulty) => generateSudoku(5, d).puzzle.filter(Boolean).length;
    expect(c('easy')).toBeGreaterThan(c('medium'));
    expect(c('medium')).toBeGreaterThan(c('hard'));
  });
  it('is deterministic per seed', () => {
    expect(generateSudoku(42, 'hard')).toEqual(generateSudoku(42, 'hard'));
    expect(generateSudoku(42, 'hard').puzzle).not.toEqual(generateSudoku(43, 'hard').puzzle);
  });
  it('isSolved rejects wrong, incomplete or tampered grids', () => {
    const { puzzle, solution } = generateSudoku(7, 'medium');
    expect(isSolved(puzzle, solution)).toBe(true);
    const wrong = solution.slice();
    [wrong[0], wrong[1]] = [wrong[1], wrong[0]];
    expect(isSolved(puzzle, wrong)).toBe(false);
    const hole = solution.slice(); hole[40] = 0;
    expect(isSolved(puzzle, hole)).toBe(false);
    expect(isSolved(puzzle, solution.slice(0, 80))).toBe(false);
    expect(isSolved(puzzle, solution.map((v) => v + 0.5))).toBe(false);
    // a valid grid that changes a given is rejected
    const relabel = solution.map((v) => (v % 9) + 1);
    expect(conflicts(relabel).size).toBe(0);
    expect(isSolved(puzzle, relabel)).toBe(false);
  });
  it('conflicts flags duplicates in rows, columns and boxes', () => {
    const g = new Array(81).fill(0);
    g[0] = 5; g[8] = 5; // row
    expect([...conflicts(g)].sort((a, b) => a - b)).toEqual([0, 8]);
    const b = new Array(81).fill(0);
    b[0] = 3; b[10] = 3; // box
    expect(conflicts(b).size).toBe(2);
  });
  it('countSolutions detects contradictions and multiple solutions', () => {
    const empty = new Array(81).fill(0);
    expect(countSolutions(empty, 2)).toBe(2);
    const bad = new Array(81).fill(0);
    bad[0] = 1; bad[1] = 1;
    expect(countSolutions(bad, 2)).toBe(0);
  });
});
