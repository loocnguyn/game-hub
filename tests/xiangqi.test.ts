import { describe, expect, it } from 'vitest';
import { iccsToSq, moveToIccs, parseIccs, perft, sqToIccs, Xiangqi, XQ_START_FEN } from '@shared/xiangqi.ts';

const mv = (s: string) => parseIccs(s)!;
const legalTargets = (g: Xiangqi, from: string) => g.moves(iccsToSq(from)).map((m) => sqToIccs(m.to)).sort();

describe('notation helpers', () => {
  it('ICCS round-trips every square', () => {
    for (let sq = 0; sq < 90; sq++) expect(iccsToSq(sqToIccs(sq))).toBe(sq);
  });
  it('red rook starts on a0 and black king on e9', () => {
    const g = new Xiangqi();
    expect(g.board[iccsToSq('a0')]).toBe('R');
    expect(g.board[iccsToSq('e9')]).toBe('k');
  });
  it('rejects malformed moves', () => {
    expect(parseIccs('z0a1')).toBeNull();
    expect(parseIccs('a0')).toBeNull();
    expect(parseIccs(123 as never)).toBeNull();
  });
});

describe('FEN', () => {
  it('round-trips the start position', () => {
    expect(new Xiangqi().fen()).toBe(XQ_START_FEN);
  });
  it('accepts E/H aliases and rejects broken FENs', () => {
    const g = new Xiangqi('rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR w - - 0 1');
    expect(g.fen().split(' ')[0]).toBe(XQ_START_FEN.split(' ')[0]);
    expect(() => new Xiangqi('9/9 w')).toThrow();
    expect(() => new Xiangqi('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNX w - - 0 1')).toThrow();
  });
});

describe('perft (move generator correctness)', () => {
  const g = new Xiangqi();
  it('depth 1 = 44', () => expect(perft(g, 1)).toBe(44));
  it('depth 2 = 1920', () => expect(perft(g, 2)).toBe(1920));
  it('depth 3 = 79666', () => expect(perft(g, 3)).toBe(79666));
  it('leaves the position untouched', () => expect(g.fen()).toBe(XQ_START_FEN));
});

describe('piece movement rules', () => {
  it('horse is blocked by a piece next to it (cản chân mã)', () => {
    const g = new Xiangqi();
    // b0 horse: leg b1 is empty -> a2, c2 reachable
    expect(legalTargets(g, 'b0')).toEqual(['a2', 'c2']);
    const blocked = new Xiangqi('3k5/9/9/9/9/9/9/9/1P7/1N2K4 w - - 0 1');
    expect(legalTargets(blocked, 'b0')).toEqual(['d1']); // up blocked, right-hand leg (c0) free
  });
  it('elephant needs a free eye and cannot cross the river', () => {
    const g = new Xiangqi('3k5/9/9/9/9/2B6/9/9/9/4K4 w - - 0 1'); // red elephant on c4 (own side, row 5)
    expect(legalTargets(g, 'c4')).toEqual(['a2', 'e2']); // cannot go to a6/e6 across the river
    const eye = new Xiangqi('3k5/9/9/9/9/9/9/9/3P5/2B1K4 w - - 0 1');
    expect(legalTargets(eye, 'c0')).toEqual(['a2']); // d1 blocks the eye towards e2
  });
  it('advisor and king stay in the palace', () => {
    const g = new Xiangqi('4k4/9/9/9/9/9/9/9/9/3AK4 w - - 0 1');
    expect(legalTargets(g, 'd0')).toEqual(['e1']);
    const k = new Xiangqi('3k5/9/9/9/9/9/9/9/9/5K3 w - - 0 1');
    expect(legalTargets(k, 'f0')).toEqual(['e0', 'f1'].sort());
  });
  it('cannon needs exactly one screen to capture', () => {
    const g = new Xiangqi('4k4/9/9/9/4p4/9/9/4C4/9/3K5 w - - 0 1');
    expect(legalTargets(g, 'e2')).not.toContain('e5');
    const screened = new Xiangqi('4k4/9/9/4p4/9/4P4/9/4C4/9/3K5 w - - 0 1');
    const t = legalTargets(screened, 'e2');
    expect(t).toContain('e6'); // jumps the screen on e4 to capture e6
    expect(t).not.toContain('e4');
    expect(t).not.toContain('e5');
  });
  it('pawn moves forward only before the river and sideways after', () => {
    const g = new Xiangqi('3k5/9/9/9/9/9/4P4/9/9/5K3 w - - 0 1');
    expect(legalTargets(g, 'e3')).toEqual(['e4']);
    const crossed = new Xiangqi('3k5/9/9/9/4P4/9/9/9/9/5K3 w - - 0 1');
    expect(legalTargets(crossed, 'e5')).toEqual(['d5', 'e6', 'f5']);
  });
  it('rook slides until blocked and captures enemies only', () => {
    const g = new Xiangqi('3k5/9/9/9/p8/9/9/9/9/R4K3 w - - 0 1');
    const t = legalTargets(g, 'a0');
    expect(t).toContain('a5'); // captures the black pawn
    expect(t).not.toContain('a6'); // cannot jump past it
    expect(t).toContain('e0');
    expect(t).not.toContain('f0'); // own king
  });
});

