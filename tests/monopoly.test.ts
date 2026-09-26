import { describe, expect, it } from 'vitest';
import {
  BOARD, CHANCE, CHEST, createMonopoly, GO_SALARY, GROUPS, JAIL, JAIL_FINE, monoAdvance, monoBankrupt, monoBuild, monoBuy,
  monoEndTurn, monoJoin, monoLeave, monoMortgage, monoPayDebt, monoPayJail, monoProposeTrade, monoRespondTrade, monoRoll,
  monoSellHouse, monoStart, monoUnmortgage, netWorth, OWNABLE, rentFor, STATIONS, TURN_MS, UTILS, validateMonopolySettings,
  type Dice, type MonopolyPrivate, type MonopolyPublic,
} from '@shared/monopoly.ts';
import { mulberry32 } from '@shared/rng.ts';

const fixed = (...rolls: [number, number][]): Dice => {
  let i = 0;
  return () => rolls[Math.min(i++, rolls.length - 1)];
};

function game(n = 2, money = 1500): { s: MonopolyPublic; priv: MonopolyPrivate } {
  const s = createMonopoly(validateMonopolySettings({ startMoney: money, timeLimitMin: 0 }), { id: 'p0', name: 'P0' }, 0);
  for (let i = 1; i < n; i++) monoJoin(s, { id: `p${i}`, name: `P${i}` });
  const priv: MonopolyPrivate = { chance: [], chest: [] };
  monoStart(s, priv, 'p0', 0, 1);
  // undo the random seating for predictable tests
  s.players.sort((a, b) => a.id.localeCompare(b.id));
  for (const p of s.players) p.money = money;
  s.turn = 0;
  return { s, priv };
}
const give = (s: MonopolyPublic, player: number, squares: number[]) => squares.forEach((q) => (s.props[q].owner = player));

describe('board', () => {
  it('has 40 squares, 28 ownable, 8 colour groups', () => {
    expect(BOARD).toHaveLength(40);
    expect(OWNABLE).toHaveLength(28);
    expect(Object.keys(GROUPS)).toHaveLength(8);
    expect(STATIONS).toEqual([5, 15, 25, 35]);
    expect(UTILS).toEqual([12, 28]);
    expect(BOARD[JAIL].kind).toBe('jail');
    expect(BOARD[30].kind).toBe('gotojail');
    expect(CHANCE).toHaveLength(16);
    expect(CHEST).toHaveLength(16);
  });
  it('rent tables are increasing', () => {
    for (const sq of BOARD) if (sq.rents) for (let i = 1; i < 6; i++) expect(sq.rents[i]).toBeGreaterThan(sq.rents[i - 1]);
  });
});

describe('lobby', () => {
  it('2-6 players, host starts', () => {
    const s = createMonopoly(validateMonopolySettings({}), { id: 'h', name: 'H' }, 0);
    const priv: MonopolyPrivate = { chance: [], chest: [] };
    expect(() => monoStart(s, priv, 'h', 0, 1)).toThrow('2 người');
    for (let i = 0; i < 5; i++) monoJoin(s, { id: `u${i}`, name: `U${i}` });
    expect(() => monoJoin(s, { id: 'x', name: 'X' })).toThrow('6 người');
    expect(() => monoStart(s, priv, 'u0', 0, 1)).toThrow('chủ phòng');
    monoStart(s, priv, 'h', 0, 1);
    expect(s.status).toBe('playing');
    expect(new Set(s.players.map((p) => p.color)).size).toBe(6);
    expect(priv.chance).toHaveLength(16);
  });
  it('settings are validated', () => {
    expect(validateMonopolySettings({ startMoney: 7, timeLimitMin: 999 })).toEqual({ startMoney: 1500, timeLimitMin: 60 });
  });
});

