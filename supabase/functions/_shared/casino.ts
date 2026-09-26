// Play-money casino games: Sic Bo, European roulette and a crash game ("Phi hành gia").
// Results come from a server seed committed (SHA-256 hash published) before betting opens and
// revealed afterwards, so players can verify every round.

// ---------- provably fair ----------
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function newServerSeed(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** Unbiased integers in [0, n) drawn from a hex digest stream. */
export function intsFromHex(hex: string, n: number, count: number): number[] {
  const out: number[] = [];
  const limit = Math.floor(0x100000000 / n) * n; // rejection sampling bound
  let pool = hex;
  let salt = 0;
  while (out.length < count) {
    if (pool.length < 8) {
      // extend deterministically (cheap non-crypto mix is fine: input already came from HMAC)
      pool += hex.split('').reverse().join('') + (salt++).toString(16);
    }
    const v = parseInt(pool.slice(0, 8), 16);
    pool = pool.slice(8);
    if (v < limit) out.push(v % n);
  }
  return out;
}

export type CasinoGame = 'sicbo' | 'roulette' | 'crash';
export const MIN_BET = 10;
export const MAX_BET = 1_000_000;
export const MAX_BETS_PER_ROUND = 40;

// ---------- Sic Bo ----------
export const SICBO_TOTAL_PAY: Record<number, number> = {
  4: 60, 17: 60, 5: 30, 16: 30, 6: 17, 15: 17, 7: 12, 14: 12, 8: 8, 13: 8, 9: 6, 12: 6, 10: 6, 11: 6,
};

export function isSicboBet(key: string): boolean {
  if (['small', 'big', 'odd', 'even', 'anytriple'].includes(key)) return true;
  let m = /^(triple|double|single):([1-6])$/.exec(key);
  if (m) return true;
  m = /^total:(\d{1,2})$/.exec(key);
  if (m) return Number(m[1]) >= 4 && Number(m[1]) <= 17;
  m = /^combo:([1-6])-([1-6])$/.exec(key);
  if (m) return Number(m[1]) < Number(m[2]);
  return false;
}

/** Total returned (stake included) for one bet; 0 when it loses. */
export function sicboPayout(key: string, stake: number, dice: number[]): number {
  const total = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  const count = (v: number) => dice.filter((d) => d === v).length;
  const win = (odds: number) => stake * (odds + 1);
  if (key === 'small') return !triple && total >= 4 && total <= 10 ? win(1) : 0;
  if (key === 'big') return !triple && total >= 11 && total <= 17 ? win(1) : 0;
  if (key === 'odd') return !triple && total % 2 === 1 ? win(1) : 0;
  if (key === 'even') return !triple && total % 2 === 0 ? win(1) : 0;
  if (key === 'anytriple') return triple ? win(30) : 0;
  let m = /^triple:([1-6])$/.exec(key);
  if (m) return triple && dice[0] === Number(m[1]) ? win(180) : 0;
  m = /^double:([1-6])$/.exec(key);
  if (m) return count(Number(m[1])) >= 2 ? win(10) : 0;
  m = /^single:([1-6])$/.exec(key);
  if (m) {
    const c = count(Number(m[1]));
    return c > 0 ? win(c) : 0;
  }
  m = /^total:(\d{1,2})$/.exec(key);
  if (m) return total === Number(m[1]) && SICBO_TOTAL_PAY[total] ? win(SICBO_TOTAL_PAY[total]) : 0;
  m = /^combo:([1-6])-([1-6])$/.exec(key);
  if (m) return count(Number(m[1])) > 0 && count(Number(m[2])) > 0 ? win(5) : 0;
  return 0;
}

export async function sicboResult(serverSeed: string, round: number): Promise<number[]> {
  const h = await hmacHex(serverSeed, `sicbo:${round}`);
  return intsFromHex(h, 6, 3).map((v) => v + 1);
}

// ---------- Roulette (European, single zero) ----------
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** Wheel order for the animation. */
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

/** Every legal roulette bet -> covered numbers. Table layout: column c (1..3), row r (0..11) => 3r + c. */
export const ROULETTE_BETS: Map<string, number[]> = (() => {
  const m = new Map<string, number[]>();
  for (let n = 0; n <= 36; n++) m.set(`n:${n}`, [n]);
  for (let n = 1; n <= 36; n++) {
    if (n % 3 !== 0) m.set(`split:${n}-${n + 1}`, [n, n + 1]);
    if (n <= 33) m.set(`split:${n}-${n + 3}`, [n, n + 3]);
  }
  for (const n of [1, 2, 3]) m.set(`split:0-${n}`, [0, n]);
  m.set('street:0-1-2', [0, 1, 2]);
  m.set('street:0-2-3', [0, 2, 3]);
  for (let r = 0; r < 12; r++) m.set(`street:${3 * r + 1}`, [3 * r + 1, 3 * r + 2, 3 * r + 3]);
  for (let n = 1; n <= 32; n++) if (n % 3 !== 0) m.set(`corner:${n}`, [n, n + 1, n + 3, n + 4]);
  m.set('corner:0', [0, 1, 2, 3]);
  for (let r = 0; r < 11; r++) m.set(`line:${3 * r + 1}`, [...Array(6).keys()].map((k) => 3 * r + 1 + k));
  const range = (a: number, b: number) => [...Array(b - a + 1).keys()].map((k) => a + k);
  for (let c = 1; c <= 3; c++) m.set(`col:${c}`, range(0, 11).map((r) => 3 * r + c));
  for (let d = 1; d <= 3; d++) m.set(`dozen:${d}`, range(12 * (d - 1) + 1, 12 * d));
  m.set('red', [...RED]);
  m.set('black', range(1, 36).filter((n) => !RED.has(n)));
  m.set('odd', range(1, 36).filter((n) => n % 2 === 1));
  m.set('even', range(1, 36).filter((n) => n % 2 === 0));
  m.set('low', range(1, 18));
  m.set('high', range(19, 36));
  return m;
})();

export function roulettePayout(key: string, stake: number, n: number): number {
  const nums = ROULETTE_BETS.get(key);
  if (!nums || !nums.includes(n)) return 0;
  const odds = Math.floor(36 / nums.length) - 1; // 35, 17, 11, 8, 5, 2, 1
  return stake * (odds + 1);
}

export async function rouletteResult(serverSeed: string, round: number): Promise<number> {
  const h = await hmacHex(serverSeed, `roulette:${round}`);
  return intsFromHex(h, 37, 1)[0];
}

// ---------- Crash ----------
export const CRASH_GROWTH = 0.00006; // multiplier(t) = e^(k t), t in ms: 2x after ~11.6 s
export const CRASH_MAX = 1000;

export function crashMultiplierAt(ms: number): number {
  if (ms <= 0) return 1;
  return Math.floor(Math.exp(CRASH_GROWTH * ms) * 100) / 100;
}
export function crashTimeFor(multiplier: number): number {
  return Math.log(multiplier) / CRASH_GROWTH;
}

/** 1% house edge: P(crash >= x) = 0.99 / x. */
export async function crashPoint(serverSeed: string, round: number): Promise<number> {
  const h = await hmacHex(serverSeed, `crash:${round}`);
  const r = parseInt(h.slice(0, 13), 16) / 2 ** 52; // uniform [0, 1)
  const x = Math.floor(99 / (1 - r)) / 100;
  return Math.min(CRASH_MAX, Math.max(1, x));
}

// ---------- shared bet validation ----------
export interface BetLine {
  key: string;
  amount: number;
}
export function validateBets(game: CasinoGame, raw: unknown): BetLine[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BETS_PER_ROUND) throw new Error('Cược không hợp lệ');
  const merged = new Map<string, number>();
  for (const b of raw) {
    const key = String((b as BetLine)?.key ?? '');
    const amount = (b as BetLine)?.amount;
    if (!Number.isInteger(amount) || amount < MIN_BET || amount > MAX_BET) throw new Error(`Mỗi cửa cược từ ${MIN_BET} đến ${MAX_BET.toLocaleString('vi-VN')}`);
    const ok = game === 'sicbo' ? isSicboBet(key) : game === 'roulette' ? ROULETTE_BETS.has(key) : key === 'crash';
    if (!ok) throw new Error('Cửa cược không tồn tại');
    merged.set(key, (merged.get(key) || 0) + amount);
  }
  const out = [...merged.entries()].map(([key, amount]) => ({ key, amount }));
  if (out.some((b) => b.amount > MAX_BET)) throw new Error('Vượt quá mức cược tối đa');
  return out;
}

