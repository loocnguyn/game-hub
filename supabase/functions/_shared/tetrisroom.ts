// Tetris 1v1 room state machine (server-authoritative timing, client-reported board events).
//  - blitz:    fixed duration; topping out gives the opponent a KO and your board is wiped.
//              Most KOs wins; tie -> more attack sent; tie -> higher score; else draw.
//  - survival: topping out loses the round; first to N rounds wins the match.
import type { Seat } from './boardroom.ts';
import { RoomError } from './boardroom.ts';
import type { Side } from './rules.ts';

export const COUNTDOWN_MS = 4_000;
export const ROUND_BREAK_MS = 3_000;
export const FINAL_GRACE_MS = 5_000; // wait this long after time-up for final stats
export const MARGIN_START_MS = 60_000; // survival: garbage grows after 60 s in a round
export const MARGIN_STEP_MS = 30_000;

export interface TetrisSettings {
  mode: 'blitz' | 'survival';
  duration: number; // seconds (blitz)
  firstTo: number; // rounds (survival)
  rated: boolean;
}

export interface PlayerStats {
  attack: number;
  lines: number;
  score: number;
  pieces: number;
}

export interface TetrisRoomState {
  kind: 'tetris';
  game: 'tetris';
  settings: TetrisSettings;
  seats: [Seat | null, Seat | null];
  ready: [boolean, boolean];
  status: 'waiting' | 'playing' | 'finished';
  round: number;
  seed: number;
  startAt: number | null;
  endAt: number | null;
  deaths: [number, number]; // blitz: times each player topped out
  roundWins: [number, number]; // survival
  stats: [PlayerStats | null, PlayerStats | null];
  final: [boolean, boolean];
  result: { winner: Side | null; reason: string; at: number } | null;
  rematch: [boolean, boolean];
  nextCode: string | null;
  createdAt: number;
  ratingDelta: [number, number] | null;
}

export function validateTetrisSettings(raw: any): TetrisSettings {
  const mode = raw?.mode === 'survival' ? 'survival' : 'blitz';
  const duration = [60, 120, 180, 300].includes(raw?.duration) ? raw.duration : 120;
  const firstTo = [1, 2, 3, 5].includes(raw?.firstTo) ? raw.firstTo : 2;
  return { mode, duration, firstTo, rated: !!raw?.rated };
}

export function createTetrisState(settings: TetrisSettings, host: Seat, now: number): TetrisRoomState {
  return {
    kind: 'tetris',
    game: 'tetris',
    settings,
    seats: [host, null],
    ready: [false, false],
    status: 'waiting',
    round: 0,
    seed: 0,
    startAt: null,
    endAt: null,
    deaths: [0, 0],
    roundWins: [0, 0],
    stats: [null, null],
    final: [false, false],
    result: null,
    rematch: [false, false],
    nextCode: null,
    createdAt: now,
    ratingDelta: null,
  };
}

export function tetrisSeatOf(s: TetrisRoomState, userId: string): Side | null {
  if (s.seats[0]?.id === userId) return 0;
  if (s.seats[1]?.id === userId) return 1;
  return null;
}

export function joinTetris(s: TetrisRoomState, user: Seat): void {
  if (tetrisSeatOf(s, user.id) !== null) return;
  if (s.status !== 'waiting') throw new RoomError('Trận đã bắt đầu, bạn có thể vào xem');
  const free: Side | null = s.seats[0] === null ? 0 : s.seats[1] === null ? 1 : null;
  if (free === null) throw new RoomError('Phòng đã đủ người');
  s.seats[free] = user;
}

function beginRound(s: TetrisRoomState, now: number, seed: number, delay: number): void {
  s.round++;
  s.seed = seed;
  s.startAt = now + delay;
  s.endAt = s.settings.mode === 'blitz' ? s.startAt + s.settings.duration * 1000 : null;
}

export function setReady(s: TetrisRoomState, userId: string, ready: boolean, now: number, seed: number): void {
  const side = tetrisSeatOf(s, userId);
  if (side === null) throw new RoomError('Bạn không ở trong phòng');
  if (s.status !== 'waiting') throw new RoomError('Trận đã bắt đầu');
  s.ready[side] = ready;
  if (s.ready[0] && s.ready[1] && s.seats[0] && s.seats[1]) {
    s.status = 'playing';
    s.deaths = [0, 0];
    s.roundWins = [0, 0];
    s.stats = [null, null];
    s.final = [false, false];
    s.round = 0;
    beginRound(s, now, seed, COUNTDOWN_MS);
  }
}

function sanitizeStats(raw: any): PlayerStats | null {
  const n = (v: unknown, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), max) : 0;
  if (!raw || typeof raw !== 'object') return null;
  return { attack: n(raw.attack, 10_000), lines: n(raw.lines, 10_000), score: n(raw.score, 1e9), pieces: n(raw.pieces, 100_000) };
}

