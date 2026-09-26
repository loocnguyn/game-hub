// Game Hub — single Supabase Edge Function for every server-side action.
// Client calls POST { op, ...params } with Authorization: Bearer <access_token>.
// Rooms are committed with optimistic locking (version column) and retried on conflict.
import { createClient } from '@supabase/supabase-js';
import * as BR from '../_shared/boardroom.ts';
import * as TR from '../_shared/tetrisroom.ts';
import * as TL from '../_shared/tienlen.ts';
import * as MO from '../_shared/monopoly.ts';
import * as CA from '../_shared/casino.ts';
import { glicko2, DEFAULT_RATING, type Rating } from '../_shared/glicko.ts';
import { randomSeed } from '../_shared/rng.ts';
import { decodeInputs, replayGame, DEFAULT_HANDLING, FPS, type Handling } from '../_shared/tetris.ts';
import { replayMinesweeper, DIFFICULTIES, type Difficulty, type MsAction } from '../_shared/minesweeper.ts';
import { replay2048 } from '../_shared/g2048.ts';
import { generateSudoku, isSolved, SUDOKU_LEVELS, type SudokuDifficulty } from '../_shared/sudoku.ts';
import type { BoardGame } from '../_shared/rules.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class UserError extends Error {}
const USER_ERRORS = [UserError, BR.RoomError, TL.TLError, MO.MonoError];
const isUserError = (e: unknown) => USER_ERRORS.some((C) => e instanceof C);

type Profile = { id: string; username: string; name: string; avatar: string };
type Seat = { id: string; name: string };

// ---------------------------------------------------------------- profiles
async function ensureProfile(user: any): Promise<Profile> {
  const { data } = await admin.from('hub_profiles').select('id, username, name, avatar').eq('id', user.id).maybeSingle();
  if (data) return data as Profile;
  const meta = user.user_metadata || {};
  const email = String(user.email || '');
  const username = String(meta.username || email.split('@')[0] || `user${user.id.slice(0, 6)}`).slice(0, 20);
  const name = String(meta.full_name || meta.name || username).slice(0, 30);
  const { data: created, error } = await admin
    .from('hub_profiles')
    .upsert({ id: user.id, username, name, avatar: '' }, { onConflict: 'id' })
    .select('id, username, name, avatar')
    .single();
  if (error) throw error;
  return created as Profile;
}

// ---------------------------------------------------------------- rooms
const ROOM_GAMES = ['chess', 'xiangqi', 'caro', 'dots', 'tetris', 'tienlen', 'monopoly'] as const;
type RoomGame = (typeof ROOM_GAMES)[number];
const BOARD_GAMES: BoardGame[] = ['chess', 'xiangqi', 'caro', 'dots'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}
function normCode(code: unknown): string {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_]{4,24}$/.test(c)) throw new UserError('Mã phòng không hợp lệ');
  return c;
}
function statusOf(state: any): string {
  return state.kind === 'casino' ? 'live' : state.status;
}
function cryptoDice(): [number, number] {
  const r = () => {
    const b = new Uint8Array(1);
    for (;;) {
      crypto.getRandomValues(b);
      if (b[0] < 252) return (b[0] % 6) + 1;
    }
  };
  return [r(), r()];
}

interface RoomRow {
  id: string;
  code: string;
  game: string;
  status: string;
  host_id: string | null;
  state: any;
  version: number;
}

async function insertRoom(code: string, game: string, hostId: string | null, state: any, priv: any | null): Promise<RoomRow> {
  const { data, error } = await admin
    .from('hub_rooms')
    .insert({ code, game, host_id: hostId, state, status: statusOf(state) })
    .select('*')
    .single();
  if (error) throw error;
  if (priv) {
    const { error: pErr } = await admin.from('hub_room_private').insert({ room_id: data.id, state: priv });
    if (pErr) throw pErr;
  }
  return data as RoomRow;
}

async function createRoomWithFreshCode(game: string, hostId: string, state: any, priv: any | null): Promise<RoomRow> {
  for (let i = 0; i < 6; i++) {
    try {
      return await insertRoom(newCode(), game, hostId, state, priv);
    } catch (e: any) {
      if (!String(e?.message || '').includes('duplicate')) throw e;
    }
  }
  throw new Error('could not allocate room code');
}

