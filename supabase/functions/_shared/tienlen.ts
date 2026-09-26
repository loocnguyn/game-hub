// Tiến lên miền Nam. 2-4 players, 13 cards each.
// Card id 0..51: rank = floor(id / 4) (0 = 3 ... 11 = A, 12 = 2), suit = id % 4 (0 ♠ bích, 1 ♣ chuồn, 2 ♦ rô, 3 ♥ cơ).
// Card ids are therefore already ordered by strength.
import { mulberry32, shuffle } from './rng.ts';

export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
export const SUITS = ['♠', '♣', '♦', '♥'];
export const rankOf = (c: number) => Math.floor(c / 4);
export const suitOf = (c: number) => c % 4;
export const cardName = (c: number) => RANKS[rankOf(c)] + SUITS[suitOf(c)];
export const THREE_SPADES = 0;
const TWO = 12;

export const TURN_MS = 30_000;
export const BETWEEN_GAMES_MS = 6_000;

export type ComboType = 'single' | 'pair' | 'triple' | 'quad' | 'seq' | 'dseq';
export interface Combo {
  type: ComboType;
  cards: number[]; // sorted ascending
  len: number; // number of ranks (seq/dseq) or card count
  top: number; // highest card
}

/** Classify a set of cards, or null if it is not a legal combination. */
export function classify(input: number[]): Combo | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const cards = [...input].sort((a, b) => a - b);
  if (new Set(cards).size !== cards.length || cards.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) return null;
  const n = cards.length;
  const ranks = cards.map(rankOf);
  const top = cards[n - 1];
  const sameRank = ranks.every((r) => r === ranks[0]);
  if (n === 1) return { type: 'single', cards, len: 1, top };
  if (sameRank && n === 2) return { type: 'pair', cards, len: 2, top };
  if (sameRank && n === 3) return { type: 'triple', cards, len: 3, top };
  if (sameRank && n === 4) return { type: 'quad', cards, len: 4, top };
  if (ranks.includes(TWO)) return null; // 2s never go in sequences
  // straight: distinct consecutive ranks, at least 3
  if (n >= 3 && ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)) return { type: 'seq', cards, len: n, top };
  // double straight: >= 3 consecutive pairs
  if (n >= 6 && n % 2 === 0) {
    let ok = true;
    for (let i = 0; i < n; i += 2) {
      if (ranks[i] !== ranks[i + 1]) ok = false;
      if (i > 0 && ranks[i] !== ranks[i - 2] + 1) ok = false;
    }
    if (ok) return { type: 'dseq', cards, len: n / 2, top };
  }
  return null;
}

/** Can `next` be played on top of `prev`? Includes "chặt" rules. */
export function beats(prev: Combo, next: Combo): boolean {
  const isTwo = (c: Combo) => rankOf(c.top) === TWO;
  if (prev.type === next.type && prev.len === next.len) return next.top > prev.top;
  // Chặt heo: a single 2 can be cut by 3 đôi thông, 4 đôi thông, tứ quý.
  if (prev.type === 'single' && isTwo(prev)) {
    return next.type === 'quad' || (next.type === 'dseq' && next.len >= 3);
  }
  // Đôi heo: cut by tứ quý or 4 đôi thông.
  if (prev.type === 'pair' && isTwo(prev)) {
    return next.type === 'quad' || (next.type === 'dseq' && next.len >= 4);
  }
  // 3 đôi thông is cut by tứ quý or 4 đôi thông.
  if (prev.type === 'dseq' && prev.len === 3) {
    return next.type === 'quad' || (next.type === 'dseq' && next.len >= 4);
  }
  // Tứ quý is cut by 4 đôi thông.
  if (prev.type === 'quad') return next.type === 'dseq' && next.len >= 4;
  return false;
}

/** Instant win at the deal ("tới trắng"). */
export function instantWin(hand: number[]): string | null {
  const ranks = hand.map(rankOf);
  const count = new Map<number, number>();
  for (const r of ranks) count.set(r, (count.get(r) || 0) + 1);
  if ((count.get(TWO) || 0) === 4) return 'Tứ quý heo';
  const distinct = new Set(ranks.filter((r) => r !== TWO));
  if (distinct.size === 12) return 'Sảnh rồng';
  const pairs = [...count.values()].reduce((s, c) => s + Math.floor(c / 2), 0);
  if (pairs >= 6) return '6 đôi';
  // 5 đôi thông
  const pairRanks = [...count.entries()].filter(([r, c]) => c >= 2 && r !== TWO).map(([r]) => r).sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < pairRanks.length; i++) {
    run = pairRanks[i] === pairRanks[i - 1] + 1 ? run + 1 : 1;
    if (run >= 5) return '5 đôi thông';
  }
  return null;
}

