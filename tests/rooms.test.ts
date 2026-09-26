import { describe, expect, it } from 'vitest';
import {
  advanceBoard, createBoardState, declineDraw, FIRST_MOVE_MS, joinBoard, leaveBoard, offerDraw, playMove,
  ratingCategory, rematchState, requestRematch, resign, RoomError, scoreForFirst, timeLeft, validateBoardSettings,
  type BoardState, type Seat,
} from '@shared/boardroom.ts';
import {
  advanceTetris, COUNTDOWN_MS, createTetrisState, FINAL_GRACE_MS, joinTetris, leaveTetris, marginMultiplier,
  report, requestTetrisRematch, ROUND_BREAK_MS, setReady, tetrisRematchState, validateTetrisSettings,
  type TetrisRoomState,
} from '@shared/tetrisroom.ts';
import { DEFAULT_RATING, glicko2 } from '@shared/glicko.ts';
import type { BoardGame } from '@shared/rules.ts';

const A: Seat = { id: 'a', name: 'An' };
const B: Seat = { id: 'b', name: 'Bình' };
const C: Seat = { id: 'c', name: 'Chi' };
const T0 = 1_000_000;

function started(game: BoardGame = 'chess', base = 60_000, inc = 0, extra: object = {}): BoardState {
  const s = createBoardState(game, validateBoardSettings(game, { base, inc, color: 'first', ...extra }), A, T0);
  joinBoard(s, B, T0);
  return s;
}
/** Play moves alternately, starting at `t`, each taking `think` ms. Returns the final time. */
function play(s: BoardState, moves: string[], t = T0, think = 1000): number {
  for (const m of moves) {
    t += think;
    const who = s.turn === 0 ? s.seats[0]!.id : s.seats[1]!.id;
    playMove(s, who, m, t);
  }
  return t;
}

describe('settings validation', () => {
  it('clamps and rejects bad clocks', () => {
    expect(() => validateBoardSettings('chess', { base: 1000 })).toThrow(RoomError);
    expect(() => validateBoardSettings('chess', { base: 'x' })).toThrow(RoomError);
    const s = validateBoardSettings('chess', { base: 10 ** 12, inc: 10 ** 9, color: 'weird' });
    expect(s.base).toBe(90 * 60_000);
    expect(s.inc).toBe(60_000);
    expect(s.color).toBe('random');
  });
  it('caro settings default to 15x15 without the two-ends rule', () => {
    expect(validateBoardSettings('caro', { base: 60_000 }).caro).toEqual({ size: 15, blockTwoEnds: false });
    expect(validateBoardSettings('caro', { base: 60_000, caro: { size: 20, blockTwoEnds: true } }).caro).toEqual({ size: 20, blockTwoEnds: true });
    expect(validateBoardSettings('caro', { base: 60_000, caro: { size: 99 } }).caro!.size).toBe(15);
  });
  it('rating categories follow base + 40 x increment', () => {
    const cat = (base: number, inc: number) => ratingCategory('chess', { base: base * 1000, inc: inc * 1000, rated: true, color: 'random' });
    expect(cat(60, 0)).toBe('chess_bullet');
    expect(cat(120, 1)).toBe('chess_bullet');
    expect(cat(180, 0)).toBe('chess_blitz');
    expect(cat(300, 3)).toBe('chess_blitz');
    expect(cat(600, 0)).toBe('chess_rapid');
    expect(cat(1800, 0)).toBe('chess_classical');
    expect(ratingCategory('xiangqi', { base: 1, inc: 0, rated: true, color: 'random' })).toBe('xiangqi');
  });
});

describe('seats and start', () => {
  it('host gets the requested seat; random is decided by the rng', () => {
    const first = createBoardState('chess', validateBoardSettings('chess', { base: 60_000, color: 'first' }), A, T0);
    expect(first.seats[0]).toEqual(A);
    const second = createBoardState('chess', validateBoardSettings('chess', { base: 60_000, color: 'second' }), A, T0);
    expect(second.seats[1]).toEqual(A);
    const rnd = createBoardState('chess', validateBoardSettings('chess', { base: 60_000 }), A, T0, () => 0.9);
    expect(rnd.seats[1]).toEqual(A);
  });
  it('game starts when the second player joins', () => {
    const s = createBoardState('chess', validateBoardSettings('chess', { base: 60_000, color: 'first' }), A, T0);
    expect(s.status).toBe('waiting');
    joinBoard(s, B, T0 + 5);
    expect(s.status).toBe('playing');
    expect(s.seats[1]).toEqual(B);
    expect(s.firstMoveDeadline).toBe(T0 + 5 + FIRST_MOVE_MS);
  });
  it('rejects a third player and joining twice is a no-op', () => {
    const s = started();
    expect(() => joinBoard(s, C, T0)).toThrow(RoomError);
    joinBoard(s, A, T0);
    expect(s.seats[0]).toEqual(A);
  });
  it('leaving a waiting room frees the seat and reports empty rooms', () => {
    const s = createBoardState('chess', validateBoardSettings('chess', { base: 60_000, color: 'first' }), A, T0);
    expect(leaveBoard(s, A.id, T0)).toBe(true);
    expect(s.seats).toEqual([null, null]);
    expect(leaveBoard(s, 'nobody', T0)).toBe(false);
  });
});

