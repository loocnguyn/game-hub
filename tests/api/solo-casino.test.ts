import { beforeAll, describe, expect, it } from 'vitest';
import { call, makeUser, ok, sleep, until, type TestUser } from './helpers';
import { TetrisEngine, encodeInputs, type InputEvent } from '@shared/tetris.ts';
import { Minesweeper, HIDDEN } from '@shared/minesweeper.ts';
import { Game2048, type Dir } from '@shared/g2048.ts';
import { generateSudoku } from '@shared/sudoku.ts';
import { roulettePayout, sicboPayout } from '@shared/casino.ts';
import { mulberry32 } from '@shared/rng.ts';

let u: TestUser;
let v: TestUser;

beforeAll(async () => {
  u = await makeUser('solo_a');
  v = await makeUser('solo_b');
  await Promise.all([ok(u, 'me'), ok(v, 'me')]);
});

function playTetris(seed: number, frames: number) {
  const eng = new TetrisEngine({ seed, mode: 'infinity' });
  const rng = mulberry32(seed + 1);
  const log: InputEvent[] = [];
  while (!eng.over && eng.frame < frames) {
    const batch: InputEvent[] = [];
    if (eng.frame % 20 === 0) {
      const a = [0, 1, 3, 4, 5, 7][Math.floor(rng() * 6)] as InputEvent['a'];
      batch.push({ f: eng.frame, a, d: true }, { f: eng.frame, a, d: false });
    }
    log.push(...batch);
    eng.step(batch);
    eng.drainEvents();
  }
  return { eng, log };
}

describe('solo: tetris', () => {
  it('accepts a genuine replay and rejects tampering and reuse', async () => {
    const s = await ok(u, 'solo.start', { game: 'tetris', mode: 'infinity' });
    const { eng, log } = playTetris(s.seed, 1500);
    await sleep(Math.ceil((eng.frame / 60) * 1000)); // real time must cover the frames played
    const fake = await call(u, 'solo.submit', { id: s.id, inputs: encodeInputs(log), frames: eng.frame, score: eng.score + 1000, lines: eng.lines, handling: eng.handling });
    expect(fake.status).toBe(400);
    const good = await ok(u, 'solo.submit', { id: s.id, inputs: encodeInputs(log), frames: eng.frame, score: eng.score, lines: eng.lines, handling: eng.handling });
    expect(good.score).toBe(eng.score);
    const again = await call(u, 'solo.submit', { id: s.id, inputs: encodeInputs(log), frames: eng.frame, score: eng.score, lines: eng.lines, handling: eng.handling });
    expect(again.status).toBe(400);
    const { data } = await u.client.rpc('hub_leaderboard', { p_game: 'tetris', p_mode: 'infinity', p_limit: 100 });
    expect((data as any[]).some((r) => r.user_id === u.id)).toBe(true);
  }, 60_000);
  it('rejects more frames than wall-clock time allows', async () => {
    const s = await ok(u, 'solo.start', { game: 'tetris', mode: 'infinity' });
    const { eng, log } = playTetris(s.seed, 60 * 60);
    const r = await call(u, 'solo.submit', { id: s.id, inputs: encodeInputs(log), frames: eng.frame, score: eng.score, lines: eng.lines });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Thời gian/);
  });
  it("cannot submit someone else's session", async () => {
    const s = await ok(u, 'solo.start', { game: 'tetris', mode: 'infinity' });
    const r = await call(v, 'solo.submit', { id: s.id, inputs: [], frames: 1, score: 0, lines: 0 });
    expect(r.status).toBe(400);
  });
  it('rejects bad modes', async () => {
    expect((await call(u, 'solo.start', { game: 'tetris', mode: 'god' })).status).toBe(400);
    expect((await call(u, 'solo.start', { game: 'chess', mode: 'x' })).status).toBe(400);
  });
});