interface Ctx {
  row: RoomRow;
  state: any;
  priv: any | null;
  now: number;
  after: (() => Promise<void>)[];
}

const needsPrivate = (state: any) => ['tienlen', 'monopoly', 'casino'].includes(state.kind);

/** Load -> mutate -> commit with optimistic locking. `fn` returns true if the state changed. */
async function withRoom<T>(code: string, fn: (ctx: Ctx) => Promise<boolean> | boolean, view: (ctx: Ctx) => T): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: row, error } = await admin.from('hub_rooms').select('*').eq('code', code).maybeSingle();
    if (error) throw error;
    if (!row) throw new UserError('Phòng không tồn tại');
    let priv: any = null;
    if (needsPrivate(row.state)) {
      const { data: p } = await admin.from('hub_room_private').select('state').eq('room_id', row.id).maybeSingle();
      priv = p?.state ?? {};
    }
    const ctx: Ctx = { row: row as RoomRow, state: structuredClone(row.state), priv: priv ? structuredClone(priv) : null, now: Date.now(), after: [] };
    const before = ctx.state.status;
    advanceAny(ctx);
    const changedByFn = await fn(ctx);
    advanceAny(ctx);
    const changed = changedByFn || JSON.stringify(ctx.state) !== JSON.stringify(row.state) ||
      (priv !== null && JSON.stringify(ctx.priv) !== JSON.stringify(priv));
    if (changed) {
      if (before !== 'finished' && ctx.state.status === 'finished') await onFinished(ctx);
      const { data: v, error: cErr } = await admin.rpc('hub_room_commit', {
        p_id: row.id,
        p_expected: row.version,
        p_state: ctx.state,
        p_status: statusOf(ctx.state),
        p_private: ctx.priv,
      });
      if (cErr) {
        if (cErr.message.includes('VERSION_CONFLICT')) {
          await new Promise((r) => setTimeout(r, 15 + Math.random() * 60));
          continue;
        }
        throw cErr;
      }
      ctx.row = { ...ctx.row, version: v as number, state: ctx.state };
      for (const job of ctx.after) {
        try {
          await job();
        } catch (e) {
          console.error('after-commit job failed', e);
        }
      }
    }
    return view(ctx);
  }
  throw new UserError('Phòng đang bận, thử lại');
}

/** Resolve everything that is due (timeouts, flags, auto-starts). Loops for chained timeouts. */
function advanceAny(ctx: Ctx) {
  const s = ctx.state;
  const now = ctx.now;
  switch (s.kind) {
    case 'board':
      BR.advanceBoard(s, now);
      break;
    case 'tetris':
      TR.advanceTetris(s, now);
      break;
    case 'tienlen':
      for (let i = 0; i < 40 && TL.tlAdvance(s, ctx.priv, now); i++);
      if (s.status === 'finished' && s.nextStartAt && now >= s.nextStartAt && s.seats.filter(Boolean).length >= 2) {
        TL.tlStart(s, ctx.priv, now, randomSeed());
      }
      break;
    case 'monopoly':
      for (let i = 0; i < 40 && MO.monoAdvance(s, ctx.priv, now, cryptoDice); i++);
      break;
  }
}

// ---------------------------------------------------------------- ratings & history
function ratingInfo(s: any): { category: string; rated: boolean; score0: 0 | 0.5 | 1 | null } | null {
  if (s.kind === 'board') {
    return { category: BR.ratingCategory(s.game, s.settings), rated: !!s.settings.rated, score0: BR.scoreForFirst(s.result) };
  }
  if (s.kind === 'tetris') {
    return { category: 'tetris_vs', rated: !!s.settings.rated, score0: TR.tetrisScoreForFirst(s.result) };
  }
  return null;
}