describe('moving', () => {
  it('rolls, moves and offers to buy an unowned property', () => {
    const { s, priv } = game();
    monoRoll(s, priv, 0, fixed([1, 2]), 1); // -> 3 Bạc Liêu
    expect(s.players[0].pos).toBe(3);
    expect(s.phase).toBe('buy');
    monoBuy(s, 0, true);
    expect(s.props[3].owner).toBe(0);
    expect(s.players[0].money).toBe(1500 - 60);
    expect(s.phase).toBe('end');
  });
  it('only the current player can act', () => {
    const { s, priv } = game();
    expect(() => monoRoll(s, priv, 1, fixed([1, 2]), 1)).toThrow('lượt');
    monoRoll(s, priv, 0, fixed([1, 2]), 1);
    expect(() => monoRoll(s, priv, 0, fixed([1, 2]), 1)).toThrow();
    expect(() => monoEndTurn(s, 0, 1)).toThrow(); // must decide on the purchase first
  });
  it('passing GO pays the salary', () => {
    const { s, priv } = game();
    s.players[0].pos = 38;
    monoRoll(s, priv, 0, fixed([2, 3]), 1); // -> 3
    expect(s.players[0].money).toBe(1500 + GO_SALARY);
  });
  it('doubles roll again; three doubles go to jail', () => {
    const { s, priv } = game();
    monoRoll(s, priv, 0, fixed([2, 2]), 1); // -> 4 tax
    expect(s.phase).toBe('roll');
    monoRoll(s, priv, 0, fixed([3, 3]), 2); // -> 10 visiting jail
    expect(s.phase).toBe('roll');
    monoRoll(s, priv, 0, fixed([1, 1]), 3);
    expect(s.players[0].inJail).toBe(true);
    expect(s.players[0].pos).toBe(JAIL);
    expect(s.phase).toBe('end');
  });
  it('declining a purchase leaves it with the bank', () => {
    const { s, priv } = game();
    monoRoll(s, priv, 0, fixed([3, 3]), 1); // -> 6 Cần Thơ, double
    monoBuy(s, 0, false);
    expect(s.props[6].owner).toBe(-1);
    expect(s.phase).toBe('roll'); // doubles => roll again
  });
  it('go to jail square', () => {
    const { s, priv } = game();
    s.players[0].pos = 25;
    monoRoll(s, priv, 0, fixed([2, 3]), 1);
    expect(s.players[0].inJail).toBe(true);
    expect(s.players[0].money).toBe(1500); // no GO salary
  });
  it('taxes are paid to the bank', () => {
    const { s, priv } = game();
    monoRoll(s, priv, 0, fixed([1, 3]), 1);
    expect(s.players[0].money).toBe(1300);
  });
});

describe('jail', () => {
  it('leaves on a double without an extra roll', () => {
    const { s, priv } = game();
    Object.assign(s.players[0], { pos: JAIL, inJail: true });
    monoRoll(s, priv, 0, fixed([2, 2]), 1);
    expect(s.players[0].inJail).toBe(false);
    expect(s.players[0].pos).toBe(14);
    expect(['buy', 'end']).toContain(s.phase);
  });
  it('stays for up to 3 turns then pays the fine and moves', () => {
    const { s, priv } = game();
    Object.assign(s.players[0], { pos: JAIL, inJail: true });
    for (let k = 0; k < 2; k++) {
      s.turn = 0; s.phase = 'roll';
      monoRoll(s, priv, 0, fixed([1, 2]), 1);
      expect(s.players[0].inJail).toBe(true);
    }
    s.turn = 0; s.phase = 'roll';
    monoRoll(s, priv, 0, fixed([1, 2]), 1);
    expect(s.players[0].inJail).toBe(false);
    expect(s.players[0].money).toBe(1500 - JAIL_FINE);
    expect(s.players[0].pos).toBe(13);
  });
  it('can pay or use a card before rolling', () => {
    const { s } = game();
    Object.assign(s.players[0], { pos: JAIL, inJail: true, jailCards: 1 });
    monoPayJail(s, 0, true);
    expect(s.players[0].inJail).toBe(false);
    expect(s.players[0].jailCards).toBe(0);
    Object.assign(s.players[0], { inJail: true });
    monoPayJail(s, 0, false);
    expect(s.players[0].money).toBe(1450);
    expect(() => monoPayJail(s, 0, false)).toThrow('không ở trong tù');
  });
});

