'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Shell } from '@/components/TopBar';
import { Avatar, Panel, Segmented, Spinner, formatChips } from '@/components/ui';
import { LeaderboardPanel } from '@/components/Leaderboard';
import { useAuth, useRequireAuth } from '@/lib/auth';
import { useWhere } from '@/lib/presence';
import { sb } from '@/lib/supabase';

const RATING_CATS = [
  { id: 'chess_bullet', label: 'Cờ vua Bullet' },
  { id: 'chess_blitz', label: 'Cờ vua Blitz' },
  { id: 'chess_rapid', label: 'Cờ vua Rapid' },
  { id: 'chess_classical', label: 'Cờ vua Classical' },
  { id: 'xiangqi', label: 'Cờ tướng' },
  { id: 'caro', label: 'Caro' },
  { id: 'dots', label: 'Dots and Boxes' },
  { id: 'tetris_vs', label: 'Tetris 1v1' },
];

interface RatingRow { user_id: string; rating: number; rd: number; games: number; wins: number; losses: number; draws: number; name?: string }

function Ratings() {
  const [cat, setCat] = useState('chess_blitz');
  const [rows, setRows] = useState<RatingRow[] | null>(null);
  const { profile } = useAuth();
  useEffect(() => {
    let alive = true;
    setRows(null);
    (async () => {
      const { data } = await sb().from('hub_ratings').select('user_id, rating, rd, games, wins, losses, draws').eq('category', cat).order('rating', { ascending: false }).limit(50);
      const list = (data as RatingRow[]) ?? [];
      if (list.length) {
        const { data: names } = await sb().from('hub_profiles').select('id, name').in('id', list.map((r) => r.user_id));
        for (const r of list) r.name = names?.find((n) => n.id === r.user_id)?.name ?? '?';
      }
      if (alive) setRows(list);
    })();
    return () => { alive = false; };
  }, [cat]);
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap gap-2">
        {RATING_CATS.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={clsx('rounded-full px-3 py-1.5 text-sm', cat === c.id ? 'bg-white text-black' : 'bg-white/5 text-muted hover:text-text')}>{c.label}</button>
        ))}
      </div>
      {rows === null ? <Spinner className="mt-4" /> : !rows.length ? <p className="mt-4 text-sm text-muted">Chưa có ván tính rating nào.</p> : (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-dim">
            <tr><th className="w-10 py-2">#</th><th>Người chơi</th><th className="text-right">Rating</th><th className="text-right">Ván</th><th className="hidden text-right sm:table-cell">T / H / B</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.user_id} className={clsx('border-t border-white/5', r.user_id === profile?.id && 'bg-cyan-400/10')}>
                <td className="py-2 font-display font-bold text-dim">{i + 1}</td>
                <td><div className="flex items-center gap-2"><Avatar name={r.name ?? '?'} size={26} />{r.name}</div></td>
                <td className="text-right font-display font-bold">{Math.round(r.rating)}{r.rd > 110 && <span className="text-dim">?</span>}</td>
                <td className="text-right">{r.games}</td>
                <td className="hidden text-right text-muted sm:table-cell">{r.wins} / {r.draws} / {r.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Richest() {
  const [rows, setRows] = useState<{ user_id: string; chips: number; name?: string }[] | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await sb().from('hub_wallets').select('user_id, chips').order('chips', { ascending: false }).limit(30);
      const list = (data as { user_id: string; chips: number; name?: string }[]) ?? [];
      if (list.length) {
        const { data: names } = await sb().from('hub_profiles').select('id, name').in('id', list.map((r) => r.user_id));
        for (const r of list) r.name = names?.find((n) => n.id === r.user_id)?.name ?? '?';
      }
      setRows(list);
    })();
  }, []);
  return (
    <Panel className="p-5">
      <h3 className="font-display text-lg font-bold">Nhiều chip nhất</h3>
      {rows === null ? <Spinner className="mt-4" /> : (
        <ol className="mt-3 space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.user_id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-2.5 py-1.5">
              <span className="w-6 text-center font-display font-bold text-dim">{i + 1}</span>
              <Avatar name={r.name ?? '?'} size={26} />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="font-display font-bold text-amber-200">{formatChips(r.chips)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export default function LeaderboardPage() {
  const authed = useRequireAuth();
  useWhere('Xem bảng xếp hạng');
  const [tab, setTab] = useState<'solo' | 'rating' | 'chips'>('solo');
  const [ms, setMs] = useState('beginner');
  const [sd, setSd] = useState('easy');
  if (!authed) return <Shell><div className="grid min-h-[50vh] place-items-center"><Spinner /></div></Shell>;
  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-bold">Bảng xếp hạng</h1>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'solo', label: 'Game đơn' }, { value: 'rating', label: 'Rating đối kháng' }, { value: 'chips', label: 'Chip' }]} />
      </div>
      {tab === 'solo' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <LeaderboardPanel game="tetris" mode="infinity" title="Tetris vô tận" extra={(r) => <span className="text-xs text-dim">{String(r.meta?.lines ?? '')} hàng</span>} />
          <LeaderboardPanel game="2048" mode="classic" title="2048" extra={(r) => <span className="text-xs text-dim">ô {String(r.meta?.best ?? '')}</span>} />
          <div className="space-y-2">
            <Segmented value={ms} onChange={setMs} options={[{ value: 'beginner', label: 'Dễ' }, { value: 'intermediate', label: 'Vừa' }, { value: 'expert', label: 'Khó' }]} />
            <LeaderboardPanel game="minesweeper" mode={ms} lowerIsBetter title="Dò mìn" />
          </div>
          <div className="space-y-2">
            <Segmented value={sd} onChange={setSd} options={[{ value: 'easy', label: 'Dễ' }, { value: 'medium', label: 'Trung bình' }, { value: 'hard', label: 'Khó' }, { value: 'expert', label: 'Chuyên gia' }]} />
            <LeaderboardPanel game="sudoku" mode={sd} lowerIsBetter title="Sudoku" />
          </div>
        </div>
      )}
      {tab === 'rating' && <Ratings />}
      {tab === 'chips' && <Richest />}
    </Shell>
  );
}