describe('solo: minesweeper, 2048, sudoku', () => {
  it('minesweeper: a real win is ranked, a loss is refused', async () => {
    const s = await ok(u, 'solo.start', { game: 'minesweeper', mode: 'beginner' });
    const g = new Minesweeper('beginner', s.seed);
    g.reveal(40);
    for (let i = 0; i < g.size; i++) if (!g.mine[i] && g.state[i] === HIDDEN) g.reveal(i);
    expect(g.won).toBe(true);
    await sleep(1_200);
    const r = await ok(u, 'solo.submit', { id: s.id, actions: g.log, timeMs: 1_100 });
    expect(r.time_ms).toBe(1_100);
    const s2 = await ok(u, 'solo.start', { game: 'minesweeper', mode: 'beginner' });
    const g2 = new Minesweeper('beginner', s2.seed);
    g2.reveal(40);
    g2.reveal(g2.mine.findIndex((m) => m === 1));
    await sleep(700);
    const bad = await call(u, 'solo.submit', { id: s2.id, actions: g2.log, timeMs: 600 });
    expect(bad.status).toBe(400);
  });
  it('minesweeper: claimed time cannot beat wall-clock time', async () => {
    const s = await ok(u, 'solo.start', { game: 'minesweeper', mode: 'beginner' });
    const g = new Minesweeper('beginner', s.seed);
    g.reveal(40);
    for (let i = 0; i < g.size; i++) if (!g.mine[i] && g.state[i] === HIDDEN) g.reveal(i);
    const r = await call(u, 'solo.submit', { id: s.id, actions: g.log, timeMs: 60_000 });
    expect(r.status).toBe(400);
  });
  it('2048: score must match the replay', async () => {
    const s = await ok(u, 'solo.start', { game: '2048', mode: 'classic' });
    const g = new Game2048(s.seed);
    let moves = '';
    for (let i = 0; i < 200 && !g.over; i++) { const d = (i % 4) as Dir; g.move(d); moves += d; }
    expect((await call(u, 'solo.submit', { id: s.id, moves, score: g.score + 4 })).status).toBe(400);
    const r = await ok(u, 'solo.submit', { id: s.id, moves, score: g.score });
    expect(r.score).toBe(g.score);
  });
  it('sudoku: only a correct grid is accepted', async () => {
    const s = await ok(u, 'solo.start', { game: 'sudoku', mode: 'easy' });
    const { solution } = generateSudoku(s.seed, 'easy');
    await sleep(3_200);
    const wrong = solution.slice();
    [wrong[0], wrong[1]] = [wrong[1], wrong[0]];
    expect((await call(u, 'solo.submit', { id: s.id, grid: wrong, timeMs: 3_100 })).status).toBe(400);
    const r = await ok(u, 'solo.submit', { id: s.id, grid: solution, timeMs: 3_100 });
    expect(r.time_ms).toBe(3_100);
  });
});

async function chips(user: TestUser) {
  return (await ok(user, 'me')).chips as number;
}

