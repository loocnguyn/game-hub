'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Shell } from '@/components/TopBar';
import { Button, Field, Panel, Segmented, Spinner, useToast } from '@/components/ui';
import { useRequireAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { gameById } from '@/lib/games';
import { useWhere } from '@/lib/presence';
import { RULES_TEXT } from '@/lib/rulesText';
import { JoinByCode, OpenRooms } from '@/components/room/Lobby';

type Preset = { base: number; inc: number; label: string; group: string };
const CHESS_PRESETS: Preset[] = [
  { base: 1, inc: 0, label: '1+0', group: 'Bullet' }, { base: 2, inc: 1, label: '2+1', group: 'Bullet' },
  { base: 3, inc: 0, label: '3+0', group: 'Blitz' }, { base: 3, inc: 2, label: '3+2', group: 'Blitz' },
  { base: 5, inc: 0, label: '5+0', group: 'Blitz' }, { base: 5, inc: 3, label: '5+3', group: 'Blitz' },
  { base: 10, inc: 0, label: '10+0', group: 'Rapid' }, { base: 10, inc: 5, label: '10+5', group: 'Rapid' },
  { base: 15, inc: 10, label: '15+10', group: 'Rapid' }, { base: 30, inc: 0, label: '30+0', group: 'Classical' },
];
const PRESETS: Record<string, Preset[]> = {
  chess: CHESS_PRESETS,
  xiangqi: [
    { base: 5, inc: 3, label: '5+3', group: 'Nhanh' }, { base: 10, inc: 5, label: '10+5', group: 'Nhanh' },
    { base: 15, inc: 10, label: '15+10', group: 'Chậm' }, { base: 30, inc: 0, label: '30+0', group: 'Chậm' },
  ],
  caro: [
    { base: 1, inc: 2, label: '1+2', group: 'Nhanh' }, { base: 3, inc: 2, label: '3+2', group: 'Nhanh' },
    { base: 5, inc: 3, label: '5+3', group: 'Vừa' }, { base: 10, inc: 0, label: '10+0', group: 'Chậm' },
  ],
  dots: [
    { base: 1, inc: 2, label: '1+2', group: 'Nhanh' }, { base: 3, inc: 2, label: '3+2', group: 'Vừa' }, { base: 5, inc: 0, label: '5+0', group: 'Chậm' },
  ],
};
const COLOR_LABELS: Record<string, [string, string]> = {
  chess: ['Trắng', 'Đen'], xiangqi: ['Đỏ (đi trước)', 'Đen'], caro: ['X (đi trước)', 'O'], dots: ['Đi trước', 'Đi sau'],
};

export default function PlayLobby({ params }: { params: Promise<{ game: string }> }) {
  const { game } = use(params);
  const info = gameById(game);
  const authed = useRequireAuth();
  const router = useRouter();
  const toast = useToast();
  useWhere(info ? `Sảnh ${info.name}` : 'Sảnh');
  const presets = PRESETS[game];
  const [preset, setPreset] = useState(presets ? (game === 'chess' ? 4 : 1) : 0);
  const [color, setColor] = useState<'random' | 'first' | 'second'>('random');
  const [rated, setRated] = useState(true);
  const [caroSize, setCaroSize] = useState(15);
  const [blockTwo, setBlockTwo] = useState(false);
  const [dotsSize, setDotsSize] = useState(4);
  const [startMoney, setStartMoney] = useState(1500);
  const [timeLimit, setTimeLimit] = useState(60);
  const [busy, setBusy] = useState(false);

  if (!info || !['chess', 'xiangqi', 'caro', 'dots', 'tienlen', 'monopoly'].includes(game)) {
    return <Shell><Panel className="mx-auto mt-16 max-w-md p-8 text-center">Không có trò này. <Link className="text-cyan-300 underline" href="/hub">Về sảnh</Link></Panel></Shell>;
  }
  if (!authed) return <Shell><div className="grid min-h-[50vh] place-items-center"><Spinner /></div></Shell>;

  async function create() {
    setBusy(true);
    try {
      let settings: Record<string, unknown> = {};
      if (presets) {
        const p = presets[preset];
        settings = { base: p.base * 60_000, inc: p.inc * 1000, color, rated };
        if (game === 'caro') settings.caro = { size: caroSize, blockTwoEnds: blockTwo };
        if (game === 'dots') settings.dots = { size: dotsSize };
      }
      if (game === 'monopoly') settings = { startMoney, timeLimitMin: timeLimit };
      const r = await api<{ code: string }>('room.create', { game, settings });
      router.push(`/room/${r.code}`);
    } catch (e) {
      toast.err((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl text-4xl text-white" style={{ background: `linear-gradient(135deg, ${info.accent}, ${info.accent2})`, boxShadow: `0 10px 40px -10px ${info.accent}` }}>{info.icon}</div>
        <div>
          <h1 className="font-display text-3xl font-bold">{info.name}</h1>
          <p className="text-muted">{info.tagline}</p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Panel className="p-6">
          <h2 className="font-display text-xl font-bold">Tạo phòng</h2>
          <div className="mt-5 space-y-5">
            {presets && (
              <Field label="Thời gian mỗi bên (phút + giây cộng thêm mỗi nước)">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {presets.map((p, i) => (
                    <button key={p.label} type="button" onClick={() => setPreset(i)}
                      className={clsx('rounded-xl border px-2 py-3 text-center transition', i === preset ? 'border-cyan-400/60 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]')}>
                      <div className="font-display text-lg font-bold">{p.label}</div>
                      <div className="text-[11px] text-muted">{p.group}</div>
                    </button>
                  ))}
                </div>
              </Field>
            )}
            {presets && (
              <Field label="Bạn cầm">
                <Segmented value={color} onChange={setColor} options={[
                  { value: 'random', label: 'Ngẫu nhiên' },
                  { value: 'first', label: COLOR_LABELS[game][0] },
                  { value: 'second', label: COLOR_LABELS[game][1] },
                ]} />
              </Field>
            )}
            {game === 'caro' && (
              <div className="flex flex-wrap gap-5">
                <Field label="Kích thước bàn"><Segmented value={caroSize} onChange={setCaroSize} options={[{ value: 15, label: '15×15' }, { value: 20, label: '20×20' }]} /></Field>
                <Field label="Luật chặn 2 đầu"><Segmented value={blockTwo ? 1 : 0} onChange={(v) => setBlockTwo(v === 1)} options={[{ value: 0, label: 'Không' }, { value: 1, label: 'Có' }]} /></Field>
              </div>
            )}
            {game === 'dots' && (
              <Field label="Số ô mỗi cạnh"><Segmented value={dotsSize} onChange={setDotsSize} options={[3, 4, 5, 6].map((n) => ({ value: n, label: `${n}×${n}` }))} /></Field>
            )}
            {game === 'monopoly' && (
              <div className="flex flex-wrap gap-5">
                <Field label="Tiền khởi đầu"><Segmented value={startMoney} onChange={setStartMoney} options={[1000, 1500, 2000, 3000].map((n) => ({ value: n, label: n.toLocaleString('vi-VN') }))} /></Field>
                <Field label="Giới hạn thời gian"><Segmented value={timeLimit} onChange={setTimeLimit} options={[{ value: 30, label: '30p' }, { value: 45, label: '45p' }, { value: 60, label: '60p' }, { value: 90, label: '90p' }, { value: 0, label: 'Không' }]} /></Field>
              </div>
            )}
            {presets && (
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" checked={rated} onChange={(e) => setRated(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
                <span>Tính rating</span>
              </label>
            )}
            <Button size="lg" className="w-full" loading={busy} onClick={create}>Tạo phòng</Button>
          </div>
        </Panel>
        <div className="space-y-5">
          <JoinByCode />
          <OpenRooms game={game} />
        </div>
      </div>
      {RULES_TEXT[game] && (
        <Panel className="mt-5 p-6">
          <h2 className="font-display text-xl font-bold">Luật chơi</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
            {RULES_TEXT[game].map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </Panel>
      )}
    </Shell>
  );
}