async function onFinished(ctx: Ctx) {
  const s = ctx.state;
  if (s.kind === 'monopoly') {
    const players = s.players.map((p: MO.MPlayer, i: number) => ({ id: p.id, name: p.name, worth: MO.netWorth(s, i) }));
    const winner = s.winner;
    ctx.after.push(async () => {
      await admin.from('hub_matches').insert({ game: 'monopoly', room_code: ctx.row.code, players, result: { winner }, rated: false });
    });
    return;
  }
  const info = ratingInfo(s);
  if (!info || info.score0 === null || !s.seats?.[0] || !s.seats?.[1]) return; // aborted / incomplete
  const ids = [s.seats[0].id, s.seats[1].id];
  const players = s.seats.map((x: Seat) => ({ id: x.id, name: x.name }));
  let newRatings: Rating[] | null = null;
  if (info.rated) {
    const { data } = await admin.from('hub_ratings').select('*').eq('category', info.category).in('user_id', ids);
    const cur = ids.map((id) => {
      const r = data?.find((x: any) => x.user_id === id);
      return r ? { r: r.rating, rd: r.rd, vol: r.vol } : { ...DEFAULT_RATING };
    });
    const s0 = info.score0;
    const s1 = (1 - s0) as 0 | 0.5 | 1;
    newRatings = [glicko2(cur[0], cur[1], s0), glicko2(cur[1], cur[0], s1)];
    s.ratingDelta = [Math.round(newRatings[0].r - cur[0].r), Math.round(newRatings[1].r - cur[1].r)];
    const old = data || [];
    ctx.after.push(async () => {
      const rows = ids.map((id, i) => {
        const prev = old.find((x: any) => x.user_id === id);
        const score = i === 0 ? s0 : s1;
        return {
          user_id: id, category: info.category, rating: newRatings![i].r, rd: newRatings![i].rd, vol: newRatings![i].vol,
          games: (prev?.games ?? 0) + 1, wins: (prev?.wins ?? 0) + (score === 1 ? 1 : 0),
          losses: (prev?.losses ?? 0) + (score === 0 ? 1 : 0), draws: (prev?.draws ?? 0) + (score === 0.5 ? 1 : 0),
          updated_at: new Date().toISOString(),
        };
      });
      await admin.from('hub_ratings').upsert(rows, { onConflict: 'user_id,category' });
    });
  }
  const result = { ...s.result, ratingDelta: s.ratingDelta ?? null, moves: s.kind === 'board' ? s.moves.length : undefined };
  ctx.after.push(async () => {
    await admin.from('hub_matches').insert({
      game: s.game, category: info.category, room_code: ctx.row.code, players, result, rated: info.rated,
    });
  });
}

// ---------------------------------------------------------------- room views
function roomView(ctx: Ctx, me: Profile) {
  const s = ctx.state;
  let state = s;
  if (s.kind === 'tienlen') state = TL.tlView(s, ctx.priv, TL.tlSeatOf(s, me.id));
  return { code: ctx.row.code, game: ctx.row.game, version: ctx.row.version, state, serverNow: Date.now() };
}

// ---------------------------------------------------------------- room ops
async function createRoom(me: Profile, b: any) {
  const game = String(b.game) as RoomGame;
  if (!ROOM_GAMES.includes(game)) throw new UserError('Trò chơi không hợp lệ');
  const now = Date.now();
  const seat: Seat = { id: me.id, name: me.name };
  // Housekeeping: drop stale rooms (waiting > 2h, finished > 24h).
  await admin.from('hub_rooms').delete().eq('status', 'waiting').lt('updated_at', new Date(now - 2 * 3600_000).toISOString());
  await admin.from('hub_rooms').delete().eq('status', 'finished').lt('updated_at', new Date(now - 24 * 3600_000).toISOString());

  let state: any, priv: any = null;
  if ((BOARD_GAMES as string[]).includes(game)) {
    state = BR.createBoardState(game as BoardGame, BR.validateBoardSettings(game as BoardGame, b.settings || {}), seat, now);
  } else if (game === 'tetris') {
    state = TR.createTetrisState(TR.validateTetrisSettings(b.settings || {}), seat, now);
  } else if (game === 'tienlen') {
    const t = TL.createTienLen(seat, now);
    state = t.pub;
    priv = t.priv;
  } else {
    state = MO.createMonopoly(MO.validateMonopolySettings(b.settings || {}), seat, now);
    priv = { chance: [], chest: [] };
  }
  const row = await createRoomWithFreshCode(game, me.id, state, priv);
  return { code: row.code };
}

