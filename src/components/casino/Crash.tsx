'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { clsx } from 'clsx';
import { crashMultiplierAt } from '@shared/casino.ts';
import { api, serverNow } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { sfx } from '@/lib/sfx';
import { Button, Field, Panel, Spinner, formatChips, inputClass, useToast } from '@/components/ui';
import { ChipSelector, FairnessNote, PhaseBar, TablePlayers, useCasino } from './common';

const CrashScene = dynamic(() => import('./CrashScene'), { ssr: false });

const histColor = (x: number) => (x < 1.5 ? 'bg-rose-600' : x < 2 ? 'bg-orange-500' : x < 5 ? 'bg-emerald-600' : x < 20 ? 'bg-cyan-600' : 'bg-violet-600');

export default function Crash() {
  const { state, myBet, bet, refresh } = useCasino('crash');
  const { setChips } = useAuth();
  const toast = useToast();
  const [amount, setAmount] = useState(100);
  const [auto, setAuto] = useState('');
  const [busy, setBusy] = useState(false);
  const [mult, setMult] = useState(1);
  const multRef = useRef(1);
  const crashedRound = useRef(-1);

  // live multiplier from the server clock
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (state?.phase === 'running' && state.startAt) {
        const m = crashMultiplierAt(serverNow() - state.startAt);
        if (m !== multRef.current) { multRef.current = m; setMult(m); }
      } else if (state?.phase === 'result' && state.result?.crash) {
        if (multRef.current !== state.result.crash) { multRef.current = state.result.crash; setMult(state.result.crash); }
      } else if (multRef.current !== 1) { multRef.current = 1; setMult(1); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state?.phase, state?.startAt, state?.result]);

  useEffect(() => {
    if (state?.phase === 'result' && crashedRound.current !== state.round) {
      crashedRound.current = state.round;
      sfx.boom();
    }
  }, [state?.phase, state?.round]);

  const active = myBet && state && myBet.round === state.round && !myBet.settled && myBet.cashout === null;
  const autoNum = Number(auto.replace(',', '.'));
  const scene = useMemo(() => ({ phase: state?.phase ?? 'betting' }), [state?.phase]);

  if (!state) return <div className="grid min-h-[50vh] place-items-center"><Spinner /></div>;
  const betting = state.phase === 'betting';
  const running = state.phase === 'running';

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <PhaseBar state={state} />
        <div className="flex flex-wrap gap-1.5">
          {state.history.map((h) => <span key={h.round} className={clsx('rounded-full px-2.5 py-1 text-xs font-bold', histColor(h.crash!))}>{h.crash!.toFixed(2)}x</span>)}
        </div>
        <div className="relative h-[440px] overflow-hidden rounded-2xl border border-white/10">
          <CrashScene phase={scene.phase} multiplier={mult} />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className={clsx('font-display text-7xl font-black tabular-nums drop-shadow-[0_0_30px_rgba(168,85,247,0.8)]', state.phase === 'result' ? 'text-rose-400' : 'text-white')}>
                {betting ? `${Math.max(0, Math.ceil((state.bettingEndsAt - serverNow()) / 1000))}s` : `${mult.toFixed(2)}x`}
              </div>
              <div className="mt-1 text-sm text-white/70">{betting ? 'Chuẩn bị phóng' : running ? 'Đang bay…' : 'Nổ rồi!'}</div>
            </div>
          </div>
        </div>
        <Panel className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Tiền cược">
              <input className={clsx(inputClass, 'w-36')} type="number" min={10} value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
            </Field>
            <Field label="Tự rút ở (tùy chọn)">
              <input className={clsx(inputClass, 'w-32')} placeholder="vd 2.00" value={auto} onChange={(e) => setAuto(e.target.value)} />
            </Field>
            <div className="flex-1" />
            {active && running ? (
              <Button size="lg" variant="success" loading={busy} onClick={async () => {
                setBusy(true);
                try {
                  const r = await api<{ multiplier: number; payout: number; chips: number }>('casino.cashout');
                  setChips(r.chips);
                  sfx.cash();
                  toast.ok(`Rút ở x${r.multiplier.toFixed(2)}: +${formatChips(r.payout)}`);
                  refresh();
                } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
              }}>
                Rút {formatChips(Math.floor((myBet?.stake ?? 0) * mult))}
              </Button>
            ) : (
              <Button size="lg" variant="gold" disabled={!betting || !!(myBet && myBet.round === state.round)} loading={busy} onClick={async () => {
                setBusy(true);
                try {
                  await bet([{ key: 'crash', amount }], autoNum >= 1.01 ? autoNum : undefined);
                  sfx.chip();
                } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
              }}>
                {myBet && myBet.round === state.round ? 'Đã đặt' : betting ? 'Đặt cược' : 'Chờ ván sau'}
              </Button>
            )}
          </div>
          <div className="mt-3"><ChipSelector value={amount} onChange={setAmount} /></div>
          {myBet && myBet.round === state.round && (
            <div className="mt-3 text-sm text-muted">
              Cược {formatChips(myBet.stake)}{myBet.auto_cashout ? ` · tự rút ở x${Number(myBet.auto_cashout).toFixed(2)}` : ''}
              {myBet.cashout && <span className="ml-2 text-emerald-300">Đã rút x{Number(myBet.cashout).toFixed(2)} (+{formatChips(myBet.payout)})</span>}
              {state.phase === 'result' && myBet.settled && !myBet.cashout && <span className={clsx('ml-2', myBet.payout > 0 ? 'text-emerald-300' : 'text-rose-300')}>{myBet.payout > 0 ? `Tự rút +${formatChips(myBet.payout)}` : 'Mất cược'}</span>}
            </div>
          )}
        </Panel>
        <FairnessNote state={state} />
      </div>
      <div className="space-y-4">
        <TablePlayers state={state} />
        <Panel className="p-4 text-sm text-muted">
          <div className="font-semibold text-text">Luật</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Đặt cược trong 7 giây trước khi phóng.</li>
            <li>Hệ số tăng dần từ 1.00x. Bấm Rút trước khi phi thuyền nổ để nhận tiền cược x hệ số.</li>
            <li>Nổ trước khi rút thì mất cược. Có thể đặt tự rút ở một hệ số.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
