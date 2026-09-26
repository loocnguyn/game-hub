'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { BOARD, OWNABLE, netWorth, rentFor, type MonopolyPublic } from '@shared/monopoly.ts';
import { useAuth } from '@/lib/auth';
import { sfx } from '@/lib/sfx';
import type { useRoom } from '@/lib/useRoom';
import { Avatar, Button, Modal, Panel, useToast } from '@/components/ui';
import { InvitePanel, useNow } from '@/components/room/common';

const DiceRoller = dynamic(() => import('@/components/three/DiceRoller'), { ssr: false });

type Room = ReturnType<typeof useRoom<MonopolyPublic>>;

export const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899'];
const GROUP_COLORS: Record<string, string> = {
  brown: '#92400e', lightblue: '#7dd3fc', pink: '#f472b6', orange: '#fb923c', red: '#ef4444', yellow: '#facc15', green: '#22c55e', darkblue: '#3b82f6',
};
// Secondary buttons drawn on the light board centre need dark text to stay readable.
const ON_BOARD = '!border-emerald-900/25 !bg-emerald-950/10 !text-emerald-950 hover:!bg-emerald-950/20';
const ICONS: Record<string, string> = { go: '➜', chance: '?', chest: '✉', tax: '₫', jail: '▦', parking: 'P', gotojail: '⚑', station: '🚉', util: '⚡' };

/** Grid cell (row, col) on an 11x11 board for square i (GO bottom-right, counter-clockwise). */
function cellOf(i: number): [number, number] {
  if (i === 0) return [10, 10];
  if (i < 10) return [10, 10 - i];
  if (i === 10) return [10, 0];
  if (i < 20) return [10 - (i - 10), 0];
  if (i === 20) return [0, 0];
  if (i < 30) return [0, i - 20];
  if (i === 30) return [0, 10];
  return [i - 30, 10];
}
const side = (i: number) => (i < 10 ? 'bottom' : i < 20 ? 'left' : i < 30 ? 'top' : 'right');

function Square({ i, s, onClick, highlight }: { i: number; s: MonopolyPublic; onClick: () => void; highlight: boolean }) {
  const sq = BOARD[i];
  const [r, c] = cellOf(i);
  const ps = s.props[i];
  const corner = i % 10 === 0;
  const owner = ps && ps.owner >= 0 ? s.players[ps.owner] : null;
  const here = s.players.filter((p) => !p.bankrupt && p.pos === i);
  const sd = side(i);
  const bar = sq.group ? GROUP_COLORS[sq.group] : null;
  return (
    <button
      onClick={onClick}
      style={{ gridRow: r + 1, gridColumn: c + 1 }}
      className={clsx(
        'relative flex overflow-hidden border border-black/40 bg-[#f4efe1] text-[#1c1917] transition hover:z-10 hover:scale-[1.04] hover:shadow-xl',
        highlight && 'z-10 ring-2 ring-cyan-400',
        sd === 'bottom' && 'flex-col', sd === 'top' && 'flex-col-reverse', sd === 'left' && 'flex-row-reverse', sd === 'right' && 'flex-row',
      )}
    >
      {bar && <div className={clsx(sd === 'bottom' || sd === 'top' ? 'h-[22%] w-full' : 'h-full w-[22%]', 'shrink-0')} style={{ background: bar }}>
        {ps && ps.houses > 0 && (
          <div className="flex h-full w-full items-center justify-center gap-[2px]">
            {ps.houses === 5 ? <span className="h-[70%] w-[40%] rounded-sm bg-red-700" /> : Array.from({ length: ps.houses }, (_, k) => <span key={k} className="aspect-square h-[60%] rounded-[2px] bg-green-700" />)}
          </div>
        )}
      </div>}
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center p-0.5 text-center leading-tight">
        {!bar && <div className={clsx(corner ? 'text-2xl' : 'text-base')}>{ICONS[sq.kind] ?? ''}</div>}
        <div className={clsx('font-semibold', corner ? 'text-[11px]' : 'text-[8.5px] sm:text-[9.5px]')}>{sq.name}</div>
        {sq.price && <div className="text-[8.5px] text-stone-600">{sq.price}</div>}
        {sq.tax && <div className="text-[8.5px] text-stone-600">-{sq.tax}</div>}
      </div>
      {owner && <div className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ background: PLAYER_COLORS[owner.color] }} title={owner.name} />}
      {ps?.mortgaged && <div className="absolute inset-0 grid place-items-center bg-black/40 text-[9px] font-bold text-white">CẦM CỐ</div>}
      {here.length > 0 && (
        <div className="absolute inset-x-0 bottom-0.5 flex flex-wrap justify-center gap-0.5">
          {here.map((p) => (
            <motion.span layoutId={`tok-${p.id}`} key={p.id} className="h-3.5 w-3.5 rounded-full border-2 border-white shadow-md sm:h-4 sm:w-4" style={{ background: PLAYER_COLORS[p.color] }} title={p.name} />
          ))}
        </div>
      )}
    </button>
  );
}