async function joinRoom(me: Profile, code: string) {
  const seat: Seat = { id: me.id, name: me.name };
  return withRoom(code, (ctx) => {
    const s = ctx.state;
    switch (s.kind) {
      case 'board': BR.joinBoard(s, seat, ctx.now); break;
      case 'tetris': TR.joinTetris(s, seat); break;
      case 'tienlen': TL.tlJoin(s, seat); break;
      case 'monopoly': MO.monoJoin(s, seat); break;
      default: throw new UserError('Không thể vào phòng này');
    }
    return true;
  }, (ctx) => roomView(ctx, me));
}

async function leaveRoom(me: Profile, code: string) {
  let empty = false;
  const res = await withRoom(code, (ctx) => {
    const s = ctx.state;
    switch (s.kind) {
      case 'board': empty = BR.leaveBoard(s, me.id, ctx.now); break;
      case 'tetris': empty = TR.leaveTetris(s, me.id, ctx.now); break;
      case 'tienlen': {
        const seat = TL.tlSeatOf(s, me.id);
        if (seat >= 0) empty = TL.tlLeave(s, ctx.priv, seat, ctx.now);
        break;
      }
      case 'monopoly': empty = MO.monoLeave(s, me.id, ctx.now); break;
    }
    return true;
  }, (ctx) => ({ ok: true, id: ctx.row.id }));
  if (empty) await admin.from('hub_rooms').delete().eq('id', res.id);
  return { ok: true };
}

async function actRoom(me: Profile, code: string, b: any) {
  const action = String(b.action || '');
  return withRoom(code, async (ctx) => {
    const s = ctx.state;
    const now = ctx.now;
    if (action === 'tick') return false;

    if (s.kind === 'board') {
      switch (action) {
        case 'move': BR.playMove(s, me.id, String(b.move || ''), now); return true;
        case 'resign': BR.resign(s, me.id, now); return true;
        case 'draw': BR.offerDraw(s, me.id, now); return true;
        case 'decline': BR.declineDraw(s, me.id); return true;
        case 'rematch': {
          if (BR.requestRematch(s, me.id)) {
            const next = BR.rematchState(s, now);
            const nextCode = newCode();
            s.nextCode = nextCode;
            ctx.after.push(async () => { await insertRoom(nextCode, s.game, next.seats[0]!.id, next, null); });
          }
          return true;
        }
      }
    } else if (s.kind === 'tetris') {
      switch (action) {
        case 'ready': TR.setReady(s, me.id, b.ready !== false, now, randomSeed()); return true;
        case 'report':
          TR.report(s, me.id, { round: Number(b.round), died: !!b.died, final: !!b.final, stats: b.stats }, now, randomSeed());
          return true;
        case 'rematch': {
          if (TR.requestTetrisRematch(s, me.id)) {
            const next = TR.tetrisRematchState(s, now, randomSeed());
            const nextCode = newCode();
            s.nextCode = nextCode;
            ctx.after.push(async () => { await insertRoom(nextCode, 'tetris', next.seats[0]!.id, next, null); });
          }
          return true;
        }
      }
    } else if (s.kind === 'tienlen') {
      const seat = TL.tlSeatOf(s, me.id);
      if (seat < 0) throw new UserError('Bạn không ngồi ở bàn này');
      switch (action) {
        case 'ready':
          if (TL.tlSetReady(s, seat, b.ready !== false) && s.status !== 'playing') TL.tlStart(s, ctx.priv, now, randomSeed());
          return true;
        case 'play': TL.tlPlay(s, ctx.priv, seat, Array.isArray(b.cards) ? b.cards.map(Number) : [], now); return true;
        case 'pass': TL.tlPass(s, seat, now); return true;
      }
    } else if (s.kind === 'monopoly') {
      const p = MO.monoSeatOf(s, me.id);
      if (action === 'start') { MO.monoStart(s, ctx.priv, me.id, now, randomSeed()); return true; }
      if (p < 0) throw new UserError('Bạn không ở trong ván này');
      if (s.players[p]) s.players[p].afk = false;
      const sq = Number(b.square);
      switch (action) {
        case 'roll': MO.monoRoll(s, ctx.priv, p, cryptoDice, now); break;
        case 'buy': MO.monoBuy(s, p, b.buy !== false); break;
        case 'end': MO.monoEndTurn(s, p, now); break;
        case 'build': MO.monoBuild(s, p, sq); break;
        case 'sell': MO.monoSellHouse(s, p, sq); break;
        case 'mortgage': MO.monoMortgage(s, p, sq); break;
        case 'unmortgage': MO.monoUnmortgage(s, p, sq); break;
        case 'payjail': MO.monoPayJail(s, p, !!b.useCard); break;
        case 'paydebt': MO.monoPayDebt(s, p); break;
        case 'bankrupt': MO.monoBankrupt(s, p, now); break;
        case 'trade': MO.monoProposeTrade(s, p, b.trade); break;
        case 'respond': MO.monoRespondTrade(s, p, !!b.accept); break;
        default: throw new UserError('Hành động không hợp lệ');
      }
      if (s.status === 'playing' && s.turn === p && action !== 'respond') s.deadline = now + MO.TURN_MS;
      return true;
    }
    throw new UserError('Hành động không hợp lệ');
  }, (ctx) => roomView(ctx, me));
}

