// Cờ tỉ phú — an original property-trading board game with Vietnamese places.
// Server-authoritative. All randomness goes through an injected dice function, so tests are deterministic.
import { mulberry32, shuffle } from './rng.ts';

export type SquareKind = 'go' | 'prop' | 'station' | 'util' | 'chance' | 'chest' | 'tax' | 'jail' | 'parking' | 'gotojail';
export interface Square {
  kind: SquareKind;
  name: string;
  price?: number;
  group?: string; // colour group for properties
  rents?: number[]; // [base, 1 house, 2, 3, 4, hotel]
  house?: number; // cost of one house in the group
  tax?: number;
}

const P = (name: string, group: string, price: number, rents: number[], house: number): Square =>
  ({ kind: 'prop', name, group, price, rents, house });
const S = (name: string): Square => ({ kind: 'station', name, price: 200 });
const U = (name: string): Square => ({ kind: 'util', name, price: 150 });

export const BOARD: Square[] = [
  { kind: 'go', name: 'Xuất phát' },
  P('Cà Mau', 'brown', 60, [2, 10, 30, 90, 160, 250], 50),
  { kind: 'chest', name: 'Khí vận' },
  P('Bạc Liêu', 'brown', 60, [4, 20, 60, 180, 320, 450], 50),
  { kind: 'tax', name: 'Thuế thu nhập', tax: 200 },
  S('Bến xe Miền Đông'),
  P('Cần Thơ', 'lightblue', 100, [6, 30, 90, 270, 400, 550], 50),
  { kind: 'chance', name: 'Cơ hội' },
  P('Vĩnh Long', 'lightblue', 100, [6, 30, 90, 270, 400, 550], 50),
  P('An Giang', 'lightblue', 120, [8, 40, 100, 300, 450, 600], 50),
  { kind: 'jail', name: 'Nhà tù / Thăm tù' },
  P('Phan Thiết', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
  U('Công ty Điện lực'),
  P('Quy Nhơn', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
  P('Nha Trang', 'pink', 160, [12, 60, 180, 500, 700, 900], 100),
  S('Ga Đà Nẵng'),
  P('Buôn Ma Thuột', 'orange', 180, [14, 70, 200, 550, 750, 950], 100),
  { kind: 'chest', name: 'Khí vận' },
  P('Pleiku', 'orange', 180, [14, 70, 200, 550, 750, 950], 100),
  P('Đà Lạt', 'orange', 200, [16, 80, 220, 600, 800, 1000], 100),
  { kind: 'parking', name: 'Bãi đỗ xe miễn phí' },
  P('Huế', 'red', 220, [18, 90, 250, 700, 875, 1050], 150),
  { kind: 'chance', name: 'Cơ hội' },
  P('Hội An', 'red', 220, [18, 90, 250, 700, 875, 1050], 150),
  P('Đà Nẵng', 'red', 240, [20, 100, 300, 750, 925, 1100], 150),
  S('Sân bay Nội Bài'),
  P('Ninh Bình', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
  P('Hải Phòng', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
  U('Công ty Cấp nước'),
  P('Hạ Long', 'yellow', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { kind: 'gotojail', name: 'Vào tù' },
  P('Sa Pa', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200),
  P('Phú Quốc', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200),
  { kind: 'chest', name: 'Khí vận' },
  P('Vũng Tàu', 'green', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  S('Sân bay Tân Sơn Nhất'),
  { kind: 'chance', name: 'Cơ hội' },
  P('Hà Nội', 'darkblue', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { kind: 'tax', name: 'Thuế xa xỉ', tax: 100 },
  P('TP. Hồ Chí Minh', 'darkblue', 400, [50, 200, 600, 1400, 1700, 2000], 200),
];
export const JAIL = 10;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const MAX_PLAYERS = 6;
export const TURN_MS = 60_000;
export const AFK_MS = 5_000;

export const GROUPS: Record<string, number[]> = {};
BOARD.forEach((sq, i) => {
  if (sq.group) (GROUPS[sq.group] ||= []).push(i);
});
export const STATIONS = BOARD.map((s, i) => (s.kind === 'station' ? i : -1)).filter((i) => i >= 0);
export const UTILS = BOARD.map((s, i) => (s.kind === 'util' ? i : -1)).filter((i) => i >= 0);
export const OWNABLE = BOARD.map((s, i) => (s.price ? i : -1)).filter((i) => i >= 0);

// ---------- cards ----------
export type CardEffect =
  | { t: 'move'; to: number }
  | { t: 'back'; n: number }
  | { t: 'nearest'; kind: 'station' | 'util' }
  | { t: 'money'; amount: number }
  | { t: 'each'; amount: number } // + receive from each player, - pay each player
  | { t: 'repairs'; house: number; hotel: number }
  | { t: 'jail' }
  | { t: 'jailcard' };
export interface Card {
  text: string;
  effect: CardEffect;
}
export const CHANCE: Card[] = [
  { text: 'Đi thẳng tới ô Xuất phát, nhận 200.', effect: { t: 'move', to: 0 } },
  { text: 'Bay vào TP. Hồ Chí Minh.', effect: { t: 'move', to: 39 } },
  { text: 'Du lịch Huế. Đi qua Xuất phát thì nhận 200.', effect: { t: 'move', to: 21 } },
  { text: 'Công tác Phan Thiết. Đi qua Xuất phát thì nhận 200.', effect: { t: 'move', to: 11 } },
  { text: 'Tới bến/ga gần nhất. Nếu đã có chủ, trả gấp đôi tiền thuê.', effect: { t: 'nearest', kind: 'station' } },
  { text: 'Tới bến/ga gần nhất. Nếu đã có chủ, trả gấp đôi tiền thuê.', effect: { t: 'nearest', kind: 'station' } },
  { text: 'Tới công ty dịch vụ gần nhất. Nếu đã có chủ, trả 10 lần số xúc xắc.', effect: { t: 'nearest', kind: 'util' } },
  { text: 'Cổ phiếu chia cổ tức, nhận 50.', effect: { t: 'money', amount: 50 } },
  { text: 'Thẻ ra tù miễn phí. Giữ lại dùng khi cần.', effect: { t: 'jailcard' } },
  { text: 'Lùi lại 3 ô.', effect: { t: 'back', n: 3 } },
  { text: 'Bị bắt! Vào tù ngay, không đi qua Xuất phát.', effect: { t: 'jail' } },
  { text: 'Sửa chữa nhà cửa: 25 mỗi nhà, 100 mỗi khách sạn.', effect: { t: 'repairs', house: 25, hotel: 100 } },
  { text: 'Phạt chạy quá tốc độ, nộp 15.', effect: { t: 'money', amount: -15 } },
  { text: 'Về quê bằng xe khách: tới Bến xe Miền Đông. Qua Xuất phát nhận 200.', effect: { t: 'move', to: 5 } },
  { text: 'Được bầu làm trưởng nhóm, trả mỗi người 50.', effect: { t: 'each', amount: -50 } },
  { text: 'Khoản vay xây dựng đáo hạn, nhận 150.', effect: { t: 'money', amount: 150 } },
];
export const CHEST: Card[] = [
  { text: 'Đi thẳng tới ô Xuất phát, nhận 200.', effect: { t: 'move', to: 0 } },
  { text: 'Ngân hàng tính nhầm có lợi cho bạn, nhận 200.', effect: { t: 'money', amount: 200 } },
  { text: 'Tiền khám bệnh, trả 50.', effect: { t: 'money', amount: -50 } },
  { text: 'Bán cổ phiếu, nhận 50.', effect: { t: 'money', amount: 50 } },
  { text: 'Thẻ ra tù miễn phí. Giữ lại dùng khi cần.', effect: { t: 'jailcard' } },
  { text: 'Bị bắt! Vào tù ngay, không đi qua Xuất phát.', effect: { t: 'jail' } },
  { text: 'Quỹ du lịch đáo hạn, nhận 100.', effect: { t: 'money', amount: 100 } },
  { text: 'Hoàn thuế thu nhập, nhận 20.', effect: { t: 'money', amount: 20 } },
  { text: 'Sinh nhật bạn! Mỗi người tặng bạn 10.', effect: { t: 'each', amount: 10 } },
  { text: 'Bảo hiểm nhân thọ đáo hạn, nhận 100.', effect: { t: 'money', amount: 100 } },
  { text: 'Viện phí, trả 100.', effect: { t: 'money', amount: -100 } },
  { text: 'Học phí, trả 50.', effect: { t: 'money', amount: -50 } },
  { text: 'Phí tư vấn, nhận 25.', effect: { t: 'money', amount: 25 } },
  { text: 'Sửa đường trước nhà: 40 mỗi nhà, 115 mỗi khách sạn.', effect: { t: 'repairs', house: 40, hotel: 115 } },
  { text: 'Giải nhì cuộc thi sắc đẹp, nhận 10.', effect: { t: 'money', amount: 10 } },
  { text: 'Nhận thừa kế, nhận 100.', effect: { t: 'money', amount: 100 } },
];

// ---------- state ----------
export interface MPlayer {
  id: string;
  name: string;
  money: number;
  pos: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
  color: number;
  afk?: boolean; // timed out; the server plays their turns quickly until they act again
}
export interface PropState {
  owner: number; // player index, -1 = bank
  houses: number; // 5 = hotel
  mortgaged: boolean;
}
export interface Trade {
  from: number;
  to: number;
  giveProps: number[];
  giveMoney: number;
  getProps: number[];
  getMoney: number;
}
export type Phase = 'roll' | 'buy' | 'end' | 'debt';
export interface MonopolySettings {
  startMoney: number;
  timeLimitMin: number; // 0 = unlimited
}
export interface MonopolyPublic {
  kind: 'monopoly';
  game: 'monopoly';
  settings: MonopolySettings;
  status: 'waiting' | 'playing' | 'finished';
  host: string;
  players: MPlayer[];
  props: Record<number, PropState>;
  turn: number;
  phase: Phase;
  dice: [number, number] | null;
  doubles: number;
  deadline: number | null;
  debt: { amount: number; creditor: number; resume: 'roll' | 'end' } | null;
  card: { deck: 'chance' | 'chest'; text: string } | null;
  trade: Trade | null;
  log: string[];
  winner: number | null;
  endsAt: number | null;
  createdAt: number;
}
export interface MonopolyPrivate {
  chance: number[];
  chest: number[];
}

export class MonoError extends Error {}

export function validateMonopolySettings(raw: any): MonopolySettings {
  const startMoney = [1000, 1500, 2000, 3000].includes(raw?.startMoney) ? raw.startMoney : 1500;
  const timeLimitMin = [0, 30, 45, 60, 90].includes(raw?.timeLimitMin) ? raw.timeLimitMin : 60;
  return { startMoney, timeLimitMin };
}

export function createMonopoly(settings: MonopolySettings, host: { id: string; name: string }, now: number): MonopolyPublic {
  return {
    kind: 'monopoly', game: 'monopoly', settings, status: 'waiting', host: host.id,
    players: [newPlayer(host, 0, settings.startMoney)],
    props: Object.fromEntries(OWNABLE.map((i) => [i, { owner: -1, houses: 0, mortgaged: false }])),
    turn: 0, phase: 'roll', dice: null, doubles: 0, deadline: null, debt: null, card: null, trade: null,
    log: [], winner: null, endsAt: null, createdAt: now,
  };
}

function newPlayer(u: { id: string; name: string }, color: number, money: number): MPlayer {
  return { id: u.id, name: u.name, money, pos: 0, inJail: false, jailTurns: 0, jailCards: 0, bankrupt: false, color };
}

export function monoSeatOf(s: MonopolyPublic, userId: string): number {
  return s.players.findIndex((p) => p.id === userId);
}

export function monoJoin(s: MonopolyPublic, u: { id: string; name: string }): void {
  if (monoSeatOf(s, u.id) >= 0) return;
  if (s.status !== 'waiting') throw new MonoError('Ván đã bắt đầu, bạn có thể vào xem');
  if (s.players.length >= MAX_PLAYERS) throw new MonoError('Phòng đã đủ 6 người');
  const used = new Set(s.players.map((p) => p.color));
  const color = [0, 1, 2, 3, 4, 5].find((c) => !used.has(c))!;
  s.players.push(newPlayer(u, color, s.settings.startMoney));
}

export function monoLeaveLobby(s: MonopolyPublic, userId: string): boolean {
  const i = monoSeatOf(s, userId);
  if (i < 0 || s.status !== 'waiting') return false;
  s.players.splice(i, 1);
  if (s.host === userId && s.players.length) s.host = s.players[0].id;
  return s.players.length === 0;
}

export function monoStart(s: MonopolyPublic, priv: MonopolyPrivate, userId: string, now: number, seed: number): void {
  if (s.status !== 'waiting') throw new MonoError('Ván đã bắt đầu');
  if (userId !== s.host) throw new MonoError('Chỉ chủ phòng mới bắt đầu được');
  if (s.players.length < 2) throw new MonoError('Cần ít nhất 2 người');
  const rng = mulberry32(seed);
  shuffle(rng, s.players);
  priv.chance = shuffle(rng, [...CHANCE.keys()]);
  priv.chest = shuffle(rng, [...CHEST.keys()]);
  s.status = 'playing';
  s.turn = 0;
  s.phase = 'roll';
  s.deadline = now + TURN_MS;
  s.endsAt = s.settings.timeLimitMin ? now + s.settings.timeLimitMin * 60_000 : null;
  log(s, `Ván bắt đầu! ${s.players[0].name} đi trước.`);
}

function log(s: MonopolyPublic, msg: string) {
  s.log = [...s.log.slice(-39), msg];
}

// ---------- helpers ----------
export function ownsGroup(s: MonopolyPublic, player: number, group: string): boolean {
  return GROUPS[group].every((i) => s.props[i].owner === player);
}
export function countOwned(s: MonopolyPublic, player: number, list: number[]): number {
  return list.filter((i) => s.props[i].owner === player).length;
}

export function rentFor(s: MonopolyPublic, sq: number, diceTotal: number, mult = 1): number {
  const ps = s.props[sq];
  const def = BOARD[sq];
  if (!ps || ps.owner < 0 || ps.mortgaged) return 0;
  if (def.kind === 'prop') {
    if (ps.houses > 0) return def.rents![ps.houses];
    return def.rents![0] * (ownsGroup(s, ps.owner, def.group!) ? 2 : 1);
  }
  if (def.kind === 'station') return 25 * 2 ** (countOwned(s, ps.owner, STATIONS) - 1) * mult;
  if (def.kind === 'util') {
    const factor = mult > 1 ? 10 : countOwned(s, ps.owner, UTILS) === 2 ? 10 : 4;
    return diceTotal * factor;
  }
  return 0;
}

export function netWorth(s: MonopolyPublic, player: number): number {
  let w = s.players[player].money;
  for (const i of OWNABLE) {
    const ps = s.props[i];
    if (ps.owner !== player) continue;
    w += ps.mortgaged ? BOARD[i].price! / 2 : BOARD[i].price!;
    w += ps.houses * (BOARD[i].house || 0);
  }
  return w;
}

function alive(s: MonopolyPublic): number[] {
  return s.players.map((p, i) => (p.bankrupt ? -1 : i)).filter((i) => i >= 0);
}

/** Charge `amount` to player; unpaid remainder becomes a debt. Returns true if fully paid. */
function charge(s: MonopolyPublic, player: number, amount: number, creditor: number, resume: 'roll' | 'end'): boolean {
  const p = s.players[player];
  const paid = Math.min(amount, Math.max(0, p.money));
  p.money -= paid;
  if (creditor >= 0) s.players[creditor].money += paid;
  if (paid < amount) {
    s.debt = { amount: amount - paid, creditor, resume };
    s.phase = 'debt';
    log(s, `${p.name} thiếu ${amount - paid}, cần bán nhà/cầm cố hoặc phá sản.`);
    return false;
  }
  return true;
}

function sendToJail(s: MonopolyPublic, player: number) {
  const p = s.players[player];
  p.pos = JAIL;
  p.inJail = true;
  p.jailTurns = 0;
  s.doubles = 0;
  s.phase = 'end';
  log(s, `${p.name} vào tù.`);
}

function moveTo(s: MonopolyPublic, player: number, to: number, collectGo: boolean) {
  const p = s.players[player];
  if (collectGo && to < p.pos) {
    p.money += GO_SALARY;
    log(s, `${p.name} đi qua Xuất phát, nhận ${GO_SALARY}.`);
  }
  p.pos = to;
}

// ---------- turn flow ----------
function afterLanding(s: MonopolyPublic, isDouble: boolean) {
  if (s.phase === 'debt' || s.phase === 'buy') return;
  const p = s.players[s.turn];
  s.phase = isDouble && !p.inJail && s.doubles > 0 ? 'roll' : 'end';
}

function land(s: MonopolyPublic, priv: MonopolyPrivate, player: number, diceTotal: number, isDouble: boolean, rentMult = 1) {
  const p = s.players[player];
  const sq = BOARD[p.pos];
  const resume: 'roll' | 'end' = isDouble && s.doubles > 0 ? 'roll' : 'end';
  s.card = null;
  switch (sq.kind) {
    case 'prop':
    case 'station':
    case 'util': {
      const ps = s.props[p.pos];
      if (ps.owner < 0) {
        s.phase = 'buy';
        return;
      }
      if (ps.owner !== player && !ps.mortgaged && !s.players[ps.owner].bankrupt) {
        const rent = rentFor(s, p.pos, diceTotal, rentMult);
        log(s, `${p.name} trả ${rent} tiền thuê ${sq.name} cho ${s.players[ps.owner].name}.`);
        if (!charge(s, player, rent, ps.owner, resume)) return;
      }
      break;
    }
    case 'tax':
      log(s, `${p.name} nộp ${sq.tax} ${sq.name.toLowerCase()}.`);
      if (!charge(s, player, sq.tax!, -1, resume)) return;
      break;
    case 'gotojail':
      sendToJail(s, player);
      return;
    case 'chance':
    case 'chest':
      drawCard(s, priv, player, sq.kind, diceTotal, isDouble);
      return;
  }
  afterLanding(s, isDouble);
}

function drawCard(s: MonopolyPublic, priv: MonopolyPrivate, player: number, deck: 'chance' | 'chest', diceTotal: number, isDouble: boolean) {
  const order = deck === 'chance' ? priv.chance : priv.chest;
  const idx = order.shift()!;
  order.push(idx);
  const card = (deck === 'chance' ? CHANCE : CHEST)[idx];
  const p = s.players[player];
  s.card = { deck, text: card.text };
  log(s, `${p.name} rút thẻ ${deck === 'chance' ? 'Cơ hội' : 'Khí vận'}: ${card.text}`);
  const resume: 'roll' | 'end' = isDouble && s.doubles > 0 ? 'roll' : 'end';
  const e = card.effect;
  switch (e.t) {
    case 'move':
      moveTo(s, player, e.to, true);
      land(s, priv, player, diceTotal, isDouble);
      s.card = { deck, text: card.text };
      return;
    case 'back':
      p.pos = (p.pos - e.n + 40) % 40;
      land(s, priv, player, diceTotal, isDouble);
      s.card = { deck, text: card.text };
      return;
    case 'nearest': {
      const list = e.kind === 'station' ? STATIONS : UTILS;
      const to = list.find((i) => i > p.pos) ?? list[0];
      moveTo(s, player, to, true);
      land(s, priv, player, diceTotal, isDouble, 2);
      s.card = { deck, text: card.text };
      return;
    }
    case 'money':
      if (e.amount >= 0) p.money += e.amount;
      else if (!charge(s, player, -e.amount, -1, resume)) return;
      break;
    case 'each': {
      const others = alive(s).filter((i) => i !== player);
      if (e.amount > 0) {
        // Others pay the drawer; anyone short simply pays what they have (keeps the turn moving).
        for (const o of others) {
          const pay = Math.min(e.amount, Math.max(0, s.players[o].money));
          s.players[o].money -= pay;
          p.money += pay;
        }
      } else {
        const total = -e.amount * others.length;
        if (p.money >= total) {
          for (const o of others) { p.money += e.amount; s.players[o].money -= e.amount; }
        } else if (!charge(s, player, total, -1, resume)) return;
      }
      break;
    }
    case 'repairs': {
      let cost = 0;
      for (const i of OWNABLE) {
        const ps = s.props[i];
        if (ps.owner !== player) continue;
        cost += ps.houses === 5 ? e.hotel : ps.houses * e.house;
      }
      if (cost && !charge(s, player, cost, -1, resume)) return;
      break;
    }
    case 'jail':
      sendToJail(s, player);
      return;
    case 'jailcard':
      p.jailCards++;
      break;
  }
  afterLanding(s, isDouble);
}

function requireTurn(s: MonopolyPublic, player: number, phases: Phase[]) {
  if (s.status !== 'playing') throw new MonoError('Ván chưa bắt đầu');
  if (player !== s.turn) throw new MonoError('Chưa tới lượt bạn');
  if (!phases.includes(s.phase)) throw new MonoError('Không thể làm điều đó lúc này');
}

export type Dice = () => [number, number];

export function monoRoll(s: MonopolyPublic, priv: MonopolyPrivate, player: number, dice: Dice, now: number): void {
  requireTurn(s, player, ['roll']);
  const [a, b] = dice();
  s.dice = [a, b];
  s.card = null;
  const p = s.players[player];
  const isDouble = a === b;
  const total = a + b;
  log(s, `${p.name} đổ được ${a} + ${b} = ${total}${isDouble ? ' (đôi)' : ''}.`);
  s.deadline = now + TURN_MS;

  if (p.inJail) {
    if (isDouble) {
      p.inJail = false;
      p.jailTurns = 0;
      s.doubles = 0; // leaving jail with a double does not grant another roll
      log(s, `${p.name} đổ đôi, ra tù.`);
    } else {
      p.jailTurns++;
      if (p.jailTurns < 3) {
        s.phase = 'end';
        return;
      }
      log(s, `${p.name} ở tù 3 lượt, nộp phạt ${JAIL_FINE}.`);
      p.inJail = false;
      p.jailTurns = 0;
      if (!charge(s, player, JAIL_FINE, -1, 'end')) {
        // Can't afford the fine: move, but the square takes effect only after the debt (simplified).
        moveTo(s, player, (p.pos + total) % 40, true);
        return;
      }
    }
    moveTo(s, player, (p.pos + total) % 40, true);
    land(s, priv, player, total, false);
    return;
  }

  if (isDouble) {
    s.doubles++;
    if (s.doubles >= 3) {
      log(s, `${p.name} đổ đôi 3 lần liên tiếp!`);
      sendToJail(s, player);
      return;
    }
  } else {
    s.doubles = 0;
  }
  moveTo(s, player, (p.pos + total) % 40, true);
  land(s, priv, player, total, isDouble);
}

export function monoPayJail(s: MonopolyPublic, player: number, useCard: boolean): void {
  requireTurn(s, player, ['roll']);
  const p = s.players[player];
  if (!p.inJail) throw new MonoError('Bạn không ở trong tù');
  if (useCard) {
    if (p.jailCards < 1) throw new MonoError('Bạn không có thẻ ra tù');
    p.jailCards--;
  } else {
    if (p.money < JAIL_FINE) throw new MonoError('Không đủ tiền nộp phạt');
    p.money -= JAIL_FINE;
  }
  p.inJail = false;
  p.jailTurns = 0;
  log(s, `${p.name} ${useCard ? 'dùng thẻ' : `nộp ${JAIL_FINE}`} để ra tù.`);
}

export function monoBuy(s: MonopolyPublic, player: number, buy: boolean): void {
  requireTurn(s, player, ['buy']);
  const p = s.players[player];
  const def = BOARD[p.pos];
  if (buy) {
    if (p.money < def.price!) throw new MonoError('Không đủ tiền mua');
    p.money -= def.price!;
    s.props[p.pos].owner = player;
    log(s, `${p.name} mua ${def.name} giá ${def.price}.`);
  } else {
    log(s, `${p.name} không mua ${def.name}.`);
  }
  s.phase = s.doubles > 0 && !p.inJail ? 'roll' : 'end';
}

export function monoEndTurn(s: MonopolyPublic, player: number, now: number): void {
  requireTurn(s, player, ['end']);
  s.trade = null;
  s.card = null;
  if (s.endsAt !== null && now >= s.endsAt) {
    finishByWorth(s);
    return;
  }
  nextPlayer(s, now);
}

function nextPlayer(s: MonopolyPublic, now: number) {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (s.turn + k) % n;
    if (!s.players[i].bankrupt) {
      s.turn = i;
      break;
    }
  }
  s.doubles = 0;
  s.phase = 'roll';
  s.dice = null;
  s.deadline = now + TURN_MS;
}

function finishByWorth(s: MonopolyPublic) {
  const ranked = alive(s).sort((a, b) => netWorth(s, b) - netWorth(s, a));
  s.winner = ranked[0];
  s.status = 'finished';
  s.deadline = null;
  log(s, `Hết giờ! ${s.players[ranked[0]].name} giàu nhất và chiến thắng.`);
}

// ---------- building & mortgage ----------
function requireOwner(s: MonopolyPublic, player: number, sq: number) {
  if (s.status !== 'playing') throw new MonoError('Ván chưa bắt đầu');
  if (player !== s.turn) throw new MonoError('Chỉ được quản lý tài sản trong lượt của mình');
  if (s.phase === 'buy') throw new MonoError('Hãy quyết định mua hay không trước');
  const ps = s.props[sq];
  if (!ps || ps.owner !== player) throw new MonoError('Bạn không sở hữu ô này');
  return ps;
}

export function monoBuild(s: MonopolyPublic, player: number, sq: number): void {
  const ps = requireOwner(s, player, sq);
  const def = BOARD[sq];
  if (def.kind !== 'prop') throw new MonoError('Chỉ xây được trên đất');
  if (s.phase === 'debt') throw new MonoError('Đang nợ, không thể xây');
  if (!ownsGroup(s, player, def.group!)) throw new MonoError('Cần sở hữu cả nhóm màu');
  const group = GROUPS[def.group!];
  if (group.some((i) => s.props[i].mortgaged)) throw new MonoError('Nhóm màu có ô đang cầm cố');
  if (ps.houses >= 5) throw new MonoError('Đã có khách sạn');
  if (ps.houses > Math.min(...group.map((i) => s.props[i].houses))) throw new MonoError('Phải xây đều các ô trong nhóm');
  if (s.players[player].money < def.house!) throw new MonoError('Không đủ tiền xây');
  s.players[player].money -= def.house!;
  ps.houses++;
  log(s, `${s.players[player].name} xây ${ps.houses === 5 ? 'khách sạn' : 'nhà'} ở ${def.name}.`);
}

export function monoSellHouse(s: MonopolyPublic, player: number, sq: number): void {
  const ps = requireOwner(s, player, sq);
  const def = BOARD[sq];
  if (ps.houses === 0) throw new MonoError('Không có nhà để bán');
  const group = GROUPS[def.group!];
  if (ps.houses < Math.max(...group.map((i) => s.props[i].houses))) throw new MonoError('Phải bán đều các ô trong nhóm');
  ps.houses--;
  s.players[player].money += def.house! / 2;
  log(s, `${s.players[player].name} bán một nhà ở ${def.name}.`);
}

export function monoMortgage(s: MonopolyPublic, player: number, sq: number): void {
  const ps = requireOwner(s, player, sq);
  const def = BOARD[sq];
  if (ps.mortgaged) throw new MonoError('Ô này đã cầm cố');
  if (def.group && GROUPS[def.group].some((i) => s.props[i].houses > 0)) throw new MonoError('Bán hết nhà trong nhóm trước');
  ps.mortgaged = true;
  s.players[player].money += def.price! / 2;
  log(s, `${s.players[player].name} cầm cố ${def.name}.`);
}

export function monoUnmortgage(s: MonopolyPublic, player: number, sq: number): void {
  const ps = requireOwner(s, player, sq);
  if (s.phase === 'debt') throw new MonoError('Đang nợ, không thể chuộc');
  const def = BOARD[sq];
  if (!ps.mortgaged) throw new MonoError('Ô này không bị cầm cố');
  const cost = Math.ceil((def.price! / 2) * 1.1);
  if (s.players[player].money < cost) throw new MonoError('Không đủ tiền chuộc');
  s.players[player].money -= cost;
  ps.mortgaged = false;
  log(s, `${s.players[player].name} chuộc ${def.name}.`);
}

// ---------- debt & bankruptcy ----------
export function monoPayDebt(s: MonopolyPublic, player: number): void {
  requireTurn(s, player, ['debt']);
  const d = s.debt!;
  const p = s.players[player];
  if (p.money < d.amount) throw new MonoError('Chưa đủ tiền trả nợ');
  p.money -= d.amount;
  if (d.creditor >= 0) s.players[d.creditor].money += d.amount;
  s.debt = null;
  s.phase = d.resume;
  log(s, `${p.name} đã trả xong nợ.`);
}

export function monoBankrupt(s: MonopolyPublic, player: number, now: number): void {
  if (s.status !== 'playing') throw new MonoError('Ván chưa bắt đầu');
  const p = s.players[player];
  if (p.bankrupt) return;
  const creditor = s.turn === player && s.debt ? s.debt.creditor : -1;
  for (const i of OWNABLE) {
    const ps = s.props[i];
    if (ps.owner !== player) continue;
    // buildings go back to the bank at half price
    const refund = ps.houses * (BOARD[i].house || 0) / 2;
    ps.houses = 0;
    if (creditor >= 0) {
      s.players[creditor].money += refund;
      ps.owner = creditor;
    } else {
      ps.owner = -1;
      ps.mortgaged = false;
    }
  }
  if (creditor >= 0) {
    s.players[creditor].money += Math.max(0, p.money);
    s.players[creditor].jailCards += p.jailCards;
  }
  p.money = 0;
  p.jailCards = 0;
  p.bankrupt = true;
  p.inJail = false;
  log(s, `${p.name} phá sản!`);
  if (s.trade && (s.trade.from === player || s.trade.to === player)) s.trade = null;

  const left = alive(s);
  if (left.length === 1) {
    s.winner = left[0];
    s.status = 'finished';
    s.deadline = null;
    s.debt = null;
    log(s, `${s.players[left[0]].name} là tỉ phú cuối cùng!`);
    return;
  }
  if (s.turn === player) {
    s.debt = null;
    nextPlayer(s, now);
  }
}

// ---------- trading ----------
function tradeable(s: MonopolyPublic, owner: number, props: number[]) {
  for (const sq of props) {
    const ps = s.props[sq];
    if (!ps || ps.owner !== owner) throw new MonoError('Tài sản trao đổi không hợp lệ');
    const g = BOARD[sq].group;
    if (g && GROUPS[g].some((i) => s.props[i].houses > 0)) throw new MonoError('Phải bán hết nhà trong nhóm trước khi trao đổi');
  }
}

export function monoProposeTrade(s: MonopolyPublic, player: number, raw: any): void {
  requireTurn(s, player, ['roll', 'end']);
  const to = Number(raw?.to);
  if (!Number.isInteger(to) || to === player || !s.players[to] || s.players[to].bankrupt) throw new MonoError('Người nhận không hợp lệ');
  const ints = (a: unknown) => (Array.isArray(a) ? [...new Set(a.map(Number).filter((x) => Number.isInteger(x)))] : []);
  const money = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
  const t: Trade = { from: player, to, giveProps: ints(raw?.giveProps), giveMoney: money(raw?.giveMoney), getProps: ints(raw?.getProps), getMoney: money(raw?.getMoney) };
  if (!t.giveProps.length && !t.getProps.length && !t.giveMoney && !t.getMoney) throw new MonoError('Đề nghị trống');
  tradeable(s, player, t.giveProps);
  tradeable(s, to, t.getProps);
  if (s.players[player].money < t.giveMoney) throw new MonoError('Bạn không đủ tiền');
  s.trade = t;
  log(s, `${s.players[player].name} đề nghị trao đổi với ${s.players[to].name}.`);
}

export function monoRespondTrade(s: MonopolyPublic, player: number, accept: boolean): void {
  const t = s.trade;
  if (!t || (player !== t.to && player !== t.from)) throw new MonoError('Không có đề nghị trao đổi');
  if (!accept || player === t.from) {
    s.trade = null;
    log(s, `Đề nghị trao đổi đã bị ${player === t.from ? 'hủy' : 'từ chối'}.`);
    return;
  }
  tradeable(s, t.from, t.giveProps);
  tradeable(s, t.to, t.getProps);
  if (s.players[t.from].money < t.giveMoney || s.players[t.to].money < t.getMoney) throw new MonoError('Không đủ tiền để hoàn tất trao đổi');
  for (const sq of t.giveProps) s.props[sq].owner = t.to;
  for (const sq of t.getProps) s.props[sq].owner = t.from;
  s.players[t.from].money += t.getMoney - t.giveMoney;
  s.players[t.to].money += t.giveMoney - t.getMoney;
  s.trade = null;
  log(s, `${s.players[t.to].name} đồng ý trao đổi với ${s.players[t.from].name}.`);
}

// ---------- timeouts ----------
export function monoAdvance(s: MonopolyPublic, priv: MonopolyPrivate, now: number, dice: Dice): boolean {
  if (s.status !== 'playing' || s.deadline === null || now < s.deadline) return false;
  const player = s.turn;
  s.players[player].afk = true;
  switch (s.phase) {
    case 'roll':
      monoRoll(s, priv, player, dice, now);
      break;
    case 'buy':
      monoBuy(s, player, false);
      break;
    case 'end':
      monoEndTurn(s, player, now);
      break;
    case 'debt':
      monoBankrupt(s, player, now);
      break;
  }
  if (s.status === 'playing') s.deadline = now + (s.players[s.turn].afk ? AFK_MS : TURN_MS);
  return true;
}

/** A player leaving mid-game goes bankrupt (to their creditor if they owe rent, else to the bank). */
export function monoLeave(s: MonopolyPublic, userId: string, now: number): boolean {
  const i = monoSeatOf(s, userId);
  if (i < 0) return false;
  if (s.status === 'waiting') return monoLeaveLobby(s, userId);
  if (s.status === 'playing' && !s.players[i].bankrupt) monoBankrupt(s, i, now);
  return false;
}