export interface TLSeat {
  id: string;
  name: string;
}
export interface TLPlay {
  seat: number;
  cards: number[];
  type: ComboType;
  cut?: boolean; // chặt
}
export interface TLPrivate {
  hands: number[][];
}
export interface TLPublic {
  kind: 'tienlen';
  game: 'tienlen';
  seats: (TLSeat | null)[]; // 4 seats
  ready: boolean[];
  status: 'waiting' | 'playing' | 'finished';
  gameNo: number;
  counts: number[]; // cards left per seat
  inGame: boolean[]; // dealt into the current game
  turn: number;
  deadline: number | null;
  table: TLPlay | null; // combination to beat
  passed: boolean[];
  finished: number[]; // seats in finishing order
  firstGame: boolean;
  leader: number; // seat that leads the next game
  instant: { seat: number; reason: string } | null;
  lastPlays: TLPlay[];
  scores: number[]; // running totals per seat
  deltas: number[] | null; // points from the last game
  nextStartAt: number | null;
  createdAt: number;
}

export class TLError extends Error {}

export function createTienLen(host: TLSeat, now: number): { pub: TLPublic; priv: TLPrivate } {
  return {
    pub: {
      kind: 'tienlen', game: 'tienlen',
      seats: [host, null, null, null], ready: [false, false, false, false],
      status: 'waiting', gameNo: 0, counts: [0, 0, 0, 0], inGame: [false, false, false, false],
      turn: 0, deadline: null, table: null, passed: [false, false, false, false], finished: [],
      firstGame: true, leader: -1, instant: null, lastPlays: [], scores: [0, 0, 0, 0], deltas: null,
      nextStartAt: null, createdAt: now,
    },
    priv: { hands: [[], [], [], []] },
  };
}

export function tlSeatOf(pub: TLPublic, userId: string): number {
  return pub.seats.findIndex((s) => s?.id === userId);
}

export function tlJoin(pub: TLPublic, user: TLSeat): number {
  const cur = tlSeatOf(pub, user.id);
  if (cur >= 0) return cur;
  const free = pub.seats.findIndex((s) => s === null);
  if (free < 0) throw new TLError('Bàn đã đủ 4 người');
  pub.seats[free] = user;
  pub.ready[free] = false;
  return free;
}

/** Points by finishing place for N players. */
export function placePoints(n: number): number[] {
  if (n === 4) return [3, 1, -1, -3];
  if (n === 3) return [2, 0, -2];
  return [1, -1];
}

const active = (pub: TLPublic) => pub.inGame.map((v, i) => v && !pub.finished.includes(i));

function nextSeat(pub: TLPublic, from: number, pred: (i: number) => boolean): number {
  for (let k = 1; k <= 4; k++) {
    const i = (from + k) % 4;
    if (pred(i)) return i;
  }
  return -1;
}

export function tlStart(pub: TLPublic, priv: TLPrivate, now: number, seed: number): void {
  const players = pub.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  if (players.length < 2) throw new TLError('Cần ít nhất 2 người');
  const deck = shuffle(mulberry32(seed), [...Array(52).keys()]);
  pub.inGame = pub.seats.map((s) => s !== null);
  priv.hands = [[], [], [], []];
  let k = 0;
  for (const i of players) priv.hands[i] = deck.slice(k, (k += 13)).sort((a, b) => a - b);
  pub.counts = priv.hands.map((h) => h.length);
  pub.gameNo++;
  pub.status = 'playing';
  pub.table = null;
  pub.passed = [false, false, false, false];
  pub.finished = [];
  pub.lastPlays = [];
  pub.deltas = null;
  pub.instant = null;
  pub.nextStartAt = null;

  // Tới trắng
  for (const i of players) {
    const reason = instantWin(priv.hands[i]);
    if (reason) {
      pub.instant = { seat: i, reason };
      const deltas = [0, 0, 0, 0];
      for (const j of players) if (j !== i) { deltas[j] = -2; deltas[i] += 2; }
      endGame(pub, now, deltas, i);
      return;
    }
  }

  // First game: holder of 3♠ leads (and must play it). Later: previous winner leads.
  if (pub.firstGame || pub.leader < 0 || !pub.inGame[pub.leader]) {
    const holder = players.find((i) => priv.hands[i].includes(THREE_SPADES));
    // With fewer than 4 players 3♠ may be undealt: lowest card leads.
    pub.turn = holder ?? players.reduce((best, i) => (priv.hands[i][0] < priv.hands[best][0] ? i : best), players[0]);
  } else {
    pub.turn = pub.leader;
  }
  pub.deadline = now + TURN_MS;
}

function endGame(pub: TLPublic, now: number, deltas: number[], winner: number): void {
  pub.status = 'finished';
  pub.deltas = deltas;
  for (let i = 0; i < 4; i++) pub.scores[i] += deltas[i];
  pub.leader = winner;
  pub.firstGame = false;
  pub.deadline = null;
  pub.table = null;
  pub.ready = [false, false, false, false];
  pub.nextStartAt = now + BETWEEN_GAMES_MS;
}

function mustIncludeThreeSpades(pub: TLPublic, priv: TLPrivate, seat: number): boolean {
  return pub.firstGame && pub.lastPlays.length === 0 && priv.hands[seat].includes(THREE_SPADES);
}