// ---------- round state (one shared table per game) ----------
export const BETTING_MS: Record<CasinoGame, number> = { sicbo: 20_000, roulette: 20_000, crash: 7_000 };
export const RESULT_MS: Record<CasinoGame, number> = { sicbo: 7_000, roulette: 9_000, crash: 4_000 };

export interface CasinoPublic {
  kind: 'casino';
  game: CasinoGame;
  round: number;
  phase: 'betting' | 'running' | 'result';
  seedHash: string; // commitment for the current round
  bettingEndsAt: number;
  startAt: number | null; // crash: when the rocket launched
  resultAt: number | null;
  nextRoundAt: number | null;
  result: { dice?: number[]; number?: number; crash?: number } | null;
  revealed: { round: number; seed: string; hash: string } | null; // previous round's seed
  history: { round: number; dice?: number[]; number?: number; crash?: number }[];
  players: { id: string; name: string; amount: number; cashout?: number; payout?: number }[];
}
export interface CasinoPrivate {
  seed: string;
  crash?: number;
}

export async function newRound(game: CasinoGame, round: number, now: number, prev?: CasinoPublic): Promise<{ pub: CasinoPublic; priv: CasinoPrivate }> {
  const seed = newServerSeed();
  return {
    pub: {
      kind: 'casino', game, round, phase: 'betting', seedHash: await sha256Hex(seed),
      bettingEndsAt: now + BETTING_MS[game], startAt: null, resultAt: null, nextRoundAt: null, result: null,
      revealed: prev?.revealed ?? null, history: prev?.history ?? [], players: [],
    },
    priv: { seed },
  };
}