describe('king safety', () => {
  it('kings may not face each other on an open file (lộ mặt tướng)', () => {
    const g = new Xiangqi('4k4/9/9/9/9/9/9/9/4R4/3K5 w - - 0 1');
    // King d0 -> e0 would face the black king through nothing? rook e1 is between -> legal
    expect(legalTargets(g, 'd0')).toContain('e0');
    // but moving the rook off the file afterwards would be illegal
    const facing = new Xiangqi('4k4/9/9/9/9/9/9/9/4R4/4K4 w - - 0 1');
    expect(legalTargets(facing, 'e1').every((s) => s[0] === 'e')).toBe(true);
  });
  it('cannot leave the king in check', () => {
    const g = new Xiangqi('4k4/9/9/9/9/9/9/9/9/r2K5 w - - 0 1'); // black rook gives check along rank 0
    expect(g.inCheck()).toBe(true);
    for (const m of g.moves()) {
      g.move(m);
      expect(g.inCheck('r')).toBe(false);
      g.undo();
    }
  });
  it('detects checks by horse respecting the leg', () => {
    const check = new Xiangqi('3k5/9/9/9/9/9/9/5n3/9/4K4 w - - 0 1'); // horse f2 attacks e0 via leg f1
    expect(check.inCheck()).toBe(true);
    const blocked = new Xiangqi('3k5/9/9/9/9/9/9/5n3/5P3/4K4 w - - 0 1');
    expect(blocked.inCheck()).toBe(false);
  });
});

