'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { sb } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar, Panel, Segmented, Spinner, formatMs } from './ui';

export interface LbRow {
  user_id: string;
  name: string;
  username: string;
  score: number;
  time_ms: number | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export function useLeaderboard(game: string, mode: string, period: 'all' | 'week' | 'day', lowerIsBetter: boolean, reloadKey = 0) {
  const [rows, setRows] = useState<LbRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    const since = period === 'all' ? null : new Date(Date.now() - (period === 'week' ? 7 : 1) * 86400_000).toISOString();
    sb().rpc('hub_leaderboard', { p_game: game, p_mode: mode, p_since: since, p_limit: 50, p_lower_is_better: lowerIsBetter })
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) setError(e.message);
        else setRows((data as LbRow[]) ?? []);
      });
    return () => { alive = false; };
  }, [game, mode, period, lowerIsBetter, reloadKey]);
  return { rows, error };
}

export function LeaderboardPanel({
  game, mode, lowerIsBetter = false, title = 'Bảng xếp hạng', reloadKey, extra, className,
}: {
  game: string; mode: string; lowerIsBetter?: boolean; title?: string; reloadKey?: number;
  extra?: (r: LbRow) => React.ReactNode; className?: string;
}) {
  const [period, setPeriod] = useState<'all' | 'week' | 'day'>('all');
  const { rows, error } = useLeaderboard(game, mode, period, lowerIsBetter, reloadKey);
  const { profile } = useAuth();
  return (
    <Panel className={clsx('p-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'day', label: 'Hôm nay' }, { value: 'week', label: 'Tuần' }, { value: 'all', label: 'Mọi lúc' }]} />
      </div>
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : rows === null ? <Spinner className="mt-4 h-5 w-5" /> : !rows.length ? (
        <p className="mt-4 text-sm text-muted">Chưa có ai. Chơi một ván để lên bảng.</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.user_id} className={clsx('flex items-center gap-3 rounded-xl px-2.5 py-1.5', r.user_id === profile?.id ? 'bg-accent/10 ring-1 ring-accent/30' : 'bg-white/[0.03]')}>
              <span className={clsx('font-display w-7 text-center font-bold', i === 0 ? 'text-amber-300' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-dim')}>{i + 1}</span>
              <Avatar name={r.name} size={28} />
              <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
              {extra?.(r)}
              <span className="font-display font-bold tabular-nums text-accent">
                {lowerIsBetter ? formatMs(r.time_ms ?? 0, true) : Number(r.score).toLocaleString('vi-VN')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