// ---------------------------------------------------------------- casino
const CASINO_GAMES: CA.CasinoGame[] = ['sicbo', 'roulette', 'crash'];
const casinoCode = (g: CA.CasinoGame) => `CASINO_${g.toUpperCase()}`;

async function ensureCasinoRoom(game: CA.CasinoGame) {
  const code = casinoCode(game);
  const { data } = await admin.from('hub_rooms').select('id').eq('code', code).maybeSingle();
  if (data) return code;
  const { pub, priv } = await CA.newRound(game, 1, Date.now());
  try {
    await insertRoom(code, game, null, pub, priv);
  } catch (e: any) {
    if (!String(e?.message || '').includes('duplicate')) throw e;
  }
  return code;
}

/** Advance a casino table. Settlement jobs run after the commit that performed the transition. */
async function advanceCasino(ctx: Ctx): Promise<boolean> {
  const s = ctx.state as CA.CasinoPublic;
  const now = ctx.now;
  let changed = false;
  for (let guard = 0; guard < 4; guard++) {
    const priv = ctx.priv as CA.CasinoPrivate; // replaced when a new round starts
    if (s.phase === 'betting' && now >= s.bettingEndsAt) {
      if (s.game === 'crash') {
        priv.crash = await CA.crashPoint(priv.seed, s.round);
        s.phase = 'running';
        s.startAt = now;
        scheduleCrashTick(CA.crashTimeFor(priv.crash));
      } else {
        await resolveRound(ctx);
      }
      changed = true;
      continue;
    }
    if (s.phase === 'running' && priv.crash !== undefined && s.startAt !== null && now >= s.startAt + CA.crashTimeFor(priv.crash)) {
      await resolveRound(ctx);
      changed = true;
      continue;
    }
    if (s.phase === 'result' && s.nextRoundAt !== null && now >= s.nextRoundAt) {
      const revealed = { round: s.round, seed: priv.seed, hash: s.seedHash };
      const { pub, priv: p2 } = await CA.newRound(s.game, s.round + 1, now, { ...s, revealed });
      Object.assign(s, pub);
      ctx.priv = p2;
      const game = s.game, round = s.round;
      // Bets that slipped in after their round was settled are refunded.
      ctx.after.push(async () => {
        const { error } = await admin.rpc('hub_casino_refund_stale', { p_game: game, p_round: round });
        if (error) throw error;
      });
      changed = true;
      continue;
    }
    break;
  }
  return changed;
}

