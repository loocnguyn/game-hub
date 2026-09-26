// Server-authoritative state machine for two-player board games (chess, xiangqi, caro) with
// chess.com / lichess style clocks. Pure functions over a JSON state and an explicit `now`,
// so the edge function and the tests share exactly the same logic.
import { RULES, type BoardGame, type CaroSettings, type DotsSettings, type GameOutcome, type Side } from './rules.ts';

export const FIRST_MOVE_MS = 30_000; // each side must make its first move within 30 s or the game is aborted
export const MAX_BASE_MS = 90 * 60_000;
export const MAX_INC_MS = 60_000;

export interface Seat {
  id: string;
  name: string;
  rating?: number;
}

export interface BoardSettings {
  base: number; // ms
  inc: number; // ms
  rated: boolean;
  color: 'random' | 'first' | 'second'; // host's preferred seat
  caro?: CaroSettings;
  dots?: DotsSettings;
}

export interface Clock {
  rem: [number, number];
  turnStart: number | null; // server ms when the side to move started thinking; null = not running
}

export interface BoardResult extends GameOutcome {
  at: number;
}

export interface BoardState {
  kind: 'board';
  game: BoardGame;
  settings: BoardSettings;
  seats: [Seat | null, Seat | null];
  status: 'waiting' | 'playing' | 'finished';
  moves: string[];
  sans: string[];
  fen: string;
  turn: Side;
  check: boolean;
  clock: Clock;
  firstMoveDeadline: number | null;
  drawOffer: Side | null;
  result: BoardResult | null;
  rematch: [boolean, boolean];
  nextCode: string | null;
  createdAt: number;
  startedAt: number | null;
  ratingDelta: [number, number] | null;
}

export class RoomError extends Error {}

const clampInt = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : NaN;

export function validateBoardSettings(game: BoardGame, raw: any): BoardSettings {
  const base = clampInt(raw?.base, 0, MAX_BASE_MS);
  const inc = clampInt(raw?.inc ?? 0, 0, MAX_INC_MS);
  if (!(base >= 15_000)) throw new RoomError('Thời gian mỗi bên phải từ 15 giây trở lên');
  if (!(inc >= 0)) throw new RoomError('Thời gian cộng thêm không hợp lệ');
  const color = ['random', 'first', 'second'].includes(raw?.color) ? raw.color : 'random';
  const s: BoardSettings = { base, inc, rated: !!raw?.rated, color };
  if (game === 'caro') {
    const size = [15, 20].includes(raw?.caro?.size) ? raw.caro.size : 15;
    s.caro = { size, blockTwoEnds: !!raw?.caro?.blockTwoEnds };
  }
  if (game === 'dots') {
    s.dots = { size: [3, 4, 5, 6].includes(raw?.dots?.size) ? raw.dots.size : 4 };
  }
  return s;
}

/** Rating pool for a finished game, e.g. "chess_blitz". */
export function ratingCategory(game: BoardGame, s: BoardSettings): string {
  if (game !== 'chess') return game;
  const est = s.base / 1000 + (40 * s.inc) / 1000; // lichess estimate
  if (est < 180) return 'chess_bullet';
  if (est < 480) return 'chess_blitz';
  if (est < 1500) return 'chess_rapid';
  return 'chess_classical';
}

export function createBoardState(
  game: BoardGame,
  settings: BoardSettings,
  host: Seat,
  now: number,
  rand: () => number = Math.random,
): BoardState {
  const seats: [Seat | null, Seat | null] = [null, null];
  const hostSeat: Side = settings.color === 'first' ? 0 : settings.color === 'second' ? 1 : rand() < 0.5 ? 0 : 1;
  seats[hostSeat] = host;
  return {
    kind: 'board',
    game,
    settings,
    seats,
    status: 'waiting',
    moves: [],
    sans: [],
    fen: RULES[game].initialFen(settings),
    turn: 0,
    check: false,
    clock: { rem: [settings.base, settings.base], turnStart: null },
    firstMoveDeadline: null,
    drawOffer: null,
    result: null,
    rematch: [false, false],
    nextCode: null,
    createdAt: now,
    startedAt: null,
    ratingDelta: null,
  };
}

export function seatOf(s: BoardState, userId: string): Side | null {
  if (s.seats[0]?.id === userId) return 0;
  if (s.seats[1]?.id === userId) return 1;
  return null;
}

function other(side: Side): Side {
  return side === 0 ? 1 : 0;
}

/** Remaining time for `side` at `now` (clock may be running). */
export function timeLeft(s: BoardState, side: Side, now: number): number {
  let t = s.clock.rem[side];
  if (s.status === 'playing' && s.clock.turnStart !== null && s.turn === side) t -= now - s.clock.turnStart;
  return t;
}

function finish(s: BoardState, outcome: GameOutcome, now: number): void {
  s.status = 'finished';
  s.result = { ...outcome, at: now };
  s.drawOffer = null;
  if (s.clock.turnStart !== null) {
    s.clock.rem[s.turn] = Math.max(0, s.clock.rem[s.turn] - (now - s.clock.turnStart));
    s.clock.turnStart = null;
  }
  s.firstMoveDeadline = null;
}

/** Guest takes the free seat; the game starts as soon as both seats are filled. */
export function joinBoard(s: BoardState, user: Seat, now: number): void {
  if (seatOf(s, user.id) !== null) return;
  if (s.status !== 'waiting') throw new RoomError('Ván đã bắt đầu, bạn có thể vào xem');
  const free: Side | null = s.seats[0] === null ? 0 : s.seats[1] === null ? 1 : null;
  if (free === null) throw new RoomError('Phòng đã đủ người');
  s.seats[free] = user;
  if (s.seats[0] && s.seats[1]) {
    s.status = 'playing';
    s.startedAt = now;
    s.firstMoveDeadline = now + FIRST_MOVE_MS;
  }
}