describe('game end', () => {
  it('checkmate: side to move with no legal move loses', () => {
    // Red rooks on d9-area trap the black king
    const m = new Xiangqi('3k5/9/R8/9/9/9/9/9/9/4K3R w - - 0 1');
    expect(m.move(mv('a7a9'))).toBe(true);
    // Black king d9: rank 9 attacked by a9 rook; d8 free? rook i0 does not cover d8 -> not mate yet
    expect(m.status().over).toBe(false);
    const mate = new Xiangqi('3k5/R8/9/9/9/9/9/9/9/3RK4 w - - 0 1');
    expect(mate.move(mv('a8a9'))).toBe(true);
    const st = mate.status();
    expect(st).toEqual({ over: true, winner: 'r', reason: 'checkmate' });
  });
  it('stalemate is a loss for the stalemated side', () => {
    // Black king d9 is not in check but every move is covered: d8 by the rook on rank 8,
    // e9 by the flying general (red king on the open e-file).
    const g = new Xiangqi('3k5/2R6/9/9/9/9/9/9/9/4K4 b - - 0 1');
    expect(g.inCheck()).toBe(false);
    expect(g.moves()).toHaveLength(0);
    expect(g.status()).toEqual({ over: true, winner: 'r', reason: 'stalemate' });
  });
  it('perpetual check loses', () => {
    // Red rook checks the black king back and forth; black can only shuffle.
    const g = new Xiangqi('4k4/9/9/9/9/9/9/9/9/R3K4 w - - 0 1');
    // Put black king on d9, red rook gives checks from a9 / a8 while king moves d9<->d8
    const p = new Xiangqi('3k5/9/9/9/9/9/9/9/9/R4K3 w - - 0 1');
    const seq = ['a0a9', 'd9d8', 'a9a8', 'd8d9', 'a8a9', 'd9d8', 'a9a8', 'd8d9', 'a8a9'];
    let result = p.status();
    for (const s of seq) {
      expect(p.move(mv(s))).toBe(true);
      result = p.status();
      if (result.over) break;
    }
    expect(result).toEqual({ over: true, winner: 'b', reason: 'perpetual_check' });
    void g;
  });
  it('repetition without perpetual check is a draw', () => {
    const g = new Xiangqi('3k5/9/9/9/9/9/9/9/9/R4K3 w - - 0 1');
    const seq = ['a0b0', 'd9e9', 'b0a0', 'e9d9', 'a0b0', 'd9e9', 'b0a0', 'e9d9'];
    let st = g.status();
    for (const s of seq) {
      expect(g.move(mv(s))).toBe(true);
      st = g.status();
      if (st.over) break;
    }
    expect(st).toEqual({ over: true, winner: null, reason: 'repetition' });
  });
  it('120 plies without capture is a draw', () => {
    const g = new Xiangqi('3k5/9/9/9/9/9/9/9/9/R4K3 w - - 119 60');
    expect(g.status().over).toBe(false);
    g.halfmove = 120;
    expect(g.status()).toEqual({ over: true, winner: null, reason: 'no_capture' });
  });
  it('mating material check', () => {
    const g = new Xiangqi('3ak4/9/9/9/9/9/9/9/9/3AKA3 w - - 0 1');
    expect(g.hasMatingMaterial('r')).toBe(false);
    expect(new Xiangqi().hasMatingMaterial('r')).toBe(true);
  });
});

describe('Vietnamese notation', () => {
  it.each([
    ['h2e2', 'P2-5'],
    ['b0c2', 'M8.7'],
    ['a0a1', 'X9.1'],
    ['g3g4', 'B3.1'],
    ['c0e2', 'T7.5'],
    ['f0e1', 'S4.5'],
  ])('red %s -> %s', (iccs, text) => {
    const g = new Xiangqi();
    expect(g.notation(mv(iccs))).toBe(text);
  });
  it('black counts files from its own right', () => {
    const g = new Xiangqi();
    g.move(mv('h2e2'));
    expect(g.notation(mv('h9g7'))).toBe('M8.7');
    expect(g.notation(mv('b7e7'))).toBe('P2-5');
  });
  it('backward moves use "/"', () => {
    const g = new Xiangqi('3k5/9/9/9/9/9/R8/9/9/4K4 w - - 0 1');
    expect(g.notation(mv('a3a0'))).toBe('X9/3');
  });
});

describe('undo and history', () => {
  it('undo restores board, turn and halfmove clock exactly', () => {
    const g = new Xiangqi();
    const moves = ['h2e2', 'h9g7', 'e2e6', 'c6c5', 'e6e9'];
    const fens: string[] = [g.fen()];
    for (const m of moves) {
      if (!g.move(mv(m))) break;
      fens.push(g.fen());
    }
    while (g.history.length) {
      g.undo();
      fens.pop();
      expect(g.fen()).toBe(fens[fens.length - 1]);
    }
    expect(g.fen()).toBe(XQ_START_FEN);
  });
  it('random playouts never corrupt state', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let game = 0; game < 30; game++) {
      const g = new Xiangqi();
      for (let ply = 0; ply < 150 && !g.status().over; ply++) {
        const ms = g.moves();
        const m = ms[Math.floor(rnd() * ms.length)];
        expect(g.move(m)).toBe(true);
        expect(g.inCheck(g.turn === 'r' ? 'b' : 'r')).toBe(false); // mover never left in check
        expect(g.kingSquare('r')).toBeGreaterThanOrEqual(0);
        expect(g.kingSquare('b')).toBeGreaterThanOrEqual(0);
        expect(moveToIccs(m)).toMatch(/^[a-i][0-9][a-i][0-9]$/);
      }
    }
  });
});