async function resolveRound(ctx: Ctx) {
  const s = ctx.state as CA.CasinoPublic;
  const priv = ctx.priv as CA.CasinoPrivate;
  const now = ctx.now;
  const round = s.round;
  const game = s.game;
  let result: CA.CasinoPublic['result'];
  if (game === 'sicbo') result = { dice: await CA.sicboResult(priv.seed, round) };
  else if (game === 'roulette') result = { number: await CA.rouletteResult(priv.seed, round) };
  else result = { crash: priv.crash! };
  s.result = result;
  s.phase = 'result';
  s.resultAt = now;
  s.nextRoundAt = now + CA.RESULT_MS[game];
  s.history = [{ round, ...result }, ...s.history].slice(0, 20);

  const { data: bets } = await admin.from('hub_casino_bets').select('*').eq('game', game).eq('round', round).eq('settled', false);
  const payouts: Record<string, number> = {};
  for (const bet of bets || []) {
    let pay = 0;
    if (game === 'sicbo') for (const l of bet.bets as CA.BetLine[]) pay += CA.sicboPayout(l.key, l.amount, result!.dice!);
    else if (game === 'roulette') for (const l of bet.bets as CA.BetLine[]) pay += CA.roulettePayout(l.key, l.amount, result!.number!);
    else if (bet.cashout === null && bet.auto_cashout !== null && Number(bet.auto_cashout) <= priv.crash!) {
      pay = Math.floor(bet.stake * Number(bet.auto_cashout));
    }
    payouts[bet.user_id] = pay;
    const pl = s.players.find((p) => p.id === bet.user_id);
    if (pl && bet.cashout === null) {
      pl.payout = pay;
      if (game === 'crash' && pay > 0) pl.cashout = Number(bet.auto_cashout);
    }
  }
  ctx.after.push(async () => {
    const { error } = await admin.rpc('hub_casino_settle', { p_game: game, p_round: round, p_payouts: payouts });
    if (error) throw error;
  });
}

function scheduleCrashTick(delayMs: number) {
  const task = (async () => {
    await new Promise((r) => setTimeout(r, Math.max(0, Math.min(delayMs, 140_000)) + 60));
    try {
      await casinoTick('crash');
    } catch (e) {
      console.error('crash tick failed', e);
    }
  })();
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(task);
}

async function casinoTick(game: CA.CasinoGame) {
  return withRoom(casinoCode(game), (ctx) => advanceCasino(ctx), () => ({ ok: true }));
}

async function casinoView(me: Profile, game: CA.CasinoGame) {
  const code = await ensureCasinoRoom(game);
  const view = await withRoom(code, (ctx) => advanceCasino(ctx), (ctx) => ({
    state: ctx.state, version: ctx.row.version, serverNow: Date.now(),
  }));
  const [{ data: wallet }, { data: mine }] = await Promise.all([
    admin.rpc('hub_wallet_ensure', { p_user: me.id }),
    admin.from('hub_casino_bets').select('round, bets, stake, cashout, auto_cashout, payout, settled')
      .eq('game', game).eq('user_id', me.id).eq('round', view.state.round).maybeSingle(),
  ]);
  return { ...view, chips: wallet, myBet: mine };
}

async function casinoBet(me: Profile, game: CA.CasinoGame, b: any) {
  const code = await ensureCasinoRoom(game);
  let lines: CA.BetLine[];
  try {
    lines = CA.validateBets(game, b.bets);
  } catch (e) {
    throw new UserError((e as Error).message);
  }
  const stake = lines.reduce((sum, l) => sum + l.amount, 0);
  const auto = game === 'crash' && Number(b.autoCashout) >= 1.01 ? Math.min(CA.CRASH_MAX, Math.floor(Number(b.autoCashout) * 100) / 100) : null;
  // Read the current round (and make sure betting is open) before charging.
  const { round, open } = await withRoom(code, (ctx) => advanceCasino(ctx), (ctx) => ({
    round: ctx.state.round as number,
    open: ctx.state.phase === 'betting' && Date.now() < ctx.state.bettingEndsAt - 300,
  }));
  if (!open) throw new UserError('Đã hết thời gian đặt cược, chờ ván sau nhé');
  const { data: chips, error } = await admin.rpc('hub_casino_place', {
    p_user: me.id, p_game: game, p_round: round, p_bets: lines, p_stake: stake, p_auto: auto,
  });
  if (error) {
    if (error.message.includes('INSUFFICIENT')) throw new UserError('Không đủ chip');
    if (error.message.includes('BET_CLOSED')) throw new UserError('Không thể cược thêm ván này');
    throw error;
  }
  // Show the bet on the shared table (cosmetic; retried with the room lock).
  await withRoom(code, (ctx) => {
    const s = ctx.state as CA.CasinoPublic;
    if (s.round !== round) return false;
    const pl = s.players.find((p) => p.id === me.id);
    if (pl) pl.amount += stake;
    else s.players.push({ id: me.id, name: me.name, amount: stake });
    return true;
  }, () => null);
  return { ok: true, chips, round };
}

