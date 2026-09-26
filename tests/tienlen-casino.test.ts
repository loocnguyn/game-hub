import { describe, expect, it } from 'vitest';
import {
  beats, cardName, classify, createTienLen, instantWin, placePoints, THREE_SPADES, tlAdvance, tlJoin, tlLeave, tlPass,
  tlPlay, tlSetReady, tlStart, TURN_MS, type TLPrivate, type TLPublic,
} from '@shared/tienlen.ts';
import {
  crashMultiplierAt, crashPoint, crashTimeFor, hmacHex, intsFromHex, isSicboBet, ROULETTE_BETS, roulettePayout,
  rouletteResult, sha256Hex, sicboPayout, sicboResult, validateBets, WHEEL, RED,
} from '@shared/casino.ts';

// card helper: c('3♠'), c('10♥'), c('2♥')
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS = ['♠', '♣', '♦', '♥'];
const c = (s: string) => RANKS.indexOf(s.slice(0, -1)) * 4 + SUITS.indexOf(s.slice(-1));
const cs = (...s: string[]) => s.map(c);

describe('tiến lên: card model', () => {
  it('ids order by rank then suit (♠ < ♣ < ♦ < ♥), 2 is highest', () => {
    expect(c('3♠')).toBe(0);
    expect(c('3♥')).toBe(3);
    expect(c('2♥')).toBe(51);
    expect(cardName(c('10♦'))).toBe('10♦');
    expect(c('A♥')).toBeLessThan(c('2♠'));
  });
});