/** Leaving before the game starts frees the seat. Returns true when the room is now empty. */
export function leaveBoard(s: BoardState, userId: string, now: number): boolean {
  const side = seatOf(s, userId);
  if (side === null) return false;
  if (s.status === 'waiting') {
    s.seats[side] = null;
    return !s.seats[0] && !s.seats[1];
  }
  if (s.status === 'playing') {
    advanceBoard(s, now);
    if (s.status === 'playing') {
      if (s.moves.length < 2) finish(s, { winner: null, reason: 'aborted' }, now);
      else finish(s, { winner: other(side), reason: 'resign' }, now);
    }
  }
  return false;
}

/**
 * Resolve everything that became due by `now`: flag falls and first-move aborts.
 * Returns true if the state changed.
 */
export function advanceBoard(s: BoardState, now: number): boolean {
  if (s.status !== 'playing') return false;
  if (s.firstMoveDeadline !== null && now >= s.firstMoveDeadline && s.moves.length < 2) {
    finish(s, { winner: null, reason: 'aborted' }, now);
    return true;
  }
  if (s.clock.turnStart !== null && timeLeft(s, s.turn, now) <= 0) {
    const winner = other(s.turn);
    const canWin = RULES[s.game].canWin(s.fen, winner);
    finish(s, canWin ? { winner, reason: 'timeout' } : { winner: null, reason: 'timeout_draw' }, now);
    s.clock.rem[s.turn] = 0;
    return true;
  }
  return false;
}

export function playMove(s: BoardState, userId: string, move: string, now: number): void {
  advanceBoard(s, now);
  if (s.status !== 'playing') throw new RoomError(s.status === 'finished' ? 'Ván đấu đã kết thúc' : 'Ván chưa bắt đầu');
  const side = seatOf(s, userId);
  if (side === null) throw new RoomError('Bạn không phải người chơi trong ván này');
  if (side !== s.turn) throw new RoomError('Chưa tới lượt bạn');

  const res = RULES[s.game].play(s.moves, move, s.settings);
  if (!res) throw new RoomError('Nước đi không hợp lệ');

  // Clock: runs only once both sides have made their first move (lichess convention).
  if (s.clock.turnStart !== null) {
    const used = now - s.clock.turnStart;
    s.clock.rem[side] = s.clock.rem[side] - used + s.settings.inc;
  }
  s.moves.push(move);
  s.sans.push(res.san);
  s.fen = res.fen;
  s.check = res.check;
  s.turn = res.nextTurn ?? other(side);
  s.drawOffer = null;

  if (s.moves.length === 1) {
    s.firstMoveDeadline = now + FIRST_MOVE_MS;
  } else {
    s.firstMoveDeadline = null;
    s.clock.turnStart = now;
  }
  if (res.over) finish(s, res.over, now);
}

export function resign(s: BoardState, userId: string, now: number): void {
  advanceBoard(s, now);
  if (s.status !== 'playing') throw new RoomError('Ván đấu không diễn ra');
  const side = seatOf(s, userId);
  if (side === null) throw new RoomError('Bạn không phải người chơi trong ván này');
  if (s.moves.length < 2) finish(s, { winner: null, reason: 'aborted' }, now);
  else finish(s, { winner: other(side), reason: 'resign' }, now);
}

export function offerDraw(s: BoardState, userId: string, now: number): void {
  advanceBoard(s, now);
  if (s.status !== 'playing') throw new RoomError('Ván đấu không diễn ra');
  const side = seatOf(s, userId);
  if (side === null) throw new RoomError('Bạn không phải người chơi trong ván này');
  if (s.moves.length < 2) throw new RoomError('Chưa thể cầu hòa ở nước đầu');
  if (s.drawOffer === other(side)) {
    finish(s, { winner: null, reason: 'agreement' }, now);
    return;
  }
  s.drawOffer = side;
}

export function declineDraw(s: BoardState, userId: string): void {
  const side = seatOf(s, userId);
  if (side === null || s.drawOffer === null || s.drawOffer === side) return;
  s.drawOffer = null;
}

/** Marks a rematch request; returns true when both players want one. */
export function requestRematch(s: BoardState, userId: string): boolean {
  if (s.status !== 'finished') throw new RoomError('Ván đấu chưa kết thúc');
  const side = seatOf(s, userId);
  if (side === null) throw new RoomError('Bạn không phải người chơi trong ván này');
  if (!s.seats[0] || !s.seats[1]) throw new RoomError('Đối thủ đã rời phòng');
  s.rematch[side] = true;
  return s.rematch[0] && s.rematch[1] && !s.nextCode;
}

/** New game with colours swapped; starts immediately. */
export function rematchState(prev: BoardState, now: number): BoardState {
  const s = createBoardState(prev.game, prev.settings, prev.seats[1]!, now);
  s.seats = [prev.seats[1], prev.seats[0]];
  s.status = 'playing';
  s.startedAt = now;
  s.firstMoveDeadline = now + FIRST_MOVE_MS;
  return s;
}

/** Glicko score for side 0 from a result (null = unrated outcome like an abort). */
export function scoreForFirst(r: GameOutcome | null): 0 | 0.5 | 1 | null {
  if (!r || r.reason === 'aborted') return null;
  if (r.winner === null) return 0.5;
  return r.winner === 0 ? 1 : 0;
}