describe('moves and turn order', () => {
  it('only the side to move may move', () => {
    const s = started();
    expect(() => playMove(s, B.id, 'e7e5', T0 + 1)).toThrow('Chưa tới lượt bạn');
    expect(() => playMove(s, C.id, 'e2e4', T0 + 1)).toThrow('không phải người chơi');
    playMove(s, A.id, 'e2e4', T0 + 1);
    expect(s.turn).toBe(1);
    expect(s.sans).toEqual(['e4']);
  });
  it('illegal moves are rejected and change nothing', () => {
    const s = started();
    const before = JSON.stringify(s);
    expect(() => playMove(s, A.id, 'e2e5', T0 + 1)).toThrow('không hợp lệ');
    expect(() => playMove(s, A.id, 'garbage', T0 + 1)).toThrow('không hợp lệ');
    expect(JSON.stringify(s)).toBe(before);
  });
  it('promotion must name the piece', () => {
    const s = started();
    const t = play(s, ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6a7', 'b7c6']);
    expect(() => playMove(s, A.id, 'a7b8', t + 1_000)).toThrow('không hợp lệ');
    playMove(s, A.id, 'a7b8n', t + 1_000);
    expect(s.sans[s.sans.length - 1]).toBe('axb8=N');
  });
  it("fool's mate ends the game by checkmate", () => {
    const s = started();
    play(s, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(s.status).toBe('finished');
    expect(s.result).toMatchObject({ winner: 1, reason: 'checkmate' });
    expect(() => playMove(s, A.id, 'a2a3', T0 + 99_000)).toThrow('kết thúc');
  });
  it('xiangqi and caro go through the same flow', () => {
    const x = started('xiangqi');
    play(x, ['h2e2', 'h9g7']);
    expect(x.sans).toEqual(['P2-5', 'M8.7']);
    const c = started('caro');
    // X: 0,1,2,3,4 ; O: 15,16,17,18
    play(c, ['0', '15', '1', '16', '2', '17', '3', '18', '4']);
    expect(c.result).toMatchObject({ winner: 0, reason: 'five' });
  });
});

describe('clocks', () => {
  it('does not run before both sides have moved (lichess style)', () => {
    const s = started('chess', 60_000);
    playMove(s, A.id, 'e2e4', T0 + 20_000);
    expect(s.clock.rem).toEqual([60_000, 60_000]);
    playMove(s, B.id, 'e7e5', T0 + 45_000);
    expect(s.clock.rem).toEqual([60_000, 60_000]);
    expect(s.clock.turnStart).toBe(T0 + 45_000);
    playMove(s, A.id, 'g1f3', T0 + 50_000);
    expect(s.clock.rem[0]).toBe(55_000);
  });
  it('adds the increment after each timed move', () => {
    const s = started('chess', 60_000, 2_000);
    const t = play(s, ['e2e4', 'e7e5'], T0, 1000);
    playMove(s, A.id, 'g1f3', t + 3_000);
    expect(s.clock.rem[0]).toBe(60_000 - 3_000 + 2_000);
  });
  it('timeLeft counts down only for the side to move', () => {
    const s = started('chess', 60_000);
    const t = play(s, ['e2e4', 'e7e5']);
    expect(timeLeft(s, 0, t + 10_000)).toBe(50_000);
    expect(timeLeft(s, 1, t + 10_000)).toBe(60_000);
  });
  it('aborts when the first mover never moves', () => {
    const s = started();
    expect(advanceBoard(s, T0 + FIRST_MOVE_MS - 1)).toBe(false);
    expect(advanceBoard(s, T0 + FIRST_MOVE_MS)).toBe(true);
    expect(s.result).toMatchObject({ winner: null, reason: 'aborted' });
    expect(scoreForFirst(s.result)).toBeNull();
  });
  it('aborts when the second player never answers the first move', () => {
    const s = started();
    playMove(s, A.id, 'e2e4', T0 + 1_000);
    advanceBoard(s, T0 + 1_000 + FIRST_MOVE_MS);
    expect(s.result?.reason).toBe('aborted');
  });
  it('flagging loses on time', () => {
    const s = started('chess', 30_000);
    const t = play(s, ['e2e4', 'e7e5']);
    expect(advanceBoard(s, t + 29_999)).toBe(false);
    expect(advanceBoard(s, t + 30_000)).toBe(true);
    expect(s.result).toMatchObject({ winner: 1, reason: 'timeout' });
    expect(s.clock.rem[0]).toBe(0);
  });
  it('a move after the flag fell is refused and the game ends', () => {
    const s = started('chess', 30_000);
    const t = play(s, ['e2e4', 'e7e5']);
    expect(() => playMove(s, A.id, 'g1f3', t + 31_000)).toThrow('kết thúc');
    expect(s.result?.reason).toBe('timeout');
  });
  it('timeout against a lone king (or king + one minor) is a draw', () => {
    for (const [fen, reason] of [
      ['4k3/8/8/8/8/8/8/4K2R w - - 0 1', 'timeout_draw'], // black has only a king
      ['4kn2/8/8/8/8/8/8/4K2R w - - 0 1', 'timeout_draw'], // king + knight cannot mate
      ['4kq2/8/8/8/8/8/8/4K2R w - - 0 1', 'timeout'], // a queen can
    ] as const) {
      const s = started('chess', 30_000);
      const t = play(s, ['e2e4', 'e7e5']);
      s.fen = fen; // white (side 0) to move and about to flag
      advanceBoard(s, t + 30_000);
      expect(s.result?.reason).toBe(reason);
      expect(s.result?.winner).toBe(reason === 'timeout' ? 1 : null);
    }
  });
  it('xiangqi: flagging against a side without attackers is a draw', () => {
    const s = started('xiangqi', 30_000);
    const t = play(s, ['h2e2', 'h9g7']);
    s.fen = '3akab2/9/9/9/9/9/9/9/9/3RK4 w - - 0 1';
    advanceBoard(s, t + 30_000);
    expect(s.result).toMatchObject({ winner: null, reason: 'timeout_draw' });
  });
  it('resigning before the second move aborts instead of losing', () => {
    const s = started();
    resign(s, A.id, T0 + 10);
    expect(s.result?.reason).toBe('aborted');
    const r = started();
    play(r, ['e2e4', 'e7e5']);
    resign(r, B.id, T0 + 5_000);
    expect(r.result).toMatchObject({ winner: 0, reason: 'resign' });
  });
});

describe('draw offers', () => {
  it('offer + counter-offer = draw; a move cancels the offer', () => {
    const s = started();
    expect(() => offerDraw(s, A.id, T0 + 1)).toThrow();
    const t = play(s, ['e2e4', 'e7e5']);
    offerDraw(s, A.id, t + 1);
    expect(s.drawOffer).toBe(0);
    playMove(s, A.id, 'g1f3', t + 2);
    expect(s.drawOffer).toBeNull();
    offerDraw(s, B.id, t + 3);
    offerDraw(s, A.id, t + 4);
    expect(s.result).toMatchObject({ winner: null, reason: 'agreement' });
    expect(scoreForFirst(s.result)).toBe(0.5);
  });
  it('decline clears only the opponent offer', () => {
    const s = started();
    const t = play(s, ['e2e4', 'e7e5']);
    offerDraw(s, A.id, t + 1);
    declineDraw(s, A.id);
    expect(s.drawOffer).toBe(0);
    declineDraw(s, B.id);
    expect(s.drawOffer).toBeNull();
  });
});

describe('leaving and rematch', () => {
  it('leaving mid-game resigns', () => {
    const s = started();
    play(s, ['e2e4', 'e7e5']);
    leaveBoard(s, A.id, T0 + 10_000);
    expect(s.result).toMatchObject({ winner: 1, reason: 'resign' });
  });
  it('rematch needs both players and swaps colours', () => {
    const s = started();
    expect(() => requestRematch(s, A.id)).toThrow();
    play(s, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(requestRematch(s, A.id)).toBe(false);
    expect(() => requestRematch(s, C.id)).toThrow();
    expect(requestRematch(s, B.id)).toBe(true);
    const next = rematchState(s, T0 + 60_000);
    expect(next.seats).toEqual([B, A]);
    expect(next.status).toBe('playing');
    expect(next.moves).toEqual([]);
    expect(next.clock.rem).toEqual([60_000, 60_000]);
  });
});

// ---------------- Tetris rooms ----------------
function tetrisRoom(mode: 'blitz' | 'survival' = 'blitz', extra: object = {}): TetrisRoomState {
  const s = createTetrisState(validateTetrisSettings({ mode, duration: 120, firstTo: 2, ...extra }), A, T0);
  joinTetris(s, B);
  setReady(s, A.id, true, T0, 111);
  setReady(s, B.id, true, T0, 111);
  return s;
}

describe('tetris rooms', () => {
  it('validates settings', () => {
    expect(validateTetrisSettings({})).toEqual({ mode: 'blitz', duration: 120, firstTo: 2, rated: false });
    expect(validateTetrisSettings({ mode: 'survival', duration: 7, firstTo: 99 })).toMatchObject({ mode: 'survival', duration: 120, firstTo: 2 });
  });
  it('starts with a countdown once both players are ready', () => {
    const s = createTetrisState(validateTetrisSettings({}), A, T0);
    expect(() => setReady(s, C.id, true, T0, 1)).toThrow();
    joinTetris(s, B);
    expect(() => joinTetris(s, C)).toThrow();
    setReady(s, A.id, true, T0, 5);
    expect(s.status).toBe('waiting');
    setReady(s, B.id, true, T0 + 10, 5);
    expect(s.status).toBe('playing');
    expect(s.round).toBe(1);
    expect(s.seed).toBe(5);
    expect(s.startAt).toBe(T0 + 10 + COUNTDOWN_MS);
    expect(s.endAt).toBe(s.startAt! + 120_000);
  });
  it('blitz: KOs decide the winner', () => {
    const s = tetrisRoom();
    const t = s.startAt! + 1000;
    report(s, A.id, { round: 1, died: true }, t, 0);
    report(s, A.id, { round: 1, died: true }, t + 1, 0);
    report(s, B.id, { round: 1, died: true }, t + 2, 0);
    expect(s.deaths).toEqual([2, 1]);
    report(s, A.id, { round: 1, final: true, stats: { attack: 50 } }, s.endAt! + 100, 0);
    expect(s.status).toBe('playing');
    report(s, B.id, { round: 1, final: true, stats: { attack: 1 } }, s.endAt! + 200, 0);
    expect(s.result).toMatchObject({ winner: 1, reason: 'ko' });
  });
  it('blitz: equal KOs -> attack -> score -> draw', () => {
    const byAttack = tetrisRoom();
    report(byAttack, A.id, { round: 1, final: true, stats: { attack: 10, score: 1 } }, byAttack.endAt!, 0);
    report(byAttack, B.id, { round: 1, final: true, stats: { attack: 12, score: 0 } }, byAttack.endAt!, 0);
    expect(byAttack.result).toMatchObject({ winner: 1, reason: 'attack' });
    const byScore = tetrisRoom();
    report(byScore, A.id, { round: 1, final: true, stats: { attack: 5, score: 900 } }, byScore.endAt!, 0);
    report(byScore, B.id, { round: 1, final: true, stats: { attack: 5, score: 800 } }, byScore.endAt!, 0);
    expect(byScore.result).toMatchObject({ winner: 0, reason: 'score' });
    const draw = tetrisRoom();
    report(draw, A.id, { round: 1, final: true, stats: { attack: 5, score: 9 } }, draw.endAt!, 0);
    report(draw, B.id, { round: 1, final: true, stats: { attack: 5, score: 9 } }, draw.endAt!, 0);
    expect(draw.result).toMatchObject({ winner: null, reason: 'draw' });
  });
  it('blitz: finalises after the grace period even without reports', () => {
    const s = tetrisRoom();
    report(s, B.id, { round: 1, died: true }, s.startAt! + 5, 0);
    expect(advanceTetris(s, s.endAt! + FINAL_GRACE_MS - 1)).toBe(false);
    expect(advanceTetris(s, s.endAt! + FINAL_GRACE_MS)).toBe(true);
    expect(s.result).toMatchObject({ winner: 0, reason: 'ko' });
  });
  it('ignores deaths reported before the start or long after time is up', () => {
    const s = tetrisRoom();
    report(s, A.id, { round: 1, died: true }, s.startAt! - 1, 0);
    expect(s.deaths).toEqual([0, 0]);
    report(s, A.id, { round: 1, died: true }, s.endAt! + 2_000, 0);
    expect(s.deaths).toEqual([0, 0]);
  });
  it('sanitises reported stats', () => {
    const s = tetrisRoom();
    report(s, A.id, { round: 1, stats: { attack: -5, lines: 'x', score: 1e20, pieces: 3.7 } }, s.startAt! + 10, 0);
    expect(s.stats[0]).toEqual({ attack: 0, lines: 0, score: 1e9, pieces: 3 });
  });
  it('survival: rounds until first to N, stale rounds ignored', () => {
    const s = tetrisRoom('survival');
    expect(s.endAt).toBeNull();
    report(s, A.id, { round: 1, died: true }, s.startAt! + 10_000, 222);
    expect(s.roundWins).toEqual([0, 1]);
    expect(s.round).toBe(2);
    expect(s.seed).toBe(222);
    const t = s.startAt!;
    expect(t).toBe(s.startAt!);
    report(s, B.id, { round: 1, died: true }, t + 5_000, 0); // stale
    expect(s.roundWins).toEqual([0, 1]);
    report(s, A.id, { round: 2, died: true }, t + 5_000, 333);
    expect(s.result).toMatchObject({ winner: 1, reason: 'rounds' });
    void ROUND_BREAK_MS;
  });
  it('margin time increases survival garbage after 60 s', () => {
    const s = tetrisRoom('survival');
    expect(marginMultiplier(s, s.startAt! + 59_000)).toBe(1);
    expect(marginMultiplier(s, s.startAt! + 60_000)).toBe(1.25);
    expect(marginMultiplier(s, s.startAt! + 90_000)).toBe(1.5);
    expect(marginMultiplier(tetrisRoom('blitz'), T0 + 999_999)).toBe(1);
  });
  it('leaving during a match forfeits; leaving a lobby frees the seat', () => {
    const s = tetrisRoom();
    leaveTetris(s, B.id, s.startAt! + 1);
    expect(s.result).toMatchObject({ winner: 0, reason: 'forfeit' });
    const lobby = createTetrisState(validateTetrisSettings({}), A, T0);
    joinTetris(lobby, B);
    expect(leaveTetris(lobby, A.id, T0)).toBe(false);
    expect(lobby.seats).toEqual([B, null]); // guest becomes host
    expect(leaveTetris(lobby, B.id, T0)).toBe(true);
  });
  it('rematch restarts immediately with the same players', () => {
    const s = tetrisRoom();
    leaveTetris(s, B.id, s.startAt! + 1);
    s.seats[1] = B; // player came back to the result screen
    expect(requestTetrisRematch(s, A.id)).toBe(false);
    expect(requestTetrisRematch(s, B.id)).toBe(true);
    const next = tetrisRematchState(s, T0 + 999, 42);
    expect(next.status).toBe('playing');
    expect(next.round).toBe(1);
    expect(next.seed).toBe(42);
  });
});

describe('glicko-2', () => {
  it('winner gains, loser loses, symmetric for equal players', () => {
    const w = glicko2(DEFAULT_RATING, DEFAULT_RATING, 1);
    const l = glicko2(DEFAULT_RATING, DEFAULT_RATING, 0);
    expect(w.r).toBeGreaterThan(1500);
    expect(l.r).toBeLessThan(1500);
    expect(Math.round(w.r - 1500)).toBe(Math.round(1500 - l.r));
  });
  it('a draw between equals keeps the rating and shrinks RD', () => {
    const d = glicko2(DEFAULT_RATING, DEFAULT_RATING, 0.5);
    expect(Math.abs(d.r - 1500)).toBeLessThan(0.01);
    expect(d.rd).toBeLessThan(350);
  });
  it('beating a much stronger player gains more than beating a weaker one', () => {
    const me = { r: 1500, rd: 80, vol: 0.06 };
    const up = glicko2(me, { r: 1900, rd: 80, vol: 0.06 }, 1).r - 1500;
    const down = glicko2(me, { r: 1100, rd: 80, vol: 0.06 }, 1).r - 1500;
    expect(up).toBeGreaterThan(down);
    expect(down).toBeGreaterThan(0);
  });
  it('matches the Glickman paper example direction and stays within RD bounds', () => {
    const p = { r: 1500, rd: 200, vol: 0.06 };
    const r = glicko2(p, { r: 1400, rd: 30, vol: 0.06 }, 1);
    expect(r.r).toBeGreaterThan(1500);
    expect(r.r).toBeLessThan(1700);
    for (let i = 0; i < 200; i++) {
      const x = glicko2({ r: 1500, rd: 45, vol: 0.06 }, DEFAULT_RATING, (i % 3) / 2 as 0 | 0.5 | 1);
      expect(x.rd).toBeGreaterThanOrEqual(45);
      expect(x.rd).toBeLessThanOrEqual(350);
      expect(Number.isFinite(x.r)).toBe(true);
    }
  });
});