describe('tiến lên: combinations', () => {
  it.each([
    [['5♠'], 'single'],
    [['5♠', '5♥'], 'pair'],
    [['5♠', '5♥', '5♦'], 'triple'],
    [['5♠', '5♥', '5♦', '5♣'], 'quad'],
    [['3♠', '4♥', '5♦'], 'seq'],
    [['10♠', 'J♥', 'Q♦', 'K♣', 'A♠'], 'seq'],
    [['3♠', '3♥', '4♦', '4♣', '5♠', '5♥'], 'dseq'],
    [['7♠', '7♥', '8♦', '8♣', '9♠', '9♥', '10♠', '10♥'], 'dseq'],
  ])('%j is a %s', (cards, type) => {
    expect(classify(cs(...(cards as string[])))?.type).toBe(type);
  });
  it.each([
    [['5♠', '6♥']],
    [['3♠', '4♥']], // 2-card straight
    [['K♠', 'A♥', '2♦']], // 2 in straight
    [['A♠', 'A♥', '2♦', '2♣', '3♠', '3♥']],
    [['3♠', '3♥', '4♦', '4♣']], // only 2 pairs
    [['3♠', '3♥', '5♦', '5♣', '6♠', '6♥']], // gap
    [['5♠', '5♠']],
    [[]],
  ])('%j is not a combination', (cards) => {
    expect(classify(cs(...(cards as string[])))).toBeNull();
  });
  it('same type & length: higher top card wins (suit breaks ties)', () => {
    expect(beats(classify(cs('7♠'))!, classify(cs('7♥'))!)).toBe(true);
    expect(beats(classify(cs('7♥'))!, classify(cs('7♠'))!)).toBe(false);
    expect(beats(classify(cs('3♠', '4♠', '5♠'))!, classify(cs('3♥', '4♥', '5♥'))!)).toBe(true);
    expect(beats(classify(cs('3♠', '4♠', '5♠'))!, classify(cs('3♥', '4♥', '5♥', '6♥'))!)).toBe(false);
    expect(beats(classify(cs('9♠', '9♣'))!, classify(cs('9♦', '9♥'))!)).toBe(true);
  });
  it('chặt heo: single 2 cut by 3 đôi thông or tứ quý', () => {
    const heo = classify(cs('2♥'))!;
    expect(beats(heo, classify(cs('3♠', '3♥', '4♦', '4♣', '5♠', '5♥'))!)).toBe(true);
    expect(beats(heo, classify(cs('9♠', '9♥', '9♦', '9♣'))!)).toBe(true);
    expect(beats(heo, classify(cs('9♠', '9♥', '9♦'))!)).toBe(false);
  });
  it('đôi heo cut by tứ quý or 4 đôi thông but not 3 đôi thông', () => {
    const pair2 = classify(cs('2♠', '2♥'))!;
    expect(beats(pair2, classify(cs('9♠', '9♥', '9♦', '9♣'))!)).toBe(true);
    expect(beats(pair2, classify(cs('3♠', '3♥', '4♦', '4♣', '5♠', '5♥', '6♠', '6♥'))!)).toBe(true);
    expect(beats(pair2, classify(cs('3♠', '3♥', '4♦', '4♣', '5♠', '5♥'))!)).toBe(false);
  });
  it('bombs cut each other in order: 3 đôi thông < tứ quý < 4 đôi thông', () => {
    const d3 = classify(cs('3♠', '3♥', '4♦', '4♣', '5♠', '5♥'))!;
    const q = classify(cs('9♠', '9♥', '9♦', '9♣'))!;
    const d4 = classify(cs('3♠', '3♥', '4♦', '4♣', '5♠', '5♥', '6♠', '6♥'))!;
    expect(beats(d3, q)).toBe(true);
    expect(beats(q, d4)).toBe(true);
    expect(beats(q, d3)).toBe(false);
    expect(beats(d4, q)).toBe(false);
    expect(beats(classify(cs('7♠'))!, q)).toBe(false); // bombs only cut 2s / bombs
  });
  it('tới trắng', () => {
    expect(instantWin(cs('2♠', '2♣', '2♦', '2♥', '3♠', '4♠', '5♠', '6♠', '7♠', '8♠', '9♠', '10♠', 'J♠'))).toBe('Tứ quý heo');
    expect(instantWin(cs('3♠', '4♠', '5♠', '6♠', '7♠', '8♠', '9♠', '10♠', 'J♠', 'Q♠', 'K♠', 'A♠', '2♠'))).toBe('Sảnh rồng');
    expect(instantWin(cs('3♠', '3♥', '5♠', '5♥', '7♠', '7♥', '9♠', '9♥', 'J♠', 'J♥', 'K♠', 'K♥', '2♠'))).toBe('6 đôi');
    expect(instantWin(cs('3♠', '3♥', '4♠', '4♥', '5♠', '5♥', '6♠', '6♥', '7♠', '7♥', '9♠', 'J♥', '2♠'))).toBe('5 đôi thông');
    expect(instantWin(cs('3♠', '3♥', '4♠', '4♥', '5♠', '5♥', '6♠', '9♥', '7♠', '10♥', 'Q♠', 'J♥', '2♠'))).toBeNull();
  });
});

function table(players = 4, seed = 1): { pub: TLPublic; priv: TLPrivate } {
  const t = createTienLen({ id: 'p0', name: 'P0' }, 0);
  for (let i = 1; i < players; i++) tlJoin(t.pub, { id: `p${i}`, name: `P${i}` });
  // find a seed without an instant win so the game actually runs
  for (let s = seed; ; s++) {
    const probe = JSON.parse(JSON.stringify(t));
    tlStart(probe.pub, probe.priv, 0, s);
    if (!probe.pub.instant) {
      tlStart(t.pub, t.priv, 0, s);
      return t;
    }
  }
}