describe('rent', () => {
  it('base, colour set double, houses and hotels', () => {
    const { s } = game();
    give(s, 1, [1]);
    expect(rentFor(s, 1, 7)).toBe(2);
    give(s, 1, [3]);
    expect(rentFor(s, 1, 7)).toBe(4);
    s.props[1].houses = 3;
    expect(rentFor(s, 1, 7)).toBe(90);
    s.props[1].houses = 5;
    expect(rentFor(s, 1, 7)).toBe(250);
    s.props[3].mortgaged = true;
    expect(rentFor(s, 3, 7)).toBe(0);
  });
  it('stations 25/50/100/200 and utilities 4x/10x', () => {
    const { s } = game();
    give(s, 1, [5]);
    expect(rentFor(s, 5, 7)).toBe(25);
    give(s, 1, [15, 25, 35]);
    expect(rentFor(s, 5, 7)).toBe(200);
    expect(rentFor(s, 5, 7, 2)).toBe(400);
    give(s, 1, [12]);
    expect(rentFor(s, 12, 7)).toBe(28);
    give(s, 1, [28]);
    expect(rentFor(s, 12, 7)).toBe(70);
  });
  it('landing on an owned property transfers rent', () => {
    const { s, priv } = game();
    give(s, 1, [6]);
    monoRoll(s, priv, 0, fixed([2, 4]), 1);
    expect(s.players[0].money).toBe(1494);
    expect(s.players[1].money).toBe(1506);
  });
});

describe('building', () => {
  it('needs the full group, builds evenly, hotel after 4 houses', () => {
    const { s } = game(2, 5000);
    s.phase = 'end';
    give(s, 0, [1]);
    expect(() => monoBuild(s, 0, 1)).toThrow('cả nhóm');
    give(s, 0, [3]);
    monoBuild(s, 0, 1);
    expect(() => monoBuild(s, 0, 1)).toThrow('đều');
    monoBuild(s, 0, 3);
    for (let k = 0; k < 3; k++) { monoBuild(s, 0, 1); monoBuild(s, 0, 3); }
    monoBuild(s, 0, 1);
    expect(s.props[1].houses).toBe(5);
    expect(() => monoBuild(s, 0, 1)).toThrow('khách sạn');
    expect(s.players[0].money).toBe(5000 - 9 * 50);
  });
  it('selling is even and refunds half', () => {
    const { s } = game(2, 5000);
    s.phase = 'end';
    give(s, 0, [1, 3]);
    monoBuild(s, 0, 1); monoBuild(s, 0, 3); monoBuild(s, 0, 1);
    expect(() => monoSellHouse(s, 0, 3)).toThrow('đều');
    monoSellHouse(s, 0, 1);
    expect(s.players[0].money).toBe(5000 - 150 + 25);
  });
  it('mortgage requires no houses in the group; unmortgage costs 110%', () => {
    const { s } = game(2, 5000);
    s.phase = 'end';
    give(s, 0, [1, 3]);
    monoBuild(s, 0, 1);
    expect(() => monoMortgage(s, 0, 3)).toThrow('Bán hết nhà');
    monoSellHouse(s, 0, 1);
    monoMortgage(s, 0, 3);
    expect(() => monoBuild(s, 0, 1)).toThrow('cầm cố');
    const before = s.players[0].money;
    monoUnmortgage(s, 0, 3);
    expect(before - s.players[0].money).toBe(33);
  });
  it('cannot manage properties on someone else\'s turn', () => {
    const { s } = game(2, 5000);
    give(s, 1, [1, 3]);
    expect(() => monoBuild(s, 1, 1)).toThrow('lượt');
  });
});

describe('debt and bankruptcy', () => {
  it('unaffordable rent creates a debt that can be paid after raising money', () => {
    const { s, priv } = game();
    give(s, 1, [39]);
    s.props[39].houses = 5; // 2000 rent
    give(s, 0, [1, 3]);
    s.players[0].pos = 35;
    monoRoll(s, priv, 0, fixed([2, 2]), 1);
    expect(s.phase).toBe('debt');
    expect(s.players[0].money).toBe(0);
    expect(s.players[1].money).toBe(3000);
    expect(s.debt!.amount).toBe(500);
    expect(() => monoPayDebt(s, 0)).toThrow('Chưa đủ');
    monoMortgage(s, 0, 1);
    monoMortgage(s, 0, 3);
    expect(() => monoPayDebt(s, 0)).toThrow();
    monoBankrupt(s, 0, 2);
    expect(s.status).toBe('finished');
    expect(s.winner).toBe(1);
    expect(s.props[1].owner).toBe(1); // assets go to the creditor
    expect(s.players[1].money).toBe(3000 + 60);
  });
  it('bankrupt to the bank returns properties unowned', () => {
    const { s } = game(3);
    give(s, 0, [1, 3]);
    s.props[1].mortgaged = true;
    monoBankrupt(s, 0, 1);
    expect(s.props[1]).toEqual({ owner: -1, houses: 0, mortgaged: false });
    expect(s.status).toBe('playing');
    expect(s.turn).toBe(1);
  });
  it('leaving mid-game is a bankruptcy', () => {
    const { s } = game(3);
    monoLeave(s, 'p2', 1);
    expect(s.players[2].bankrupt).toBe(true);
    expect(s.turn).toBe(0);
  });
});

