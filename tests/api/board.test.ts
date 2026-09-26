import { beforeAll, describe, expect, it } from 'vitest';
import { call, makeUser, ok, sleep, type TestUser } from './helpers';

let a: TestUser;
let b: TestUser;
let c: TestUser;

beforeAll(async () => {
  a = await makeUser('brd_a');
  b = await makeUser('brd_b');
  c = await makeUser('brd_c');
  await Promise.all([ok(a, 'me'), ok(b, 'me'), ok(c, 'me')]);
});

async function room(game: string, settings: Record<string, unknown>) {
  const { code } = await ok(a, 'room.create', { game, settings: { color: 'first', base: 60_000, inc: 0, ...settings } });
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  const joined = await ok(b, 'room.join', { code });
  expect(joined.state.status).toBe('playing');
  return code as string;
}
const move = (u: TestUser, code: string, m: string) => call(u, 'room.act', { code, action: 'move', move: m });

describe('room basics', () => {
  it('rejects bad games, bad codes and missing rooms', async () => {
    expect((await call(a, 'room.create', { game: 'nope' })).status).toBe(400);
    expect((await call(a, 'room.view', { code: '!!' })).status).toBe(400);
    const r = await call(a, 'room.view', { code: 'ZZZZZZ' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/không tồn tại/);
  });
  it('rejects too-short clocks', async () => {
    const r = await call(a, 'room.create', { game: 'chess', settings: { base: 1000 } });
    expect(r.status).toBe(400);
  });
  it('a third player cannot join a full room but can view it', async () => {
    const code = await room('chess', {});
    const r = await call(c, 'room.join', { code });
    expect(r.status).toBe(400);
    const v = await ok(c, 'room.view', { code });
    expect(v.state.seats.map((s: any) => s.id)).toEqual([a.id, b.id]);
  });
  it('leaving a waiting room deletes it when empty', async () => {
    const { code } = await ok(a, 'room.create', { game: 'caro', settings: { base: 60_000 } });
    await ok(a, 'room.leave', { code });
    const r = await call(a, 'room.view', { code });
    expect(r.status).toBe(400);
  });
});

describe('chess', () => {
  it("fool's mate: turn order, legality, rating update, match history, rematch", async () => {
    const code = await room('chess', { rated: true, base: 180_000 });
    expect((await move(b, code, 'e7e5')).body.error).toMatch(/lượt/);
    expect((await move(c, code, 'e2e4')).body.error).toMatch(/không phải người chơi/);
    expect((await move(a, code, 'e2e5')).body.error).toMatch(/không hợp lệ/);
    for (const [u, m] of [[a, 'f2f3'], [b, 'e7e5'], [a, 'g2g4'], [b, 'd8h4']] as const) {
      const r = await move(u, code, m);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
    const v = await ok(a, 'room.view', { code });
    expect(v.state.status).toBe('finished');
    expect(v.state.result).toMatchObject({ winner: 1, reason: 'checkmate' });
    expect(v.state.sans).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(v.state.ratingDelta[1]).toBeGreaterThan(0);
    expect(v.state.ratingDelta[0]).toBeLessThan(0);
    await sleep(800);
    const { data: ratings } = await a.client.from('hub_ratings').select('*').eq('category', 'chess_blitz').in('user_id', [a.id, b.id]);
    expect(ratings).toHaveLength(2);
    const ra = ratings!.find((r: any) => r.user_id === a.id)!;
    const rb = ratings!.find((r: any) => r.user_id === b.id)!;
    expect(ra.losses).toBeGreaterThanOrEqual(1);
    expect(rb.wins).toBeGreaterThanOrEqual(1);
    expect(rb.rating).toBeGreaterThan(ra.rating);
    const { data: hist } = await a.client.from('hub_matches').select('*').eq('room_code', code);
    expect(hist).toHaveLength(1);
    // rematch: needs both, swaps colours
    await ok(a, 'room.act', { code, action: 'rematch' });
    const r2 = await ok(b, 'room.act', { code, action: 'rematch' });
    expect(r2.state.nextCode).toMatch(/^[A-Z0-9]{6}$/);
    await sleep(500);
    const next = await ok(a, 'room.view', { code: r2.state.nextCode });
    expect(next.state.seats[0].id).toBe(b.id);
    expect(next.state.seats[1].id).toBe(a.id);
    expect(next.state.status).toBe('playing');
  });
  it('draw offer / decline / accept', async () => {
    const code = await room('chess', {});
    await move(a, code, 'e2e4');
    await move(b, code, 'e7e5');
    await ok(a, 'room.act', { code, action: 'draw' });
    let v = await ok(b, 'room.act', { code, action: 'decline' });
    expect(v.state.drawOffer).toBeNull();
    await ok(a, 'room.act', { code, action: 'draw' });
    v = await ok(b, 'room.act', { code, action: 'draw' });
    expect(v.state.result).toMatchObject({ winner: null, reason: 'agreement' });
  });
  it('resign and aborted games', async () => {
    const code = await room('chess', {});
    let v = await ok(a, 'room.act', { code, action: 'resign' });
    expect(v.state.result.reason).toBe('aborted');
    const code2 = await room('chess', {});
    await move(a, code2, 'd2d4');
    await move(b, code2, 'd7d5');
    v = await ok(b, 'room.act', { code: code2, action: 'resign' });
    expect(v.state.result).toMatchObject({ winner: 0, reason: 'resign' });
  });
  it('clock: the server flags a player who runs out of time', async () => {
    const code = await room('chess', { base: 15_000 });
    await move(a, code, 'e2e4');
    await move(b, code, 'e7e5');
    await sleep(16_000);
    const v = await ok(b, 'room.act', { code, action: 'tick' });
    expect(v.state.status).toBe('finished');
    expect(v.state.result).toMatchObject({ winner: 1, reason: 'timeout' });
    expect(v.state.clock.rem[0]).toBe(0);
  }, 60_000);
  it('clock: time is deducted and increment added', async () => {
    const code = await room('chess', { base: 60_000, inc: 2_000 });
    await move(a, code, 'e2e4');
    await move(b, code, 'e7e5');
    await sleep(1_500);
    const v = (await move(a, code, 'g1f3')).body;
    const rem = v.state.clock.rem[0];
    expect(rem).toBeLessThan(60_000 + 2_000 - 1_000);
    expect(rem).toBeGreaterThan(60_000 + 2_000 - 5_000);
    expect(v.state.clock.rem[1]).toBe(60_000);
  });
});

describe('xiangqi, caro, dots', () => {
  it('xiangqi moves use Vietnamese notation and illegal moves are refused', async () => {
    const code = await room('xiangqi', {});
    expect((await move(a, code, 'h2h8')).body.error).toMatch(/không hợp lệ/); // cannon cannot jump without capturing
    await move(a, code, 'h2e2');
    const v = (await move(b, code, 'h9g7')).body;
    expect(v.state.sans).toEqual(['P2-5', 'M8.7']);
  });
  it('caro: five in a row wins (15x15)', async () => {
    const code = await room('caro', { caro: { size: 15 } });
    const X = [0, 1, 2, 3, 4], O = [30, 31, 32, 33];
    for (let i = 0; i < 5; i++) {
      await move(a, code, String(X[i]));
      if (i < 4) await move(b, code, String(O[i]));
    }
    const v = await ok(a, 'room.view', { code });
    expect(v.state.result).toMatchObject({ winner: 0, reason: 'five' });
    expect((await move(b, code, '100')).body.error).toMatch(/kết thúc/);
  });
  it('caro: occupied cells are refused', async () => {
    const code = await room('caro', {});
    await move(a, code, '112');
    expect((await move(b, code, '112')).body.error).toMatch(/không hợp lệ/);
  });
  it('dots: completing a box keeps the turn', async () => {
    const code = await room('dots', { dots: { size: 3 } });
    // box (0,0) sides for n=3: top h(0,0)=0, bottom h(1,0)=3, left v(0,0)=12, right v(0,1)=13
    await move(a, code, '0');
    await move(b, code, '3');
    await move(a, code, '12');
    const v = (await move(b, code, '13')).body;
    expect(v.state.turn).toBe(1); // b completed the box and moves again
    expect(v.state.sans[3]).toBe('13+1');
  });
});
