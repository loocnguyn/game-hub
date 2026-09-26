'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { BETTING_MS, type CasinoGame, type CasinoPublic } from '@shared/casino.ts';
import { api, serverNow } from '@/lib/api';
import { realtimeReady, sb } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar, Button, Panel, formatChips, useToast } from '@/components/ui';

export interface MyBet {
  round: number;
  bets: { key: string; amount: number }[];
  stake: number;
  cashout: number | null;
  auto_cashout: number | null;
  payout: number;
  settled: boolean;
}

export function useCasino(game: CasinoGame) {
  const { setChips } = useAuth();
  const [state, setState] = useState<CasinoPublic | null>(null);
  const [myBet, setMyBet] = useState<MyBet | null>(null);
  const version = useRef(0);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ state: CasinoPublic; version: number; chips: number; myBet: MyBet | null }>('casino.view', { game });
      if (r.version >= version.current) {
        version.current = r.version;
        setState(r.state);
      }
      setChips(r.chips);
      setMyBet(r.myBet);
    } catch (e) {
      toast.err((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, setChips]);

  useEffect(() => {
    refresh();
    const code = `CASINO_${game.toUpperCase()}`;
    let ch: ReturnType<ReturnType<typeof sb>['channel']> | null = null;
    let cancelled = false;
    realtimeReady().then(() => {
      if (cancelled) return;
      ch = sb().channel(`casino:${game}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hub_rooms', filter: `code=eq.${code}` }, (payload) => {
        const row = payload.new as { version: number; state: CasinoPublic };
        if (row.version < version.current) return;
        version.current = row.version;
        setState((old) => {
          // New round or result: refetch my bet + wallet.
          if (old && (old.round !== row.state.round || old.phase !== row.state.phase)) setTimeout(refresh, 250);
          return row.state;
        });
      })
      .subscribe();
    });
    return () => {
      cancelled = true;
      if (ch) sb().removeChannel(ch);
    };
  }, [game, refresh]);

  // Ask the server to advance the round when something falls due.
  useEffect(() => {
    if (!state) return;
    let due: number | null = null;
    if (state.phase === 'betting') due = state.bettingEndsAt;
    else if (state.phase === 'result') due = state.nextRoundAt;
    else if (state.phase === 'running') due = serverNow() + 1500; // crash: fallback poll
    if (due === null) return;
    const id = setTimeout(() => {
      api('casino.tick', { game }).catch(() => {});
    }, Math.max(200, due - serverNow() + 200));
    return () => clearTimeout(id);
  }, [state, game]);

  const bet = useCallback(async (bets: { key: string; amount: number }[], autoCashout?: number) => {
    const r = await api<{ chips: number }>('casino.bet', { game, bets, autoCashout });
    setChips(r.chips);
    await refresh();
  }, [game, refresh, setChips]);

  return { state, myBet, refresh, bet, setMyBet };
}

export const CHIP_VALUES = [10, 50, 100, 500, 1000, 5000];
const CHIP_COLORS: Record<number, string> = { 10: '#64748b', 50: '#2563eb', 100: '#16a34a', 500: '#9333ea', 1000: '#dc2626', 5000: '#d97706' };

export function Chip({ value, active, onClick, small }: { value: number; active?: boolean; onClick?: () => void; small?: boolean }) {
  const col = CHIP_COLORS[value] ?? '#0891b2';
  const label = value >= 1000 ? `${value / 1000}K` : String(value);
  const cls = clsx(
    'grid shrink-0 place-items-center rounded-full font-bold text-white transition',
    small ? 'h-7 w-7 text-[10px]' : 'h-12 w-12 text-xs',
    active ? 'scale-110 ring-4 ring-white/80' : onClick && 'hover:scale-105',
  );
  const style = { background: `repeating-conic-gradient(${col} 0 30deg, #fff 30deg 40deg)`, boxShadow: `0 4px 14px -2px ${col}` };
  const inner = <span className={clsx('grid place-items-center rounded-full', small ? 'h-5 w-5' : 'h-9 w-9')} style={{ background: col }}>{label}</span>;
  // Decorative chips sit inside bet buttons, so they must not be buttons themselves.
  if (!onClick) return <span className={cls} style={style} aria-hidden>{inner}</span>;
  return <button type="button" onClick={onClick} className={cls} style={style} aria-label={`Chip ${label}`}>{inner}</button>;
}

export function ChipSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHIP_VALUES.map((v) => <Chip key={v} value={v} active={v === value} onClick={() => onChange(v)} />)}
    </div>
  );
}

/** Local bet slip: click areas to add chips, then confirm. */
export function useSlip() {
  const [slip, setSlip] = useState<Record<string, number>>({});
  const add = (key: string, amount: number) => setSlip((s) => ({ ...s, [key]: (s[key] || 0) + amount }));
  const clear = () => setSlip({});
  const total = Object.values(slip).reduce((a, b) => a + b, 0);
  const lines = Object.entries(slip).map(([key, amount]) => ({ key, amount }));
  return { slip, add, clear, total, lines };
}

export function PhaseBar({ state }: { state: CasinoPublic }) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(id);
  }, []);
  const betting = state.phase === 'betting';
  const total = BETTING_MS[state.game];
  const left = betting ? Math.max(0, state.bettingEndsAt - now) : 0;
  return (
    <div className="glass flex items-center gap-3 rounded-xl px-4 py-2.5">
      <span className={clsx('rounded-lg px-2 py-0.5 text-xs font-bold uppercase', betting ? 'bg-emerald-500/20 text-emerald-300' : state.phase === 'running' ? 'bg-violet-500/20 text-violet-300' : 'bg-amber-500/20 text-amber-300')}>
        {betting ? 'Đặt cược' : state.phase === 'running' ? 'Đang bay' : 'Kết quả'}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        {betting && <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width] duration-100" style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />}
      </div>
      <span className="font-display w-12 text-right tabular-nums">{betting ? `${Math.ceil(left / 1000)}s` : ''}</span>
      <span className="text-xs text-dim">Ván #{state.round}</span>
    </div>
  );
}

