'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { clsx } from 'clsx';
import { SICBO_TOTAL_PAY } from '@shared/casino.ts';
import { sfx } from '@/lib/sfx';
import { Panel, Spinner, formatChips, useToast } from '@/components/ui';
import { Chip, ChipSelector, FairnessNote, PhaseBar, SlipBar, TablePlayers, useCasino, useSlip } from './common';

const DiceRoller = dynamic(() => import('@/components/three/DiceRoller'), { ssr: false });
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function DieFace({ n, size = 22 }: { n: number; size?: number }) {
  return (
    <span className="inline-grid shrink-0 grid-cols-3 grid-rows-3 rounded-[22%] bg-[#f6f3ea] p-[14%] shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]" style={{ width: size, height: size }} aria-label={String(n)}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={clsx('m-auto rounded-full', PIPS[n].includes(i) && (n === 1 ? 'bg-red-600' : 'bg-[#1b1b1f]'))} style={{ width: size * 0.17, height: size * 0.17 }} />
      ))}
    </span>
  );
}
const Dice = ({ ns, size }: { ns: number[]; size?: number }) => <span className="inline-flex gap-0.5">{ns.map((n, i) => <DieFace key={i} n={n} size={size} />)}</span>;

function Spot({ k, label, sub, slip, mine, onClick, className, disabled }: {
  k: string; label: React.ReactNode; sub?: string; slip: Record<string, number>; mine: Record<string, number>; onClick: (k: string) => void; className?: string; disabled?: boolean;
}) {
  const amt = (slip[k] || 0) + (mine[k] || 0);
  return (
    <button
      disabled={disabled}
      onClick={() => onClick(k)}
      className={clsx('relative flex flex-col items-center justify-center rounded-xl border border-amber-200/20 bg-emerald-900/40 px-1 py-2 text-center transition hover:bg-emerald-700/50 disabled:cursor-not-allowed disabled:opacity-70', className)}
    >
      <div className="font-display font-bold leading-tight">{label}</div>
      {sub && <div className="text-[10px] text-amber-200/80">{sub}</div>}
      {amt > 0 && <div className="absolute -right-1.5 -top-1.5"><Chip value={amt >= 5000 ? 5000 : amt >= 1000 ? 1000 : amt >= 500 ? 500 : amt >= 100 ? 100 : amt >= 50 ? 50 : 10} small /></div>}
      {amt > 0 && <div className="absolute bottom-0.5 right-1 text-[9px] font-bold text-amber-100">{formatChips(amt)}</div>}
    </button>
  );
}