async function casinoCashout(me: Profile) {
  const code = await ensureCasinoRoom('crash');
  const { round, mult, running } = await withRoom(code, (ctx) => advanceCasino(ctx), (ctx) => {
    const s = ctx.state as CA.CasinoPublic;
    const priv = ctx.priv as CA.CasinoPrivate;
    const t = Date.now();
    const m = CA.crashMultiplierAt(t - (s.startAt ?? t));
    const alive = s.phase === 'running' && priv.crash !== undefined && m < priv.crash;
    return { round: s.round, mult: m, running: alive };
  });
  if (!running) throw new UserError('Phi thuyền đã nổ!');
  const { data: pay, error } = await admin.rpc('hub_casino_cashout', { p_user: me.id, p_game: 'crash', p_round: round, p_mult: mult });
  if (error) throw new UserError('Bạn không có cược đang chạy');
  await withRoom(code, (ctx) => {
    const s = ctx.state as CA.CasinoPublic;
    const pl = s.players.find((p) => p.id === me.id);
    if (!pl || s.round !== round) return false;
    pl.cashout = mult;
    pl.payout = pay as number;
    return true;
  }, () => null);
  const { data: chips } = await admin.rpc('hub_wallet_ensure', { p_user: me.id });
  return { ok: true, multiplier: mult, payout: pay, chips };
}

// ---------------------------------------------------------------- solo games
const SOLO: Record<string, string[]> = {
  tetris: ['infinity'],
  minesweeper: Object.keys(DIFFICULTIES),
  '2048': ['classic'],
  sudoku: Object.keys(SUDOKU_LEVELS),
};

async function soloStart(me: Profile, b: any) {
  const game = String(b.game), mode = String(b.mode);
  if (!SOLO[game]?.includes(mode)) throw new UserError('Chế độ chơi không hợp lệ');
  const seed = randomSeed();
  const { data, error } = await admin.from('hub_sessions').insert({ user_id: me.id, game, mode, seed }).select('id, seed, started_at').single();
  if (error) throw error;
  return { id: data.id, seed: Number(data.seed), startedAt: data.started_at };
}

function sanitizeHandling(h: any): Handling {
  const int = (v: unknown, lo: number, hi: number, d: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : d);
  return { das: int(h?.das, 0, 30, DEFAULT_HANDLING.das), arr: int(h?.arr, 0, 10, DEFAULT_HANDLING.arr), sdf: int(h?.sdf, 0, 60, DEFAULT_HANDLING.sdf) };
}

async function soloSubmit(me: Profile, b: any) {
  const { data: sess } = await admin.from('hub_sessions').select('*').eq('id', String(b.id || '')).maybeSingle();
  if (!sess || sess.user_id !== me.id) throw new UserError('Phiên chơi không tồn tại');
  if (sess.used) throw new UserError('Ván này đã được lưu');
  const elapsed = Date.now() - new Date(sess.started_at).getTime();
  const seed = Number(sess.seed);
  let row: { score: number; time_ms: number | null; meta: Record<string, unknown> };

  if (sess.game === 'tetris') {
    let inputs;
    try { inputs = decodeInputs(b.inputs); } catch { throw new UserError('Dữ liệu ván chơi không hợp lệ'); }
    const frames = Number(b.frames);
    if (!Number.isInteger(frames) || frames <= 0) throw new UserError('Dữ liệu ván chơi không hợp lệ');
    if ((frames / FPS) * 1000 > elapsed + 5_000) throw new UserError('Thời gian chơi không khớp');
    const handling = sanitizeHandling(b.handling);
    const r = replayGame({ seed, mode: 'infinity', handling }, inputs, frames);
    if (r.score !== Number(b.score) || r.lines !== Number(b.lines)) throw new UserError('Kết quả không khớp với ván chơi');
    row = { score: r.score, time_ms: Math.round((r.frames / FPS) * 1000), meta: { lines: r.lines, level: r.level, tetrises: r.stats.tetrises, tspins: r.stats.tspins } };
  } else if (sess.game === 'minesweeper') {
    const actions = Array.isArray(b.actions) ? (b.actions as MsAction[]).slice(0, 5000) : [];
    let g;
    try { g = replayMinesweeper(sess.mode as Difficulty, seed, actions.map((a) => ({ t: a?.t, i: Number(a?.i) }))); } catch { throw new UserError('Dữ liệu ván chơi không hợp lệ'); }
    if (!g.won) throw new UserError('Ván chưa thắng');
    const t = Math.round(Number(b.timeMs));
    if (!Number.isFinite(t) || t < 500 || t > elapsed + 1_500) throw new UserError('Thời gian không hợp lệ');
    row = { score: 0, time_ms: t, meta: {} };
  } else if (sess.game === '2048') {
    let g;
    try { g = replay2048(seed, String(b.moves || '')); } catch { throw new UserError('Dữ liệu ván chơi không hợp lệ'); }
    if (g.score !== Number(b.score)) throw new UserError('Kết quả không khớp với ván chơi');
    row = { score: g.score, time_ms: null, meta: { best: g.best, moves: g.moves } };
  } else if (sess.game === 'sudoku') {
    const { puzzle } = generateSudoku(seed, sess.mode as SudokuDifficulty);
    if (!isSolved(puzzle, b.grid)) throw new UserError('Lời giải chưa đúng');
    const t = Math.round(Number(b.timeMs));
    if (!Number.isFinite(t) || t < 3_000 || t > elapsed + 1_500) throw new UserError('Thời gian không hợp lệ');
    row = { score: 0, time_ms: t, meta: { mistakes: Math.max(0, Math.min(99, Number(b.mistakes) || 0)) } };
  } else {
    throw new UserError('Trò chơi không hợp lệ');
  }

  const { data: used } = await admin.from('hub_sessions').update({ used: true }).eq('id', sess.id).eq('used', false).select('id');
  if (!used?.length) throw new UserError('Ván này đã được lưu');
  const { error } = await admin.from('hub_scores').insert({ user_id: me.id, game: sess.game, mode: sess.mode, ...row });
  if (error) throw error;
  return { ok: true, ...row };
}