export function tlPlay(pub: TLPublic, priv: TLPrivate, seat: number, cards: number[], now: number): void {
  if (pub.status !== 'playing') throw new TLError('Ván chưa bắt đầu');
  if (seat !== pub.turn) throw new TLError('Chưa tới lượt bạn');
  const combo = classify(cards);
  if (!combo) throw new TLError('Bộ bài không hợp lệ');
  const hand = priv.hands[seat];
  if (!combo.cards.every((c) => hand.includes(c))) throw new TLError('Bạn không có những lá này');
  if (mustIncludeThreeSpades(pub, priv, seat) && !combo.cards.includes(THREE_SPADES))
    throw new TLError('Ván đầu phải đánh 3 bích');
  let cut = false;
  if (pub.table) {
    const prev = classify(pub.table.cards)!;
    if (!beats(prev, combo)) throw new TLError('Bài không chặn được');
    cut = prev.type !== combo.type || prev.len !== combo.len;
  }
  priv.hands[seat] = hand.filter((c) => !combo.cards.includes(c));
  pub.counts[seat] = priv.hands[seat].length;
  const play: TLPlay = { seat, cards: combo.cards, type: combo.type, cut: cut || undefined };
  pub.table = play;
  pub.lastPlays = [...pub.lastPlays.slice(-11), play];

  if (priv.hands[seat].length === 0) {
    pub.finished.push(seat);
    const left = active(pub).filter(Boolean).length;
    if (left <= 1) {
      const last = active(pub).findIndex(Boolean);
      if (last >= 0) pub.finished.push(last);
      finishByPlaces(pub, now);
      return;
    }
  }
  advanceTurn(pub, seat, now);
}

export function tlPass(pub: TLPublic, seat: number, now: number): void {
  if (pub.status !== 'playing') throw new TLError('Ván chưa bắt đầu');
  if (seat !== pub.turn) throw new TLError('Chưa tới lượt bạn');
  if (!pub.table) throw new TLError('Bạn đang được đi trước, không thể bỏ lượt');
  pub.passed[seat] = true;
  advanceTurn(pub, seat, now);
}

/** Move the turn on; if everyone else passed, the last player to play (or the next one if they finished) leads. */
function advanceTurn(pub: TLPublic, from: number, now: number): void {
  const act = active(pub);
  const lastBy = pub.table?.seat ?? -1;
  const next = nextSeat(pub, from, (i) => act[i] && !pub.passed[i] && i !== lastBy);
  if (next >= 0) {
    pub.turn = next;
  } else {
    // round over: everyone else passed
    pub.table = null;
    pub.passed = [false, false, false, false];
    pub.turn = act[lastBy] ? lastBy : nextSeat(pub, lastBy, (i) => act[i]);
  }
  pub.deadline = now + TURN_MS;
}

function finishByPlaces(pub: TLPublic, now: number): void {
  const n = pub.finished.length;
  const pts = placePoints(n);
  const deltas = [0, 0, 0, 0];
  pub.finished.forEach((seat, place) => { deltas[seat] = pts[place]; });
  endGame(pub, now, deltas, pub.finished[0]);
}

/** Auto action for the player whose timer ran out. Returns true if something changed. */
export function tlAdvance(pub: TLPublic, priv: TLPrivate, now: number): boolean {
  if (pub.status !== 'playing' || pub.deadline === null || now < pub.deadline) return false;
  const seat = pub.turn;
  if (pub.table) {
    tlPass(pub, seat, now);
  } else {
    const hand = priv.hands[seat];
    const card = mustIncludeThreeSpades(pub, priv, seat) ? THREE_SPADES : hand[0];
    tlPlay(pub, priv, seat, [card], now);
  }
  return true;
}

export function tlSetReady(pub: TLPublic, seat: number, ready: boolean): boolean {
  if (pub.status === 'playing') throw new TLError('Ván đang diễn ra');
  pub.ready[seat] = ready;
  const seated = pub.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  return seated.length >= 2 && seated.every((i) => pub.ready[i]);
}

/** Leaving mid-game: remaining cards are dropped and the player finishes last. */
export function tlLeave(pub: TLPublic, priv: TLPrivate, seat: number, now: number): boolean {
  if (pub.status === 'playing' && pub.inGame[seat] && !pub.finished.includes(seat)) {
    pub.inGame[seat] = false;
    priv.hands[seat] = [];
    pub.counts[seat] = 0;
    const penalty = -(placePoints(pub.inGame.filter(Boolean).length + 1)[0]) - 1;
    pub.scores[seat] += penalty;
    const act = active(pub);
    if (act.filter(Boolean).length <= 1) {
      const last = act.findIndex(Boolean);
      if (last >= 0) pub.finished.push(last);
      finishByPlaces(pub, now);
    } else if (pub.turn === seat) {
      // A play they left on the table stays; the round ends normally when the others pass.
      pub.passed[seat] = true;
      advanceTurn(pub, seat, now);
    }
  }
  pub.seats[seat] = null;
  pub.ready[seat] = false;
  pub.scores[seat] = 0;
  return pub.seats.every((s) => s === null);
}

export function tlView(pub: TLPublic, priv: TLPrivate, seat: number) {
  return { ...pub, hand: seat >= 0 ? priv.hands[seat] : [] };
}