export function TablePlayers({ state }: { state: CasinoPublic }) {
  return (
    <Panel className="p-4">
      <div className="font-display text-lg font-bold">Người đang cược ({state.players.length})</div>
      <ul className="mt-2 max-h-72 space-y-1.5 overflow-auto">
        {state.players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <Avatar name={p.name} size={26} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="text-muted">{formatChips(p.amount)}</span>
            {p.cashout && <span className="text-emerald-300">x{p.cashout.toFixed(2)}</span>}
            {typeof p.payout === 'number' && state.phase === 'result' && (
              <span className={p.payout > 0 ? 'text-emerald-300' : 'text-rose-300'}>{p.payout > 0 ? `+${formatChips(p.payout)}` : '−'}</span>
            )}
          </li>
        ))}
        {!state.players.length && <li className="text-sm text-dim">Chưa ai đặt ván này.</li>}
      </ul>
    </Panel>
  );
}

export function FairnessNote({ state }: { state: CasinoPublic }) {
  return (
    <details className="glass rounded-xl px-4 py-2 text-xs text-muted">
      <summary className="cursor-pointer">Kiểm tra công bằng</summary>
      <div className="mt-2 break-all">Hash seed ván này: <span className="font-mono">{state.seedHash}</span></div>
      {state.revealed && <div className="mt-1 break-all">Ván #{state.revealed.round}: seed <span className="font-mono">{state.revealed.seed}</span> (SHA-256 = <span className="font-mono">{state.revealed.hash}</span>)</div>}
      <div className="mt-1">Kết quả = HMAC-SHA256(seed, &quot;tên game:số ván&quot;). Seed được công bố sau khi ván kết thúc.</div>
    </details>
  );
}

export function SlipBar({ total, onConfirm, onClear, disabled, busy }: { total: number; onConfirm: () => void; onClear: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">Đang chọn: <b className="text-text">{formatChips(total)}</b></span>
      <Button size="sm" variant="ghost" onClick={onClear} disabled={!total}>Xóa</Button>
      <Button size="sm" variant="gold" onClick={onConfirm} disabled={disabled || !total} loading={busy}>Đặt cược</Button>
    </div>
  );
}