export default function Sicbo() {
  const { state, myBet, bet } = useCasino('sicbo');
  const { slip, add, clear, total, lines } = useSlip();
  const [chip, setChip] = useState(100);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const lastRound = useRef<number | null>(null);

  useEffect(() => {
    if (!state) return;
    if (state.phase === 'result' && lastRound.current !== state.round) {
      lastRound.current = state.round;
      sfx.dice();
      if (myBet && myBet.round === state.round) setTimeout(() => (myBet.payout > 0 ? sfx.cash() : null), 1200);
    }
    if (state.phase === 'betting') clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.round]);

  if (!state) return <div className="grid min-h-[50vh] place-items-center"><Spinner /></div>;
  const betting = state.phase === 'betting';
  const mine: Record<string, number> = {};
  if (myBet && myBet.round === state.round) for (const b of myBet.bets) mine[b.key] = (mine[b.key] || 0) + b.amount;
  const onSpot = (k: string) => { if (!betting) return; sfx.chip(); add(k, chip); };
  const dice = state.result?.dice;
  const sum = dice ? dice[0] + dice[1] + dice[2] : null;
  const isTriple = dice ? dice[0] === dice[1] && dice[1] === dice[2] : false;
  const sp = (k: string, label: React.ReactNode, sub?: string, cls?: string) => (
    <Spot key={k} k={k} label={label} sub={sub} slip={slip} mine={mine} onClick={onSpot} className={cls} disabled={!betting} />
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <PhaseBar state={state} />
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Panel className="relative overflow-hidden p-0">
            <div className="relative h-56 bg-[#1a0b0e]">
              {dice && state.phase === 'result' ? <DiceRoller values={dice} rollKey={state.round} className="h-full w-full" /> : (
                <div className="grid h-full place-items-center text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/covers/sicbo.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
                  <div className="relative rounded-lg bg-black/60 px-4 py-2 font-semibold">{betting ? 'Mời đặt cược' : 'Đang lắc…'}</div>
                </div>
              )}
            </div>
            {dice && state.phase === 'result' && (
              <div className="absolute inset-x-0 bottom-3 text-center">
                <span className="font-display rounded-xl bg-black/60 px-4 py-1.5 text-2xl font-bold">
                  {sum} · {isTriple ? <span className="text-amber-300">BỘ BA</span> : sum! >= 11 ? <span className="text-rose-300">TÀI</span> : <span className="text-accent">XỈU</span>}
                </span>
              </div>
            )}
          </Panel>
          <Panel className="p-4">
            <div className="text-sm font-semibold">Lịch sử</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {state.history.map((h) => {
                const s = h.dice!.reduce((a, b) => a + b, 0);
                const t = h.dice![0] === h.dice![1] && h.dice![1] === h.dice![2];
                return (
                  <span key={h.round} title={`#${h.round}: ${h.dice!.join('-')}`} className={clsx('grid h-8 w-8 place-items-center rounded-full text-xs font-bold', t ? 'bg-amber-500 text-black' : s >= 11 ? 'bg-rose-600' : 'bg-cyan-600')}>{s}</span>
                );
              })}
            </div>
            {myBet && myBet.round === state.round && (
              <div className="mt-4 rounded-lg bg-white/5 p-2 text-sm">
                Cược ván này: <b>{formatChips(myBet.stake)}</b>
                {state.phase === 'result' && myBet.settled && <div className={myBet.payout > 0 ? 'text-emerald-300' : 'text-rose-300'}>{myBet.payout > 0 ? `Thắng ${formatChips(myBet.payout)}` : 'Thua'}</div>}
              </div>
            )}
          </Panel>
        </div>

        <Panel className="space-y-3 bg-[radial-gradient(ellipse_at_top,#064e3b,#022c22)] p-4">
          <div className="grid grid-cols-[1fr_2fr_1fr] gap-2">
            {sp('small', <span className="text-3xl text-accent">XỈU</span>, '4–10 · 1 ăn 1', 'py-5')}
            <div className="grid grid-cols-2 gap-2">
              {sp('odd', 'LẺ', '1 ăn 1')}
              {sp('even', 'CHẴN', '1 ăn 1')}
              {sp('anytriple', 'BỘ BA BẤT KỲ', '1 ăn 30', 'col-span-2')}
            </div>
            {sp('big', <span className="text-3xl text-rose-200">TÀI</span>, '11–17 · 1 ăn 1', 'py-5')}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((d) => sp(`double:${d}`, <Dice ns={[d, d]} />, '1 ăn 10'))}
            {[1, 2, 3, 4, 5, 6].map((d) => sp(`triple:${d}`, <Dice ns={[d, d, d]} size={18} />, '1 ăn 180'))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-14">
            {Array.from({ length: 14 }, (_, i) => i + 4).map((t) => sp(`total:${t}`, t, `1 ăn ${SICBO_TOTAL_PAY[t]}`))}
          </div>
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-15">
            {[1, 2, 3, 4, 5].flatMap((a) => [a + 1, a + 2, a + 3, a + 4, a + 5].filter((b) => b <= 6).map((b) => sp(`combo:${a}-${b}`, <Dice ns={[a, b]} size={18} />, '1 ăn 5')))}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((d) => sp(`single:${d}`, <DieFace n={d} size={26} />, '1 ăn 1/2/3'))}
          </div>
        </Panel>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChipSelector value={chip} onChange={setChip} />
          <SlipBar total={total} onClear={clear} disabled={!betting} busy={busy} onConfirm={async () => {
            setBusy(true);
            try { await bet(lines); clear(); sfx.chip(); } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
          }} />
        </div>
        <FairnessNote state={state} />
      </div>
      <div className="space-y-4">
        <TablePlayers state={state} />
        <Panel className="p-4 text-sm text-muted">
          <div className="font-semibold text-text">Luật</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>3 xúc xắc. Tài: tổng 11–17, Xỉu: 4–10. Ra bộ ba thì Tài/Xỉu/Chẵn/Lẻ đều thua.</li>
            <li>Cược một mặt: mỗi xúc xắc ra đúng mặt đó được trả thêm 1 lần.</li>
            <li>Mỗi ván 20 giây đặt cược. Chip là chip ảo.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