describe('tiến lên: game flow', () => {
  it('deals 13 unique cards per player', () => {
    const { pub, priv } = table(4);
    const all = priv.hands.flat();
    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
    expect(pub.counts).toEqual([13, 13, 13, 13]);
  });
  it('first game: 3♠ holder starts and must play it', () => {
    const { pub, priv } = table(4);
    expect(priv.hands[pub.turn]).toContain(THREE_SPADES);
    const other = priv.hands[pub.turn].find((x) => x !== THREE_SPADES)!;
    expect(() => tlPlay(pub, priv, pub.turn, [other], 1)).toThrow('3 bích');
    tlPlay(pub, priv, pub.turn, [THREE_SPADES], 1);
    expect(pub.counts.reduce((a, b) => a + b)).toBe(51);
  });
  it('rejects out-of-turn, missing cards and weaker plays; cannot pass when leading', () => {
    const { pub, priv } = table(4);
    const lead = pub.turn;
    expect(() => tlPass(pub, lead, 1)).toThrow('đi trước');
    expect(() => tlPlay(pub, priv, (lead + 1) % 4, [priv.hands[(lead + 1) % 4][0]], 1)).toThrow('lượt');
    tlPlay(pub, priv, lead, [THREE_SPADES], 1);
    const next = pub.turn;
    const notMine = priv.hands[lead][0];
    expect(() => tlPlay(pub, priv, next, [notMine], 2)).toThrow('không có');
  });
  it('round resets to the last player when everyone else passes', () => {
    const { pub, priv } = table(4);
    const lead = pub.turn;
    tlPlay(pub, priv, lead, [THREE_SPADES], 1);
    for (let k = 0; k < 3; k++) tlPass(pub, pub.turn, 2 + k);
    expect(pub.turn).toBe(lead);
    expect(pub.table).toBeNull();
    expect(pub.passed).toEqual([false, false, false, false]);
  });
  it('a passed player stays out until the round resets', () => {
    const { pub, priv } = table(3);
    const a = pub.turn;
    const first = priv.hands[a].includes(THREE_SPADES) ? THREE_SPADES : priv.hands[a][0];
    tlPlay(pub, priv, a, [first], 1);
    const b = pub.turn;
    tlPass(pub, b, 2);
    const c2 = pub.turn;
    expect(c2).not.toBe(b);
    // c plays its highest single if it beats, else passes
    const top = priv.hands[c2][priv.hands[c2].length - 1];
    tlPlay(pub, priv, c2, [top], 3);
    expect(pub.turn).toBe(a); // b is skipped
  });
  it('timeouts auto-play the lowest card when leading and pass otherwise', () => {
    const { pub, priv } = table(4);
    const lead = pub.turn;
    expect(tlAdvance(pub, priv, pub.deadline! - 1)).toBe(false);
    expect(tlAdvance(pub, priv, pub.deadline!)).toBe(true);
    expect(pub.table?.cards).toEqual([THREE_SPADES]);
    const nxt = pub.turn;
    tlAdvance(pub, priv, pub.deadline!);
    expect(pub.passed[nxt]).toBe(true);
    void lead;
  });
  it('random full games always finish with consistent places and zero-sum points', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const players = 2 + (seed % 3);
      const { pub, priv } = table(players, seed * 13);
      let now = 0;
      let guard = 0;
      while (pub.status === 'playing' && guard++ < 2000) {
        now += TURN_MS;
        // simple bot: try the smallest single that beats, else pass / play lowest
        const seat = pub.turn;
        const hand = priv.hands[seat];
        const prev = pub.table ? classify(pub.table.cards) : null;
        const mustThree = pub.firstGame && pub.lastPlays.length === 0 && hand.includes(THREE_SPADES);
        let played = false;
        if (!prev) {
          tlPlay(pub, priv, seat, [mustThree ? THREE_SPADES : hand[0]], now);
          played = true;
        } else if (prev.type === 'single') {
          const card = hand.find((x) => beats(prev, classify([x])!));
          if (card !== undefined) { tlPlay(pub, priv, seat, [card], now); played = true; }
        }
        if (!played) tlPass(pub, seat, now);
      }
      expect(pub.status).toBe('finished');
      expect(new Set(pub.finished).size).toBe(players);
      expect(pub.deltas!.reduce((a, b) => a + b, 0)).toBe(0);
      expect(pub.deltas![pub.finished[0]]).toBe(placePoints(players)[0]);
    }
  });
  it('winner of the previous game leads the next one', () => {
    const { pub, priv } = table(2);
    pub.status = 'finished';
    pub.leader = 1;
    pub.firstGame = false;
    tlStart(pub, priv, 0, 999);
    if (!pub.instant) expect(pub.turn).toBe(1);
  });
  it('ready check needs every seated player', () => {
    const t = createTienLen({ id: 'a', name: 'A' }, 0);
    tlJoin(t.pub, { id: 'b', name: 'B' });
    expect(tlSetReady(t.pub, 0, true)).toBe(false);
    expect(tlSetReady(t.pub, 1, true)).toBe(true);
    expect(() => tlJoin(t.pub, { id: 'c', name: 'C' })).not.toThrow();
    tlJoin(t.pub, { id: 'd', name: 'D' });
    expect(() => tlJoin(t.pub, { id: 'e', name: 'E' })).toThrow('đủ 4');
  });
  it('leaving mid-game ends it when one player remains', () => {
    const { pub, priv } = table(2);
    const other = pub.turn === 0 ? 1 : 0;
    tlLeave(pub, priv, other, 10);
    expect(pub.status).toBe('finished');
    expect(pub.seats[other]).toBeNull();
  });
});