function money(n: number) {
  return `${n.toLocaleString('vi-VN')}K`;
}

export default function MonopolyGame({ room }: { room: Room }) {
  const s = room.state!;
  const { profile } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const now = useNow(true, 250);
  const me = s.players.findIndex((p) => p.id === profile?.id);
  const myTurn = s.status === 'playing' && s.turn === me;
  const [info, setInfo] = useState<number | null>(null);
  const [trade, setTrade] = useState(false);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const prevDice = useRef<string>('');
  const [rollKey, setRollKey] = useState(0);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [s.log.length]);
  useEffect(() => {
    const d = s.dice ? s.dice.join(',') + s.log.length : '';
    if (s.dice && d !== prevDice.current) { setRollKey((k) => k + 1); sfx.dice(); }
    prevDice.current = d;
  }, [s.dice, s.log.length]);
  useEffect(() => { if (myTurn) sfx.notify(); }, [myTurn]);

  const act = async (action: string, params: Record<string, unknown> = {}) => {
    setBusy(true);
    try { await room.act(action, params); } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
  };

  const cur = s.players[s.turn];
  const here = cur ? BOARD[cur.pos] : null;
  const secs = s.deadline ? Math.max(0, Math.ceil((s.deadline - now) / 1000)) : 0;
  const endsIn = s.endsAt ? Math.max(0, s.endsAt - now) : null;
  const incomingTrade = s.trade && s.trade.to === me ? s.trade : null;

  const center = (
    <div className="flex h-full flex-col gap-2 p-3" style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}>
      <div className="flex items-center justify-between">
        <div className="font-display text-xl font-black tracking-wide text-emerald-900 sm:text-2xl">CỜ TỈ PHÚ</div>
        {endsIn !== null && s.status === 'playing' && <div className="rounded-lg bg-emerald-900/80 px-2 py-1 text-xs text-white">Còn {Math.floor(endsIn / 60000)} phút</div>}
      </div>
      <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2">
        <div className="flex flex-col items-center justify-center rounded-xl bg-emerald-900/10">
          {s.dice ? <DiceRoller values={s.dice} rollKey={rollKey} className="h-32 w-full sm:h-40" /> : <div className="text-sm text-emerald-900/60">Chưa đổ xúc xắc</div>}
          {s.status === 'playing' && cur && (
            <div className="mt-1 text-center text-sm text-emerald-950">
              Lượt <b style={{ color: PLAYER_COLORS[cur.color] }}>{cur.name}</b> · {secs}s
              {cur.inJail && <span className="ml-1 rounded bg-stone-800 px-1 text-xs text-white">trong tù</span>}
            </div>
          )}
          {s.card && <div className="mx-3 mt-2 rounded-xl border-2 border-amber-500 bg-amber-50 p-2 text-center text-xs text-stone-800"><b>{s.card.deck === 'chance' ? 'Cơ hội' : 'Khí vận'}:</b> {s.card.text}</div>}
        </div>
        <div ref={logRef} className="max-h-48 overflow-auto rounded-xl bg-white/60 p-2 text-[11px] leading-snug text-stone-700 md:max-h-none">
          {s.log.map((l, i) => <div key={i} className="border-b border-stone-200 py-0.5 last:border-0">{l}</div>)}
          {!s.log.length && <div className="text-stone-400">Nhật ký ván chơi</div>}
        </div>
      </div>
      {myTurn && (
        <div className="flex flex-wrap justify-center gap-2">
          {s.phase === 'roll' && <Button onClick={() => act('roll')} loading={busy}>Đổ xúc xắc</Button>}
          {s.phase === 'roll' && s.players[me].inJail && <Button variant="ghost" onClick={() => act('payjail')} className={ON_BOARD}>Nộp 50 ra tù</Button>}
          {s.phase === 'roll' && s.players[me].inJail && s.players[me].jailCards > 0 && <Button variant="ghost" onClick={() => act('payjail', { useCard: true })} className={ON_BOARD}>Dùng thẻ ra tù</Button>}
          {s.phase === 'buy' && here && <Button variant="success" onClick={() => act('buy', { buy: true })} disabled={s.players[me].money < (here.price ?? 0)}>Mua {here.name} ({money(here.price!)})</Button>}
          {s.phase === 'buy' && <Button variant="ghost" onClick={() => act('buy', { buy: false })} className={ON_BOARD}>Không mua</Button>}
          {s.phase === 'end' && <Button onClick={() => act('end')} loading={busy}>Kết thúc lượt</Button>}
          {s.phase === 'debt' && s.debt && (
            <>
              <Button variant="success" onClick={() => act('paydebt')} disabled={s.players[me].money < s.debt.amount}>Trả nợ {money(s.debt.amount)}</Button>
              <Button variant="danger" onClick={() => act('bankrupt')}>Phá sản</Button>
            </>
          )}
          {(s.phase === 'roll' || s.phase === 'end') && <Button variant="ghost" onClick={() => setTrade(true)} className={ON_BOARD}>Đổi chác</Button>}
        </div>
      )}
      {s.status === 'waiting' && (
        <div className="text-center">
          <div className="font-semibold text-emerald-950">Phòng chờ · {s.players.length}/6 người</div>
          {s.host === profile?.id ? (
            <Button className="mt-2" onClick={() => act('start')} disabled={s.players.length < 2}>Bắt đầu ván</Button>
          ) : <div className="text-sm text-emerald-900/70">Chờ chủ phòng bắt đầu</div>}
        </div>
      )}
      {s.status === 'finished' && s.winner !== null && (
        <div className="text-center font-display text-2xl font-bold text-emerald-950">{s.players[s.winner].name} thắng!</div>
      )}
    </div>
  );

  const infoSq = info !== null ? BOARD[info] : null;
  const infoPs = info !== null ? s.props[info] : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="mx-auto w-full" style={{ maxWidth: 'max(360px, min(900px, calc(100vh - 110px)))' }}>
        <div className="grid aspect-square w-full gap-0 overflow-hidden rounded-2xl border-4 border-[#1c3d2e] bg-[#cfe8d6] shadow-[0_40px_100px_-30px_rgba(34,197,94,0.5)]"
          style={{ gridTemplateColumns: '1.5fr repeat(9, 1fr) 1.5fr', gridTemplateRows: '1.5fr repeat(9, 1fr) 1.5fr' }}>
          {BOARD.map((_, i) => <Square key={i} i={i} s={s} onClick={() => setInfo(i)} highlight={cur?.pos === i && s.status === 'playing'} />)}
          {center}
        </div>
      </div>

      <div className="space-y-4">
        {s.status === 'waiting' && <InvitePanel code={room.view!.code} game="monopoly" />}
        {incomingTrade && (
          <Panel className="border-amber-400/40 p-4">
            <div className="font-semibold">{s.players[incomingTrade.from].name} đề nghị đổi:</div>
            <div className="mt-2 text-sm text-muted">Bạn nhận: {[...incomingTrade.giveProps.map((q) => BOARD[q].name), incomingTrade.giveMoney ? money(incomingTrade.giveMoney) : ''].filter(Boolean).join(', ') || 'không có gì'}</div>
            <div className="text-sm text-muted">Bạn đưa: {[...incomingTrade.getProps.map((q) => BOARD[q].name), incomingTrade.getMoney ? money(incomingTrade.getMoney) : ''].filter(Boolean).join(', ') || 'không có gì'}</div>
            <div className="mt-3 flex gap-2"><Button size="sm" variant="success" onClick={() => act('respond', { accept: true })}>Đồng ý</Button><Button size="sm" variant="ghost" onClick={() => act('respond', { accept: false })}>Từ chối</Button></div>
          </Panel>
        )}
        <Panel className="p-4">
          <div className="font-display text-lg font-bold">Người chơi</div>
          <ul className="mt-2 space-y-2">
            {s.players.map((p, i) => {
              const owned = OWNABLE.filter((q) => s.props[q].owner === i);
              return (
                <li key={p.id} className={clsx('rounded-xl border px-3 py-2', s.turn === i && s.status === 'playing' ? 'border-cyan-400/50 bg-cyan-400/5' : 'border-white/10 bg-white/[0.03]', p.bankrupt && 'opacity-40')}>
                  <div className="flex items-center gap-2">
                    <Avatar name={p.name} size={30} color={PLAYER_COLORS[p.color]} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{p.name}{i === me && <span className="ml-1 text-xs text-dim">(bạn)</span>}{p.afk && <span className="ml-1 text-xs text-amber-300">vắng</span>}</div>
                      <div className="text-xs text-muted">{p.bankrupt ? 'Phá sản' : `${money(p.money)} · tài sản ${money(netWorth(s, i))}`}</div>
                    </div>
                  </div>
                  {owned.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {owned.map((q) => (
                        <button key={q} onClick={() => setInfo(q)} className={clsx('rounded px-1.5 py-0.5 text-[10px] font-semibold text-black', s.props[q].mortgaged && 'opacity-40 line-through')} style={{ background: BOARD[q].group ? GROUP_COLORS[BOARD[q].group!] : '#cbd5e1' }}>
                          {BOARD[q].name}{s.props[q].houses ? ` ${s.props[q].houses === 5 ? '🏨' : '🏠' + s.props[q].houses}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {s.status === 'waiting' && me >= 0 && <Button variant="ghost" size="sm" className="mt-3" onClick={async () => { await room.leave(); router.push('/play/monopoly'); }}>Rời phòng</Button>}
        </Panel>
      </div>

      <Modal open={info !== null} onClose={() => setInfo(null)} title={infoSq?.name}>
        {infoSq && info !== null && (
          <div className="space-y-3 text-sm">
            {infoSq.group && <div className="h-3 rounded" style={{ background: GROUP_COLORS[infoSq.group] }} />}
            {infoSq.price && <div>Giá: <b>{money(infoSq.price)}</b> · Cầm cố: {money(infoSq.price / 2)}</div>}
            {infoSq.rents && (
              <table className="w-full text-left">
                <tbody>
                  {['Đất trống', '1 nhà', '2 nhà', '3 nhà', '4 nhà', 'Khách sạn'].map((l, k) => (
                    <tr key={l} className={clsx(infoPs?.houses === k && 'text-cyan-200')}><td className="py-0.5">{l}</td><td className="text-right">{money(infoSq.rents![k])}</td></tr>
                  ))}
                  <tr><td className="py-0.5 text-muted">Giá mỗi nhà</td><td className="text-right text-muted">{money(infoSq.house!)}</td></tr>
                </tbody>
              </table>
            )}
            {infoSq.kind === 'station' && <div>Tiền thuê: 25 / 50 / 100 / 200 theo số bến sở hữu.</div>}
            {infoSq.kind === 'util' && <div>Tiền thuê: 4 lần số xúc xắc, sở hữu cả 2 công ty thì 10 lần.</div>}
            {infoPs && <div>Chủ: <b>{infoPs.owner >= 0 ? s.players[infoPs.owner].name : 'Ngân hàng'}</b>{infoPs.owner >= 0 && ` · tiền thuê hiện tại ${money(rentFor(s, info, 7))}${infoSq.kind === 'util' ? ' (ví dụ đổ 7)' : ''}`}</div>}
            {infoPs && infoPs.owner === me && myTurn && s.phase !== 'buy' && (
              <div className="flex flex-wrap gap-2 pt-2">
                {infoSq.kind === 'prop' && <Button size="sm" onClick={() => act('build', { square: info })}>Xây nhà ({money(infoSq.house!)})</Button>}
                {infoSq.kind === 'prop' && infoPs.houses > 0 && <Button size="sm" variant="ghost" onClick={() => act('sell', { square: info })}>Bán 1 nhà</Button>}
                {!infoPs.mortgaged && <Button size="sm" variant="ghost" onClick={() => act('mortgage', { square: info })}>Cầm cố (+{money(infoSq.price! / 2)})</Button>}
                {infoPs.mortgaged && <Button size="sm" variant="ghost" onClick={() => act('unmortgage', { square: info })}>Chuộc lại ({money(Math.ceil(infoSq.price! / 2 * 1.1))})</Button>}
              </div>
            )}
          </div>
        )}
      </Modal>

      <TradeDialog open={trade} onClose={() => setTrade(false)} s={s} me={me} onSend={async (t) => { await act('trade', { trade: t }); setTrade(false); }} />
    </div>
  );
}

function TradeDialog({ open, onClose, s, me, onSend }: { open: boolean; onClose: () => void; s: MonopolyPublic; me: number; onSend: (t: object) => void }) {
  const others = s.players.map((p, i) => ({ p, i })).filter(({ p, i }) => i !== me && !p.bankrupt);
  const [to, setTo] = useState<number>(others[0]?.i ?? -1);
  const [give, setGive] = useState<number[]>([]);
  const [get, setGet] = useState<number[]>([]);
  const [giveMoney, setGiveMoney] = useState(0);
  const [getMoney, setGetMoney] = useState(0);
  const mine = useMemo(() => OWNABLE.filter((q) => s.props[q].owner === me), [s.props, me]);
  const theirs = useMemo(() => OWNABLE.filter((q) => s.props[q].owner === to), [s.props, to]);
  const toggle = (arr: number[], set: (v: number[]) => void, q: number) => set(arr.includes(q) ? arr.filter((x) => x !== q) : [...arr, q]);
  return (
    <Modal open={open} onClose={onClose} title="Đề nghị đổi chác" wide>
      <div className="mb-3 flex flex-wrap gap-2">
        {others.map(({ p, i }) => (
          <button key={p.id} onClick={() => { setTo(i); setGet([]); }} className={clsx('rounded-lg px-3 py-1.5 text-sm', to === i ? 'bg-cyan-500/30 text-white' : 'bg-white/5 text-muted')}>{p.name}</button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Bạn đưa</div>
          <div className="mt-2 flex flex-wrap gap-1">{mine.map((q) => <button key={q} onClick={() => toggle(give, setGive, q)} className={clsx('rounded px-2 py-1 text-xs', give.includes(q) ? 'bg-cyan-500 text-black' : 'bg-white/10')}>{BOARD[q].name}</button>)}</div>
          <input type="number" min={0} value={giveMoney} onChange={(e) => setGiveMoney(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className="mt-2 h-9 w-full rounded-lg bg-black/30 px-2" placeholder="Tiền" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Bạn nhận</div>
          <div className="mt-2 flex flex-wrap gap-1">{theirs.map((q) => <button key={q} onClick={() => toggle(get, setGet, q)} className={clsx('rounded px-2 py-1 text-xs', get.includes(q) ? 'bg-cyan-500 text-black' : 'bg-white/10')}>{BOARD[q].name}</button>)}</div>
          <input type="number" min={0} value={getMoney} onChange={(e) => setGetMoney(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className="mt-2 h-9 w-full rounded-lg bg-black/30 px-2" placeholder="Tiền" />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Hủy</Button>
        <Button disabled={to < 0} onClick={() => onSend({ to, giveProps: give, giveMoney, getProps: get, getMoney })}>Gửi đề nghị</Button>
      </div>
    </Modal>
  );
}
