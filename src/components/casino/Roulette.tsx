'use client';
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { RED, WHEEL } from '@shared/casino.ts';
import { sfx } from '@/lib/sfx';
import { Panel, Spinner, formatChips, useToast } from '@/components/ui';
import { Chip, ChipSelector, FairnessNote, PhaseBar, SlipBar, TablePlayers, useCasino, useSlip } from './common';

const colorOf = (n: number) => (n === 0 ? '#16a34a' : RED.has(n) ? '#dc2626' : '#111827');

function Wheel({ result, round }: { result: number | null; round: number }) {
  const [angle, setAngle] = useState(0);
  const [ball, setBall] = useState(0);
  const seg = 360 / WHEEL.length;
  const lastRound = useRef(-1);
  useEffect(() => {
    if (result === null || lastRound.current === round) return;
    lastRound.current = round;
    const idx = WHEEL.indexOf(result);
    // wheel spins 5 turns; ball ends at the top pointing at the winning pocket
    setAngle((a) => a - (a % 360) - 360 * 5 - idx * seg);
    setBall((b) => b + 360 * 7);
    sfx.reveal();
  }, [result, round, seg]);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px]">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-700 to-amber-950 p-3 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)]">
        <svg viewBox="-100 -100 200 200" className="h-full w-full" style={{ transform: `rotate(${angle}deg)`, transition: result !== null ? 'transform 6s cubic-bezier(0.16, 1, 0.3, 1)' : 'none' }}>
          {WHEEL.map((n, i) => {
            const a0 = ((i - 0.5) * seg - 90) * (Math.PI / 180), a1 = ((i + 0.5) * seg - 90) * (Math.PI / 180);
            const R = 96, r = 60;
            const d = `M ${r * Math.cos(a0)} ${r * Math.sin(a0)} L ${R * Math.cos(a0)} ${R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} L ${r * Math.cos(a1)} ${r * Math.sin(a1)} A ${r} ${r} 0 0 0 ${r * Math.cos(a0)} ${r * Math.sin(a0)}`;
            const am = (i * seg - 90) * (Math.PI / 180);
            return (
              <g key={n}>
                <path d={d} fill={colorOf(n)} stroke="#d4af37" strokeWidth={0.6} />
                <text x={84 * Math.cos(am)} y={84 * Math.sin(am)} fill="#fff" fontSize={7} fontWeight={700} textAnchor="middle" dominantBaseline="central" transform={`rotate(${i * seg} ${84 * Math.cos(am)} ${84 * Math.sin(am)})`}>{n}</text>
              </g>
            );
          })}
          <circle r={58} fill="#3f2a14" stroke="#d4af37" strokeWidth={1.5} />
          {[0, 45, 90, 135].map((a) => <rect key={a} x={-3} y={-52} width={6} height={104} rx={3} fill="#d4af37" transform={`rotate(${a})`} />)}
          <circle r={12} fill="#d4af37" />
        </svg>
      </div>
      <div className="pointer-events-none absolute inset-0" style={{ transform: `rotate(${ball}deg)`, transition: result !== null ? 'transform 6s cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none' }}>
        <div className="absolute left-1/2 top-[7%] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
      </div>
      <div className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[9px] border-t-[16px] border-x-transparent border-t-amber-300 drop-shadow" />
    </div>
  );
}