// ---------------------------------------------------------------- router
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth?.user) return json({ error: 'Chưa đăng nhập' }, 401);
    const b = await req.json().catch(() => ({}));
    const me = await ensureProfile(auth.user);

    switch (b.op) {
      case 'me': {
        const { data: chips } = await admin.rpc('hub_wallet_ensure', { p_user: me.id });
        return json({ profile: me, chips, serverNow: Date.now() });
      }
      case 'profile.update': {
        const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        if (name.length < 2) throw new UserError('Tên hiển thị cần ít nhất 2 ký tự');
        const { error } = await admin.from('hub_profiles').update({ name }).eq('id', me.id);
        if (error) throw error;
        return json({ profile: { ...me, name } });
      }
      case 'time':
        return json({ serverNow: Date.now() });

      case 'room.create': return json(await createRoom(me, b));
      case 'room.join': return json(await joinRoom(me, normCode(b.code)));
      case 'room.view': return json(await withRoom(normCode(b.code), () => false, (ctx) => roomView(ctx, me)));
      case 'room.leave': return json(await leaveRoom(me, normCode(b.code)));
      case 'room.act': return json(await actRoom(me, normCode(b.code), b));

      case 'casino.view':
      case 'casino.bet':
      case 'casino.tick': {
        const game = String(b.game) as CA.CasinoGame;
        if (!CASINO_GAMES.includes(game)) throw new UserError('Trò chơi không hợp lệ');
        if (b.op === 'casino.bet') return json(await casinoBet(me, game, b));
        if (b.op === 'casino.tick') { await ensureCasinoRoom(game); return json(await casinoTick(game)); }
        return json(await casinoView(me, game));
      }
      case 'casino.cashout': return json(await casinoCashout(me));
      case 'wallet.bonus': {
        const { data, error } = await admin.rpc('hub_wallet_bonus', { p_user: me.id });
        if (error) throw new UserError(error.message.includes('BONUS_NOT_READY') ? 'Bạn đã nhận quà hôm nay rồi, quay lại sau nhé' : 'Không nhận được quà');
        return json({ chips: data });
      }

      case 'solo.start': return json(await soloStart(me, b));
      case 'solo.submit': return json(await soloSubmit(me, b));

      default:
        return json({ error: 'Unknown op' }, 400);
    }
  } catch (e) {
    if (isUserError(e)) return json({ error: (e as Error).message }, 400);
    console.error(e);
    return json({ error: 'Lỗi máy chủ' }, 500);
  }
});
