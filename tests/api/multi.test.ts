import { beforeAll, describe, expect, it } from 'vitest';
import { call, makeUser, ok, sleep, type TestUser } from './helpers';
import { beats, classify, THREE_SPADES } from '@shared/tienlen.ts';

let a: TestUser;
let b: TestUser;
let c: TestUser;

beforeAll(async () => {
  a = await makeUser('mp_a');
  b = await makeUser('mp_b');
  c = await makeUser('mp_c');
  await Promise.all([ok(a, 'me'), ok(b, 'me'), ok(c, 'me')]);
});

describe('tetris 1v1 room', () => {
  it('ready -> countdown -> KOs -> final stats -> result', async () => {
    const { code } = await ok(a, 'room.create', { game: 'tetris', settings: { mode: 'blitz', duration: 60, rated: false } });
    await ok(b, 'room.join', { code });
    await ok(a, 'room.act', { code, action: 'ready' });
    const v = await ok(b, 'room.act', { code, action: 'ready' });
    expect(v.state.status).toBe('playing');
    expect(v.state.round).toBe(1);
    expect(v.state.startAt - v.serverNow).toBeGreaterThan(2_000);
    // before start: deaths are ignored
    await ok(a, 'room.act', { code, action: 'report', round: 1, died: true });
    let s = (await ok(a, 'room.view', { code })).state;
    expect(s.deaths).toEqual([0, 0]);
    await sleep(Math.max(0, s.startAt - Date.now()) + 300);
    await ok(a, 'room.act', { code, action: 'report', round: 1, died: true });
    await ok(a, 'room.act', { code, action: 'report', round: 1, died: true });
    await ok(b, 'room.act', { code, action: 'report', round: 1, died: true });
    s = (await ok(a, 'room.view', { code })).state;
    expect(s.deaths).toEqual([2, 1]);
    // stale round reports are ignored
    await ok(b, 'room.act', { code, action: 'report', round: 7, died: true });
    expect((await ok(a, 'room.view', { code })).state.deaths).toEqual([2, 1]);
    // leaving mid-match forfeits
    await ok(b, 'room.leave', { code });
    s = (await ok(a, 'room.view', { code })).state;
    expect(s.status).toBe('finished');
    expect(s.result).toMatchObject({ winner: 0, reason: 'forfeit' });
  }, 60_000);
  it('survival: dying ends the round, first to N wins', async () => {
    const { code } = await ok(a, 'room.create', { game: 'tetris', settings: { mode: 'survival', firstTo: 1 } });
    await ok(b, 'room.join', { code });
    await ok(a, 'room.act', { code, action: 'ready' });
    const v = await ok(b, 'room.act', { code, action: 'ready' });
    await sleep(Math.max(0, v.state.startAt - Date.now()) + 300);
    const r = await ok(b, 'room.act', { code, action: 'report', round: 1, died: true });
    expect(r.state.result).toMatchObject({ winner: 0, reason: 'rounds' });
  }, 30_000);
});

describe('tiến lên', () => {
  it('deals hidden hands and plays a full game to the end', async () => {
    const { code } = await ok(a, 'room.create', { game: 'tienlen' });
    await ok(b, 'room.join', { code });
    await ok(c, 'room.join', { code });
    await ok(a, 'room.act', { code, action: 'ready' });
    await ok(b, 'room.act', { code, action: 'ready' });
    let v = await ok(c, 'room.act', { code, action: 'ready' });
    expect(['playing', 'finished']).toContain(v.state.status);
    if (v.state.status === 'finished') return; // instant win dealt, nothing else to test
    const users = [a, b, c];
    // each player sees only their own hand
    const views = await Promise.all(users.map((u) => ok(u, 'room.view', { code })));
    const hands = views.map((x) => x.state.hand as number[]);
    for (const h of hands) expect(h).toHaveLength(13);
    expect(new Set(hands.flat()).size).toBe(39);
    const { data: raw } = await a.client.from('hub_rooms').select('state').eq('code', code).single();
    expect(raw!.state.hand).toBeUndefined();
    expect(JSON.stringify(raw!.state)).not.toContain('"hands"');
    // cannot play cards you don't own / out of turn
    const turn = views[0].state.turn as number;
    const other = users[(turn + 1) % 3];
    expect((await call(other, 'room.act', { code, action: 'play', cards: [hands[(turn + 1) % 3][0]] })).status).toBe(400);
    expect((await call(users[turn], 'room.act', { code, action: 'play', cards: [hands[(turn + 1) % 3][0]] })).status).toBe(400);
    // simple bot loop
    for (let guard = 0; guard < 200; guard++) {
      v = await ok(a, 'room.view', { code });
      if (v.state.status !== 'playing') break;
      const t = v.state.turn;
      const me = users[t];
      const mv = await ok(me, 'room.view', { code });
      const hand: number[] = mv.state.hand;
      const table = mv.state.table ? classify(mv.state.table.cards) : null;
      if (!table) {
        const first = mv.state.firstGame && mv.state.lastPlays.length === 0 && hand.includes(THREE_SPADES) ? THREE_SPADES : hand[0];
        await ok(me, 'room.act', { code, action: 'play', cards: [first] });
      } else if (table.type === 'single') {
        const card = hand.find((x) => beats(table, classify([x])!));
        if (card !== undefined) await ok(me, 'room.act', { code, action: 'play', cards: [card] });
        else await ok(me, 'room.act', { code, action: 'pass' });
      } else {
        await ok(me, 'room.act', { code, action: 'pass' });
      }
    }
    v = await ok(a, 'room.view', { code });
    expect(v.state.status).toBe('finished');
    expect(v.state.finished).toHaveLength(3);
    expect(v.state.deltas.reduce((x: number, y: number) => x + y, 0)).toBe(0);
  }, 120_000);
});

describe('cờ tỉ phú', () => {
  it('lobby, start by host, roll, buy/decline, end turn, afk handling', async () => {
    const { code } = await ok(a, 'room.create', { game: 'monopoly', settings: { startMoney: 1500, timeLimitMin: 30 } });
    await ok(b, 'room.join', { code });
    expect((await call(b, 'room.act', { code, action: 'start' })).body.error).toMatch(/chủ phòng/);
    let v = await ok(a, 'room.act', { code, action: 'start' });
    expect(v.state.status).toBe('playing');
    const users = [a, b];
    const byId = (id: string) => users.find((u) => u.id === id)!;
    for (let step = 0; step < 12; step++) {
      v = await ok(a, 'room.view', { code });
      const cur = byId(v.state.players[v.state.turn].id);
      const phase = v.state.phase;
      if (phase === 'roll') {
        const r = await ok(cur, 'room.act', { code, action: 'roll' });
        expect(r.state.dice).toHaveLength(2);
      } else if (phase === 'buy') {
        await ok(cur, 'room.act', { code, action: 'buy', buy: step % 2 === 0 });
      } else if (phase === 'end') {
        const other = users.find((u) => u !== cur)!;
        expect((await call(other, 'room.act', { code, action: 'end' })).status).toBe(400);
        await ok(cur, 'room.act', { code, action: 'end' });
      } else if (phase === 'debt') {
        await ok(cur, 'room.act', { code, action: 'bankrupt' });
        break;
      }
    }
    v = await ok(a, 'room.view', { code });
    const total = v.state.players.reduce((s: number, p: any) => s + p.money, 0);
    expect(total).toBeGreaterThan(0);
    expect(v.state.log.length).toBeGreaterThan(3);
  }, 90_000);
});
