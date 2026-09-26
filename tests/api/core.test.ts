import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { call, KEY, makeUser, ok, register, URL, type TestUser } from './helpers';

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  a = await makeUser('core_a');
  b = await makeUser('core_b');
});

describe('auth', () => {
  it('rejects calls without a token', async () => {
    const r = await call(null, 'me');
    expect(r.status).toBe(401);
  });
  it('rejects a forged token', async () => {
    const r = await call({ ...a, token: 'not-a-jwt' }, 'me');
    expect(r.status).toBe(401);
  });
  it('register validates input and refuses duplicates', async () => {
    expect((await register('A!', 'secret123', 'x')).status).toBe(400);
    expect((await register('valid_name_zz', '123', 'x')).status).toBe(400);
    expect((await register(a.username, a.password, 'dup')).status).toBe(409);
  });
  it('unknown ops are rejected', async () => {
    const r = await call(a, 'drop.tables');
    expect(r.status).toBe(400);
  });
});

describe('profile & wallet', () => {
  it('me creates a profile and a wallet with starting chips', async () => {
    const me = await ok(a, 'me');
    expect(me.profile.id).toBe(a.id);
    expect(me.profile.username).toBe(a.username);
    expect(me.profile.name).toBe(a.name);
    expect(me.chips).toBe(10_000);
    expect(typeof me.serverNow).toBe('number');
  });
  it('profile.update validates and trims the name', async () => {
    expect((await call(a, 'profile.update', { name: ' x ' })).status).toBe(400);
    const r = await ok(a, 'profile.update', { name: '  Nguyễn   Văn  A  ' });
    expect(r.profile.name).toBe('Nguyễn Văn A');
    const me = await ok(a, 'me');
    expect(me.profile.name).toBe('Nguyễn Văn A');
  });
  it('daily bonus works once', async () => {
    const r1 = await ok(b, 'wallet.bonus');
    expect(r1.chips).toBe(15_000);
    const r2 = await call(b, 'wallet.bonus');
    expect(r2.status).toBe(400);
    expect(r2.body.error).toMatch(/đã nhận/);
  });
});

describe('row level security', () => {
  it('clients cannot write game tables directly', async () => {
    const c = a.client;
    const ins = await c.from('hub_rooms').insert({ code: 'HACKED', game: 'chess', state: {} });
    expect(ins.error).not.toBeNull();
    const w = await c.from('hub_wallets').update({ chips: 99_999_999 }).eq('user_id', a.id).select();
    expect(w.data ?? []).toHaveLength(0);
    const sc = await c.from('hub_scores').insert({ user_id: a.id, game: 'tetris', mode: 'infinity', score: 1e9 });
    expect(sc.error).not.toBeNull();
    const rt = await c.from('hub_ratings').upsert({ user_id: a.id, category: 'chess_blitz', rating: 3000 });
    expect(rt.error).not.toBeNull();
    const pr = await c.from('hub_profiles').update({ name: 'hijack' }).eq('id', b.id).select();
    expect(pr.data ?? []).toHaveLength(0);
  });
  it('hidden tables are not readable', async () => {
    const priv = await a.client.from('hub_room_private').select('*').limit(5);
    expect(priv.data ?? []).toHaveLength(0);
    const sess = await a.client.from('hub_sessions').select('*').limit(5);
    expect(sess.data ?? []).toHaveLength(0);
  });
  it('bets of other users are not visible', async () => {
    const r = await b.client.from('hub_casino_bets').select('*').eq('user_id', a.id);
    expect(r.data ?? []).toHaveLength(0);
  });
  it('privileged RPCs cannot be called by clients', async () => {
    const r1 = await a.client.rpc('hub_wallet_bonus', { p_user: a.id });
    expect(r1.error).not.toBeNull();
    const r2 = await a.client.rpc('hub_casino_settle', { p_game: 'sicbo', p_round: 1, p_payouts: { [a.id]: 1_000_000 } });
    expect(r2.error).not.toBeNull();
    const r3 = await a.client.rpc('hub_room_commit', { p_id: '00000000-0000-0000-0000-000000000000', p_expected: 0, p_state: {}, p_status: 'x', p_private: null });
    expect(r3.error).not.toBeNull();
  });
  it('anonymous clients cannot read anything', async () => {
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    const r = await anon.from('hub_rooms').select('*').limit(1);
    expect(r.data ?? []).toHaveLength(0);
    const lb = await anon.rpc('hub_leaderboard', { p_game: 'tetris', p_mode: 'infinity' });
    expect(lb.error).not.toBeNull();
  });
});