describe('cards', () => {
  it('chance: advance to GO collects the salary', () => {
    const { s, priv } = game();
    priv.chance = [0, ...priv.chance.filter((x) => x !== 0)];
    s.players[0].pos = 4;
    monoRoll(s, priv, 0, fixed([1, 2]), 1); // -> 7 chance
    expect(s.players[0].pos).toBe(0);
    expect(s.players[0].money).toBe(1700);
    expect(s.card?.deck).toBe('chance');
  });
  it('chest: birthday collects from each player', () => {
    const { s, priv } = game(3);
    priv.chest = [8, ...priv.chest.filter((x) => x !== 8)];
    monoRoll(s, priv, 0, fixed([1, 1]), 1); // -> 2 chest
    expect(s.players[0].money).toBe(1520);
    expect(s.players[1].money).toBe(1490);
  });
  it('chance: nearest station pays double rent', () => {
    const { s, priv } = game();
    priv.chance = [4, ...priv.chance.filter((x) => x !== 4)];
    give(s, 1, [15]);
    s.players[0].pos = 4;
    monoRoll(s, priv, 0, fixed([1, 2]), 1); // 7 -> nearest station 15
    expect(s.players[0].pos).toBe(15);
    expect(s.players[1].money).toBe(1550);
  });
  it('chance: go back 3 and jail card', () => {
    const { s, priv } = game();
    priv.chance = [9, 8, ...priv.chance.filter((x) => x !== 9 && x !== 8)];
    s.players[0].pos = 4;
    monoRoll(s, priv, 0, fixed([1, 2]), 1); // 7 -> back 3 -> 4 tax
    expect(s.players[0].pos).toBe(4);
    expect(s.players[0].money).toBe(1300);
    s.turn = 0; s.phase = 'roll';
    s.players[0].pos = 19;
    monoRoll(s, priv, 0, fixed([1, 2]), 2); // 22 chance -> jail card
    expect(s.players[0].jailCards).toBe(1);
  });
  it('repairs charge per house and hotel', () => {
    const { s, priv } = game(2, 5000);
    priv.chance = [11, ...priv.chance.filter((x) => x !== 11)];
    give(s, 0, [1, 3]);
    s.props[1].houses = 2; s.props[3].houses = 5;
    s.players[0].pos = 4;
    monoRoll(s, priv, 0, fixed([1, 2]), 1);
    expect(s.players[0].money).toBe(5000 - 50 - 100);
  });
});

describe('trading', () => {
  it('propose and accept swaps properties and money', () => {
    const { s } = game();
    give(s, 0, [1]);
    give(s, 1, [3]);
    monoProposeTrade(s, 0, { to: 1, giveProps: [1], giveMoney: 100, getProps: [3], getMoney: 0 });
    expect(() => monoRespondTrade(s, 2, true)).toThrow();
    monoRespondTrade(s, 1, true);
    expect(s.props[1].owner).toBe(1);
    expect(s.props[3].owner).toBe(0);
    expect(s.players[0].money).toBe(1400);
    expect(s.players[1].money).toBe(1600);
  });
  it('rejects trades of unowned or built-on properties and empty offers', () => {
    const { s } = game(2, 5000);
    give(s, 0, [1, 3]);
    s.phase = 'end';
    expect(() => monoProposeTrade(s, 0, { to: 1, giveProps: [6] })).toThrow();
    expect(() => monoProposeTrade(s, 0, { to: 1 })).toThrow('trống');
    expect(() => monoProposeTrade(s, 0, { to: 0, giveMoney: 5 })).toThrow();
    monoBuild(s, 0, 1);
    expect(() => monoProposeTrade(s, 0, { to: 1, giveProps: [3] })).toThrow('bán hết nhà');
  });
  it('decline clears the offer', () => {
    const { s } = game();
    monoProposeTrade(s, 0, { to: 1, giveMoney: 10 });
    monoRespondTrade(s, 1, false);
    expect(s.trade).toBeNull();
  });
});