describe('casino: provably fair helpers', () => {
  it('sha256 and hmac produce hex digests', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hmacHex('key', 'The quick brown fox jumps over the lazy dog')).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });
  it('intsFromHex stays in range and is deterministic', () => {
    const h = 'f'.repeat(64);
    const a = intsFromHex(h + '0123456789abcdef', 6, 50);
    expect(a.every((v) => v >= 0 && v < 6)).toBe(true);
    expect(intsFromHex(h, 37, 5)).toEqual(intsFromHex(h, 37, 5));
  });
  it('sic bo dice are uniform-ish over many rounds', async () => {
    const counts = new Array(7).fill(0);
    for (let r = 0; r < 3000; r++) for (const d of await sicboResult('seed-x', r)) counts[d]++;
    for (let f = 1; f <= 6; f++) expect(counts[f] / 9000).toBeGreaterThan(0.15);
  });
  it('roulette results cover 0..36', async () => {
    const seen = new Set<number>();
    for (let r = 0; r < 2000; r++) seen.add(await rouletteResult('seed-y', r));
    expect(seen.size).toBe(37);
  });
  it('crash points follow P(x >= m) ≈ 0.99/m', async () => {
    const pts: number[] = [];
    for (let r = 0; r < 5000; r++) pts.push(await crashPoint('seed-z', r));
    expect(Math.min(...pts)).toBeGreaterThanOrEqual(1);
    const p2 = pts.filter((x) => x >= 2).length / pts.length;
    expect(p2).toBeGreaterThan(0.45);
    expect(p2).toBeLessThan(0.54);
  });
  it('crash multiplier curve is monotonic and invertible', () => {
    expect(crashMultiplierAt(0)).toBe(1);
    let last = 1;
    for (let t = 0; t < 60_000; t += 500) {
      const m = crashMultiplierAt(t);
      expect(m).toBeGreaterThanOrEqual(last);
      last = m;
    }
    expect(crashMultiplierAt(crashTimeFor(2) + 1)).toBeGreaterThanOrEqual(2);
  });
});

