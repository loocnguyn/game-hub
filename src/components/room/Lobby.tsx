'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Avatar, Button, inputClass, Panel, Spinner } from '@/components/ui';
import { sb } from '@/lib/supabase';

interface OpenRoom {
  code: string;
  game: string;
  state: any;
  updated_at: string;
}

function roomSummary(r: OpenRoom): string {
  const s = r.state;
  if (s.kind === 'board') return `${s.settings.base / 60000} phút + ${s.settings.inc / 1000}s${s.settings.rated ? ' · rating' : ''}`;
  if (s.kind === 'tetris') return s.settings.mode === 'blitz' ? `Tính giờ ${s.settings.duration / 60} phút` : `Hạ gục, chạm ${s.settings.firstTo}`;
  if (s.kind === 'tienlen') return `${s.seats.filter(Boolean).length}/4 người`;
  if (s.kind === 'monopoly') return `${s.players.length}/6 người · ${s.settings.timeLimitMin ? s.settings.timeLimitMin + ' phút' : 'không giới hạn'}`;
  return '';
}
function roomHost(r: OpenRoom): string {
  const s = r.state;
  return s.seats?.find(Boolean)?.name ?? s.players?.[0]?.name ?? '?';
}

export function OpenRooms({ game }: { game: string }) {
  const [rooms, setRooms] = useState<OpenRoom[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await sb().from('hub_rooms').select('code, game, state, updated_at').eq('game', game).eq('status', 'waiting').order('updated_at', { ascending: false }).limit(20);
      if (alive) setRooms((data as OpenRoom[]) ?? []);
    };
    load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [game]);
  return (
    <Panel className="p-5">
      <h3 className="font-display text-lg font-bold">Phòng đang chờ</h3>
      {rooms === null ? <Spinner className="mt-4 h-5 w-5" /> : !rooms.length ? (
        <p className="mt-3 text-sm text-muted">Chưa có phòng nào. Tạo một phòng đi.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rooms.map((r) => (
            <li key={r.code}>
              <Link href={`/room/${r.code}`} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 transition hover:border-cyan-400/30 hover:bg-white/[0.06]">
                <Avatar name={roomHost(r)} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{roomHost(r)}</div>
                  <div className="truncate text-xs text-muted">{roomSummary(r)}</div>
                </div>
                <span className="font-mono text-sm text-cyan-200">{r.code}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function JoinByCode() {
  const [code, setCode] = useState('');
  const router = useRouter();
  return (
    <Panel className="p-5">
      <h3 className="font-display text-lg font-bold">Vào bằng mã</h3>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) router.push(`/room/${code.trim().toUpperCase()}`); }}>
        <input className={clsx(inputClass, 'font-mono uppercase tracking-widest')} value={code} maxLength={8} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" />
        <Button>Vào</Button>
      </form>
    </Panel>
  );
}