describe('turns and time', () => {
  it('end turn passes to the next non-bankrupt player', () => {
    const { s, priv } = game(3);
    s.players[1].bankrupt = true;
    monoRoll(s, priv, 0, fixed([1, 3]), 1);
    monoEndTurn(s, 0, 2);
    expect(s.turn).toBe(2);
  });
  it('timeouts auto-play and mark the player AFK', () => {
    const { s, priv } = game();
    const d = fixed([1, 2]);
    expect(monoAdvance(s, priv, s.deadline! - 1, d)).toBe(false);
    monoAdvance(s, priv, s.deadline!, d); // auto roll -> buy phase
    expect(s.players[0].afk).toBe(true);
    expect(s.phase).toBe('buy');
    monoAdvance(s, priv, s.deadline!, d); // auto decline
    monoAdvance(s, priv, s.deadline!, d); // auto end turn
    expect(s.turn).toBe(1);
    expect(s.props[3].owner).toBe(-1);
  });
  it('time limit ends the game at the next end of turn, richest wins', () => {
    const s0 = createMonopoly(validateMonopolySettings({ timeLimitMin: 30 }), { id: 'p0', name: 'P0' }, 0);
    monoJoin(s0, { id: 'p1', name: 'P1' });
    const priv: MonopolyPrivate = { chance: [], chest: [] };
    monoStart(s0, priv, 'p0', 0, 1);
    const rich = s0.turn === 0 ? 1 : 0;
    s0.players[rich].money = 99_999;
    monoRoll(s0, priv, s0.turn, fixed([1, 3]), 1);
    monoEndTurn(s0, s0.turn, 30 * 60_000);
    expect(s0.status).toBe('finished');
    expect(s0.winner).toBe(rich);
  });
  it('fuzz: random games stay consistent', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { s, priv } = game(2 + (seed % 5));
      const rng = mulberry32(seed);
      const dice: Dice = () => [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
      let now = 0;
      for (let step = 0; step < 1500 && s.status === 'playing'; step++) {
        now += 1000;
        const p = s.turn;
        try {
          if (s.phase === 'roll') monoRoll(s, priv, p, dice, now);
          else if (s.phase === 'buy') monoBuy(s, p, rng() < 0.7 && s.players[p].money >= BOARD[s.players[p].pos].price!);
          else if (s.phase === 'end') {
            const own = OWNABLE.find((q) => s.props[q].owner === p && BOARD[q].group);
            if (own !== undefined && rng() < 0.3) { try { monoBuild(s, p, own); } catch { /* not allowed */ } }
            monoEndTurn(s, p, now);
          } else if (s.phase === 'debt') {
            const m = OWNABLE.find((q) => s.props[q].owner === p && !s.props[q].mortgaged && s.props[q].houses === 0 && !(BOARD[q].group && GROUPS[BOARD[q].group!].some((x) => s.props[x].houses > 0)));
            const h = OWNABLE.find((q) => s.props[q].owner === p && s.props[q].houses > 0);
            if (s.players[p].money >= s.debt!.amount) monoPayDebt(s, p);
            else if (h !== undefined) { try { monoSellHouse(s, p, h); } catch { monoBankrupt(s, p, now); } }
            else if (m !== undefined) monoMortgage(s, p, m);
            else monoBankrupt(s, p, now);
          }
        } catch (e) {
          throw new Error(`seed ${seed} step ${step} phase ${s.phase}: ${(e as Error).message}`);
        }
        for (const pl of s.players) {
          if (!pl.bankrupt && s.phase !== 'debt' && pl.money < 0) throw new Error(`negative money seed ${seed}`);
          if (pl.pos < 0 || pl.pos > 39) throw new Error('bad position');
        }
        for (const q of OWNABLE) {
          const ps = s.props[q];
          if (ps.owner >= 0 && s.players[ps.owner].bankrupt) throw new Error('bankrupt owner');
          if (ps.houses < 0 || ps.houses > 5) throw new Error('bad houses');
        }
        void netWorth; void TURN_MS;
      }
    }
  });
});