describe('casino', () => {
  it('sic bo: validates bets, charges chips and pays exactly per the result', async () => {
    let view = await ok(u, 'casino.view', { game: 'sicbo' });
    expect(['betting', 'result']).toContain(view.state.phase);
    expect(view.state.seedHash).toMatch(/^[0-9a-f]{64}$/);
    // wait for a fresh betting window with >= 8 s left
    view = await until(async () => {
      const x = await ok(u, 'casino.view', { game: 'sicbo' });
      if (x.state.phase === 'result') await call(u, 'casino.tick', { game: 'sicbo' });
      return x.state.phase === 'betting' && x.state.bettingEndsAt - x.serverNow > 8_000 ? x : null;
    }, 45_000, 1_000);
    expect((await call(u, 'casino.bet', { game: 'sicbo', bets: [{ key: 'nope', amount: 100 }] })).status).toBe(400);
    expect((await call(u, 'casino.bet', { game: 'sicbo', bets: [{ key: 'big', amount: 5 }] })).status).toBe(400);
    expect((await call(u, 'casino.bet', { game: 'sicbo', bets: [{ key: 'big', amount: 10_000_000 }] })).status).toBe(400);
    const before = await chips(u);
    const bets = [{ key: 'big', amount: 100 }, { key: 'small', amount: 100 }, { key: 'single:6', amount: 50 }, { key: 'total:10', amount: 20 }];
    const r = await ok(u, 'casino.bet', { game: 'sicbo', bets });
    expect(r.chips).toBe(before - 270);
    const round = r.round;
    // wait for the result
    const res = await until(async () => {
      await call(u, 'casino.tick', { game: 'sicbo' });
      const x = await ok(u, 'casino.view', { game: 'sicbo' });
      return x.state.round === round && x.state.phase === 'result' && x.myBet?.settled ? x : null;
    }, 45_000, 1_000);
    const dice = res.state.result.dice as number[];
    const expected = bets.reduce((s, b) => s + sicboPayout(b.key, b.amount, dice), 0);
    expect(res.myBet.payout).toBe(expected);
    expect(await chips(u)).toBe(before - 270 + expected);
    // provably fair: next round reveals the seed whose hash was published
    const nxt = await until(async () => {
      await call(u, 'casino.tick', { game: 'sicbo' });
      const x = await ok(u, 'casino.view', { game: 'sicbo' });
      return x.state.round > round ? x : null;
    }, 30_000, 1_000);
    if (nxt.state.revealed?.round === round) {
      const { sha256Hex, sicboResult } = await import('@shared/casino.ts');
      expect(await sha256Hex(nxt.state.revealed.seed)).toBe(nxt.state.revealed.hash);
      expect(await sicboResult(nxt.state.revealed.seed, round)).toEqual(dice);
    }
  }, 150_000);
  it('roulette: straight-up and outside bets settle correctly', async () => {
    await until(async () => {
      const x = await ok(v, 'casino.view', { game: 'roulette' });
      if (x.state.phase === 'result') await call(v, 'casino.tick', { game: 'roulette' });
      return x.state.phase === 'betting' && x.state.bettingEndsAt - x.serverNow > 8_000 ? x : null;
    }, 45_000, 1_000);
    const before = await chips(v);
    const bets = [{ key: 'n:17', amount: 10 }, { key: 'red', amount: 100 }, { key: 'dozen:1', amount: 50 }, { key: 'split:1-2', amount: 10 }];
    const r = await ok(v, 'casino.bet', { game: 'roulette', bets });
    const res = await until(async () => {
      await call(v, 'casino.tick', { game: 'roulette' });
      const x = await ok(v, 'casino.view', { game: 'roulette' });
      return x.state.round === r.round && x.state.phase === 'result' && x.myBet?.settled ? x : null;
    }, 45_000, 1_000);
    const n = res.state.result.number as number;
    const expected = bets.reduce((s, b) => s + roulettePayout(b.key, b.amount, n), 0);
    expect(await chips(v)).toBe(before - 170 + expected);
  }, 120_000);
  it('crash: bet, cash out while flying (or lose if it crashes first)', async () => {
    await until(async () => {
      const x = await ok(u, 'casino.view', { game: 'crash' });
      if (x.state.phase !== 'betting') await call(u, 'casino.tick', { game: 'crash' });
      return x.state.phase === 'betting' && x.state.bettingEndsAt - x.serverNow > 3_000 ? x : null;
    }, 60_000, 700);
    const before = await chips(u);
    const r = await ok(u, 'casino.bet', { game: 'crash', bets: [{ key: 'crash', amount: 100 }] });
    expect(r.chips).toBe(before - 100);
    expect((await call(u, 'casino.bet', { game: 'crash', bets: [{ key: 'crash', amount: 100 }], autoCashout: 2 })).status).toBe(200);
    const running = await until(async () => {
      await call(u, 'casino.tick', { game: 'crash' });
      const x = await ok(u, 'casino.view', { game: 'crash' });
      return x.state.round === r.round && x.state.phase !== 'betting' ? x : null;
    }, 20_000, 300);
    const co = await call(u, 'casino.cashout');
    if (co.status === 200) {
      expect(co.body.multiplier).toBeGreaterThanOrEqual(1);
      expect(co.body.payout).toBe(Math.floor(200 * co.body.multiplier));
      expect((await call(u, 'casino.cashout')).status).toBe(400); // only once
    } else {
      expect(running.state.phase === 'result' || co.body.error).toBeTruthy();
    }
    const done = await until(async () => {
      await call(u, 'casino.tick', { game: 'crash' });
      const x = await ok(u, 'casino.view', { game: 'crash' });
      return x.state.round === r.round && x.state.phase === 'result' ? x : x.state.round > r.round ? x : null;
    }, 90_000, 1_000);
    expect(done).toBeTruthy();
  }, 180_000);
  it('cannot bet more chips than you have', async () => {
    const poor = await makeUser('poor');
    await ok(poor, 'me');
    await until(async () => {
      const x = await ok(poor, 'casino.view', { game: 'sicbo' });
      if (x.state.phase === 'result') await call(poor, 'casino.tick', { game: 'sicbo' });
      return x.state.phase === 'betting' && x.state.bettingEndsAt - x.serverNow > 3_000 ? x : null;
    }, 45_000, 1_000);
    const r = await call(poor, 'casino.bet', { game: 'sicbo', bets: [{ key: 'big', amount: 10_001 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Không đủ chip/);
    expect(await chips(poor)).toBe(10_000);
  }, 60_000);
});