function finishTetris(s: TetrisRoomState, winner: Side | null, reason: string, now: number): void {
  s.status = 'finished';
  s.result = { winner, reason, at: now };
  s.ready = [false, false];
}

/** Garbage multiplier for survival rounds that drag on (TETR.IO "margin time"). */
export function marginMultiplier(s: Pick<TetrisRoomState, 'settings' | 'startAt'>, now: number): number {
  if (s.settings.mode !== 'survival' || s.startAt === null) return 1;
  const t = now - s.startAt - MARGIN_START_MS;
  if (t < 0) return 1;
  return 1 + 0.25 * (1 + Math.floor(t / MARGIN_STEP_MS));
}

/**
 * A player's report. `died` = they topped out in `round`. `final` = blitz time is up and these are
 * their final stats.
 */
export function report(
  s: TetrisRoomState,
  userId: string,
  body: { round: number; died?: boolean; final?: boolean; stats?: unknown },
  now: number,
  nextSeed: number,
): void {
  const side = tetrisSeatOf(s, userId);
  if (side === null) throw new RoomError('Bạn không ở trong phòng');
  advanceTetris(s, now);
  if (s.status !== 'playing') return;
  if (body.round !== s.round) return; // stale report from a previous round
  if (s.startAt !== null && now < s.startAt) return; // before the round started

  const stats = sanitizeStats(body.stats);
  if (stats) s.stats[side] = stats;

  if (s.settings.mode === 'blitz') {
    const live = s.endAt !== null && now <= s.endAt + 1_000;
    if (body.died && live) s.deaths[side]++;
    if (body.final) s.final[side] = true;
    if (s.final[0] && s.final[1]) finalizeBlitz(s, now);
    return;
  }

  if (body.died) {
    const winner: Side = side === 0 ? 1 : 0;
    s.roundWins[winner]++;
    if (s.roundWins[winner] >= s.settings.firstTo) finishTetris(s, winner, 'rounds', now);
    else beginRound(s, now, nextSeed, ROUND_BREAK_MS);
  }
}

function finalizeBlitz(s: TetrisRoomState, now: number): void {
  const kos: [number, number] = [s.deaths[1], s.deaths[0]];
  const atk = [s.stats[0]?.attack ?? 0, s.stats[1]?.attack ?? 0];
  const score = [s.stats[0]?.score ?? 0, s.stats[1]?.score ?? 0];
  if (kos[0] !== kos[1]) finishTetris(s, kos[0] > kos[1] ? 0 : 1, 'ko', now);
  else if (atk[0] !== atk[1]) finishTetris(s, atk[0] > atk[1] ? 0 : 1, 'attack', now);
  else if (score[0] !== score[1]) finishTetris(s, score[0] > score[1] ? 0 : 1, 'score', now);
  else finishTetris(s, null, 'draw', now);
}

export function advanceTetris(s: TetrisRoomState, now: number): boolean {
  if (s.status !== 'playing') return false;
  if (s.settings.mode === 'blitz' && s.endAt !== null && now >= s.endAt + FINAL_GRACE_MS) {
    finalizeBlitz(s, now);
    return true;
  }
  return false;
}

export function leaveTetris(s: TetrisRoomState, userId: string, now: number): boolean {
  const side = tetrisSeatOf(s, userId);
  if (side === null) return false;
  if (s.status === 'playing') {
    finishTetris(s, side === 0 ? 1 : 0, 'forfeit', now);
    return false;
  }
  if (s.status === 'waiting') {
    s.seats[side] = null;
    s.ready = [false, false];
    if (side === 0 && s.seats[1]) {
      s.seats = [s.seats[1], null];
    }
    return !s.seats[0] && !s.seats[1];
  }
  return false;
}

export function requestTetrisRematch(s: TetrisRoomState, userId: string): boolean {
  if (s.status !== 'finished') throw new RoomError('Trận chưa kết thúc');
  const side = tetrisSeatOf(s, userId);
  if (side === null) throw new RoomError('Bạn không ở trong phòng');
  if (!s.seats[0] || !s.seats[1]) throw new RoomError('Đối thủ đã rời phòng');
  s.rematch[side] = true;
  return s.rematch[0] && s.rematch[1] && !s.nextCode;
}

export function tetrisRematchState(prev: TetrisRoomState, now: number, seed: number): TetrisRoomState {
  const s = createTetrisState(prev.settings, prev.seats[0]!, now);
  s.seats = [prev.seats[0], prev.seats[1]];
  s.ready = [true, true];
  s.status = 'playing';
  beginRound(s, now, seed, COUNTDOWN_MS);
  return s;
}

export function tetrisScoreForFirst(r: TetrisRoomState['result']): 0 | 0.5 | 1 | null {
  if (!r) return null;
  if (r.winner === null) return 0.5;
  return r.winner === 0 ? 1 : 0;
}