describe('casino: sic bo payouts', () => {
  it.each([
    ['small', [1, 2, 3], 100, 200],
    ['small', [2, 2, 2], 100, 0], // triples lose big/small
    ['big', [6, 5, 1], 100, 200],
    ['big', [1, 1, 2], 100, 0],
    ['odd', [1, 2, 4], 10, 20],
    ['even', [3, 3, 3], 10, 0],
    ['anytriple', [4, 4, 4], 10, 310],
    ['triple:4', [4, 4, 4], 10, 1810],
    ['triple:4', [5, 5, 5], 10, 0],
    ['double:3', [3, 3, 1], 10, 110],
    ['double:3', [3, 3, 3], 10, 110],
    ['total:4', [1, 1, 2], 10, 610],
    ['total:10', [3, 3, 4], 10, 70],
    ['combo:1-6', [6, 3, 1], 10, 60],
    ['combo:1-6', [1, 1, 2], 10, 0],
    ['single:5', [5, 2, 1], 10, 20],
    ['single:5', [5, 5, 1], 10, 30],
    ['single:5', [5, 5, 5], 10, 40],
    ['single:5', [1, 2, 3], 10, 0],
  ])('%s on %j stake %i returns %i', (key, dice, stake, ret) => {
    expect(sicboPayout(key as string, stake as number, dice as number[])).toBe(ret);
  });
  it('validates bet keys', () => {
    for (const k of ['small', 'big', 'triple:6', 'double:1', 'total:17', 'combo:2-5', 'single:3']) expect(isSicboBet(k)).toBe(true);
    for (const k of ['total:3', 'total:18', 'combo:5-2', 'combo:3-3', 'triple:7', 'huge', '']) expect(isSicboBet(k)).toBe(false);
  });
});

describe('casino: roulette', () => {
  it('has the right number of each bet type', () => {
    const count = (p: string) => [...ROULETTE_BETS.keys()].filter((k) => k.startsWith(p)).length;
    expect(count('n:')).toBe(37);
    expect(count('split:')).toBe(57 + 3);
    expect(count('street:')).toBe(12 + 2);
    expect(count('corner:')).toBe(22 + 1);
    expect(count('line:')).toBe(11);
  });
  it('wheel contains every number once and colours are 18/18', () => {
    expect([...WHEEL].sort((a, b) => a - b)).toEqual([...Array(37).keys()]);
    expect(RED.size).toBe(18);
  });
  it.each([
    ['n:17', 17, 10, 360],
    ['n:17', 18, 10, 0],
    ['split:17-18', 18, 10, 180],
    ['street:16', 17, 10, 120],
    ['corner:17', 21, 10, 90],
    ['line:16', 21, 10, 60],
    ['dozen:2', 13, 10, 30],
    ['col:1', 34, 10, 30],
    ['red', 1, 10, 20],
    ['red', 0, 10, 0],
    ['black', 2, 10, 20],
    ['even', 0, 10, 0],
    ['low', 18, 10, 20],
    ['high', 19, 10, 20],
    ['nonsense', 5, 10, 0],
  ])('%s on %i stake %i returns %i', (key, n, stake, ret) => {
    expect(roulettePayout(key as string, stake as number, n as number)).toBe(ret);
  });
  it('every bet has a house edge of exactly 1/37', () => {
    for (const [key] of ROULETTE_BETS) {
      let total = 0;
      for (let n = 0; n <= 36; n++) total += roulettePayout(key, 1, n);
      expect(total).toBe(36); // returns 36 over 37 spins for a 1-unit stake
    }
  });
});

describe('casino: bet validation', () => {
  it('merges duplicates and enforces limits', () => {
    expect(validateBets('sicbo', [{ key: 'big', amount: 100 }, { key: 'big', amount: 50 }])).toEqual([{ key: 'big', amount: 150 }]);
    expect(() => validateBets('sicbo', [])).toThrow();
    expect(() => validateBets('sicbo', [{ key: 'big', amount: 5 }])).toThrow();
    expect(() => validateBets('sicbo', [{ key: 'big', amount: 10.5 }])).toThrow();
    expect(() => validateBets('sicbo', [{ key: 'nope', amount: 100 }])).toThrow();
    expect(() => validateBets('roulette', [{ key: 'split:1-5', amount: 100 }])).toThrow();
    expect(() => validateBets('crash', [{ key: 'crash', amount: 100 }])).not.toThrow();
    expect(() => validateBets('sicbo', 'x' as never)).toThrow();
  });
});
