// Sudoku generator + solver. Puzzles are generated from a seed and always have exactly one solution,
// so the server can regenerate the puzzle and check a submitted solution.
import { mulberry32, shuffle } from './rng.ts';

export type SudokuDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export const SUDOKU_LEVELS: Record<SudokuDifficulty, { clues: number; label: string }> = {
  easy: { clues: 40, label: 'Dễ' },
  medium: { clues: 32, label: 'Trung bình' },
  hard: { clues: 27, label: 'Khó' },
  expert: { clues: 23, label: 'Chuyên gia' },
};

const ROW = (i: number) => Math.floor(i / 9);
const COL = (i: number) => i % 9;
const BOX = (i: number) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const s = new Set<number>();
  for (let j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
  return [...s];
});

const ALL = 0x3fe; // bits 1..9
const popcount = (x: number) => {
  let n = 0;
  while (x) { x &= x - 1; n++; }
  return n;
};

/**
 * Count solutions (stops at `limit`). If `out` is given, the first solution found is written into it.
 * `order` optionally randomises digit order (used to fill a random full grid).
 */
export function countSolutions(grid: number[], limit = 2, out?: number[], rng?: () => number): number {
  const g = grid.slice();
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const bit = 1 << v;
    if (rows[ROW(i)] & bit || cols[COL(i)] & bit || boxes[BOX(i)] & bit) return 0; // contradiction
    rows[ROW(i)] |= bit; cols[COL(i)] |= bit; boxes[BOX(i)] |= bit;
  }
  let count = 0;
  const solve = (): boolean => {
    // Pick the empty cell with the fewest candidates (MRV).
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ALL & ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]);
      const n = popcount(mask);
      if (n < bestN) { best = i; bestMask = mask; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) {
      count++;
      if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i];
      return count >= limit;
    }
    if (bestN === 0) return false;
    const digits: number[] = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (rng) shuffle(rng, digits);
    const r = ROW(best), c = COL(best), b = BOX(best);
    for (const d of digits) {
      const bit = 1 << d;
      g[best] = d; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
      if (solve()) return true;
      g[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
    }
    return false;
  };
  solve();
  return count;
}

export interface SudokuPuzzle {
  puzzle: number[]; // 0 = empty
  solution: number[];
}

export function generateSudoku(seed: number, difficulty: SudokuDifficulty): SudokuPuzzle {
  const level = SUDOKU_LEVELS[difficulty];
  if (!level) throw new Error('bad difficulty');
  const rng = mulberry32(seed);
  const solution = new Array(81).fill(0);
  countSolutions(new Array(81).fill(0), 1, solution, rng);
  const puzzle = solution.slice();
  const order = shuffle(rng, [...Array(81).keys()]);
  let clues = 81;
  for (const i of order) {
    if (clues <= level.clues) break;
    // Remove symmetric pairs for nicer-looking puzzles.
    const j = 80 - i;
    if (!puzzle[i]) continue;
    const saved = [puzzle[i], puzzle[j]];
    puzzle[i] = 0;
    puzzle[j] = 0;
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[i] = saved[0];
      puzzle[j] = saved[1];
    } else {
      clues -= i === j ? 1 : saved[1] ? 2 : 1;
    }
  }
  return { puzzle, solution };
}

/** Cells that conflict with another filled cell in the same row/column/box. */
export function conflicts(grid: number[]): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue;
    for (const j of PEERS[i]) if (grid[j] === grid[i]) { bad.add(i); bad.add(j); }
  }
  return bad;
}

/** True if `grid` is a complete valid solution that respects the puzzle's givens. */
export function isSolved(puzzle: number[], grid: number[]): boolean {
  if (!Array.isArray(grid) || grid.length !== 81) return false;
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (!Number.isInteger(v) || v < 1 || v > 9) return false;
    if (puzzle[i] && puzzle[i] !== v) return false;
  }
  return conflicts(grid).size === 0;
}