export default function Roulette() {
  const { state, myBet, bet } = useCasino('roulette');
  const { slip, add, clear, total, lines } = useSlip();
  const [chip, setChip] = useState(100);
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState<number[] | null>(null);
  const toast = useToast();

  // New round: drop the unconfirmed slip.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.phase === 'betting') clear(); }, [state?.round, state?.phase]);

  if (!state) return <div className="grid min-h-[50vh] place-items-center"><Spinner /></div>;
  const betting = state.phase === 'betting';
  const mine: Record<string, number> = {};
  if (myBet && myBet.round === state.round) for (const b of myBet.bets) mine[b.key] = (mine[b.key] || 0) + b.amount;
  const place = (k: string) => { if (!betting) return; sfx.chip(); add(k, chip); };
  const amt = (k: string) => (slip[k] || 0) + (mine[k] || 0);
  const num = state.result?.number ?? null;

  // Table: 12 columns x 3 rows. Row 0 shows 3,6,..36 (top), row 2 shows 1,4,..34.
  const numberAt = (col: number, row: number) => col * 3 + (3 - row);
  const CW = 100 / 12, RH = 100 / 3;
  const hotspots: { key: string; nums: number[]; x: number; y: number; w: number; h: number }[] = [];
  for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) {
    const n = numberAt(col, row);
    if (col < 11) hotspots.push({ key: `split:${n}-${n + 3}`, nums: [n, n + 3], x: (col + 1) * CW - 1.2, y: row * RH + 8, w: 2.4, h: RH - 16 });
    if (row < 2) hotspots.push({ key: `split:${n - 1}-${n}`, nums: [n - 1, n], x: col * CW + 2, y: (row + 1) * RH - 5, w: CW - 4, h: 10 });
    if (row < 2 && col < 11) hotspots.push({ key: `corner:${n - 1}`, nums: [n - 1, n, n + 2, n + 3], x: (col + 1) * CW - 1.6, y: (row + 1) * RH - 6, w: 3.2, h: 12 });
  }
  for (let col = 0; col < 12; col++) {
    const first = col * 3 + 1;
    hotspots.push({ key: `street:${first}`, nums: [first, first + 1, first + 2], x: col * CW + 2, y: 94, w: CW - 4, h: 8 });
    if (col < 11) hotspots.push({ key: `line:${first}`, nums: [first, first + 1, first + 2, first + 3, first + 4, first + 5], x: (col + 1) * CW - 1.6, y: 92, w: 3.2, h: 10 });
  }

  const outside = (k: string, label: React.ReactNode, cls: string) => (
    <button key={k} disabled={!betting} onClick={() => place(k)} className={clsx('relative rounded-lg border border-amber-200/30 py-2 text-sm font-bold transition hover:brightness-125 disabled:cursor-not-allowed', cls)}>
      {label}
      {amt(k) > 0 && <span className="absolute -right-1 -top-2"><Chip value={100} small /></span>}
    </button>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <PhaseBar state={state} />
        <div className="grid items-center gap-5 lg:grid-cols-[340px_1fr]">
          <div>
            <Wheel result={state.phase === 'result' ? num : null} round={state.round} />
            {state.phase === 'result' && num !== null && (
              <div className="mt-3 text-center"><span className="font-display rounded-xl px-5 py-2 text-3xl font-bold text-white" style={{ background: colorOf(num) }}>{num}</span></div>
            )}
          </div>
          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {state.history.map((h) => <span key={h.round} className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white" style={{ background: colorOf(h.number!) }}>{h.number}</span>)}
            </div>
            <Panel className="bg-[#0b4a2b] p-3">
              <div className="grid grid-cols-[48px_1fr_48px] gap-1">
                <button disabled={!betting} onClick={() => place('n:0')} className="relative rounded-l-2xl bg-green-600 font-display text-xl font-bold hover:brightness-125">
                  0{amt('n:0') > 0 && <span className="absolute right-0 top-1"><Chip value={100} small /></span>}
                </button>
                <div className="relative">
                  <div className="grid grid-cols-12 grid-rows-3 gap-1">
                    {[0, 1, 2].flatMap((row) => Array.from({ length: 12 }, (_, col) => {
                      const n = numberAt(col, row);
                      const lit = hot?.includes(n);
                      return (
                        <button key={n} disabled={!betting} onClick={() => place(`n:${n}`)}
                          className={clsx('relative aspect-[4/5] rounded font-display text-sm font-bold text-white transition hover:brightness-150 sm:text-base', lit && 'ring-2 ring-amber-300', num === n && state.phase === 'result' && 'ring-4 ring-white')}
                          style={{ background: colorOf(n) }}>
                          {n}
                          {amt(`n:${n}`) > 0 && <span className="absolute -right-1 -top-1"><Chip value={100} small /></span>}
                        </button>
                      );
                    }))}
                  </div>
                  {/* split / corner / street / line hotspots */}
                  <div className="pointer-events-none absolute inset-0">
                    {hotspots.map((h) => (
                      <button key={h.key} disabled={!betting} onClick={() => place(h.key)} onMouseEnter={() => setHot(h.nums)} onMouseLeave={() => setHot(null)}
                        className="pointer-events-auto absolute rounded-sm hover:bg-amber-300/40"
                        style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%` }} title={h.key}>
                        {amt(h.key) > 0 && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"><Chip value={100} small /></span>}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-rows-3 gap-1">
                  {[3, 2, 1].map((c) => outside(`col:${c}`, '2:1', 'bg-emerald-800 text-xs'))}
                </div>
              </div>
              <div className="mt-1 ml-[52px] mr-[52px] grid grid-cols-3 gap-1">
                {outside('dozen:1', '1–12', 'bg-emerald-800')}
                {outside('dozen:2', '13–24', 'bg-emerald-800')}
                {outside('dozen:3', '25–36', 'bg-emerald-800')}
              </div>
              <div className="mt-1 ml-[52px] mr-[52px] grid grid-cols-6 gap-1">
                {outside('low', '1–18', 'bg-emerald-800')}
                {outside('even', 'Chẵn', 'bg-emerald-800')}
                {outside('red', <span className="inline-block h-4 w-4 rotate-45 bg-red-600" />, 'bg-emerald-800')}
                {outside('black', <span className="inline-block h-4 w-4 rotate-45 bg-gray-900" />, 'bg-emerald-800')}
                {outside('odd', 'Lẻ', 'bg-emerald-800')}
                {outside('high', '19–36', 'bg-emerald-800')}
              </div>
            </Panel>
            <p className="mt-2 text-xs text-dim">Bấm vào số để cược thẳng (1 ăn 35). Bấm vào đường giữa 2 số để cược đôi (1 ăn 17), góc 4 số (1 ăn 8), mép dưới để cược hàng 3 số (1 ăn 11) hoặc 6 số (1 ăn 5).</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChipSelector value={chip} onChange={setChip} />
          <SlipBar total={total} onClear={clear} disabled={!betting} busy={busy} onConfirm={async () => {
            setBusy(true);
            try { await bet(lines); clear(); sfx.chip(); } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); }
          }} />
        </div>
        {myBet && myBet.round === state.round && (
          <div className="text-sm text-muted">Cược ván này: <b className="text-text">{formatChips(myBet.stake)}</b>
            {state.phase === 'result' && myBet.settled && <span className={clsx('ml-2', myBet.payout > 0 ? 'text-emerald-300' : 'text-rose-300')}>{myBet.payout > 0 ? `Thắng ${formatChips(myBet.payout)}` : 'Thua'}</span>}
          </div>
        )}
        <FairnessNote state={state} />
      </div>
      <TablePlayers state={state} />
    </div>
  );
}
