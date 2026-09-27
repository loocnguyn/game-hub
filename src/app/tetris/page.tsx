'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/TopBar';
import { Button, Field, Modal, Panel, Segmented, Spinner, useToast } from '@/components/ui';
import { LeaderboardPanel } from '@/components/Leaderboard';
import { JoinByCode, OpenRooms } from '@/components/room/Lobby';
import { useRequireAuth } from '@/lib/auth';
import { useWhere } from '@/lib/presence';
import { api } from '@/lib/api';
import { sfx } from '@/lib/sfx';
import { GameBanner } from '@/components/GameBanner';
import { gameById } from '@/lib/games';
import { useTetrisLoop } from '@/components/games/tetris/useTetrisLoop';
import { Playfield, popupFor } from '@/components/games/tetris/Playfield';
import { TetrisSettings } from '@/components/games/tetris/SettingsModal';
import { keyLabel, loadHandling, loadKeys, loadRender, toFrames } from '@/components/games/tetris/controls';
import { A, encodeInputs, type EngineOptions, type InputEvent, type TetrisEngine, type TetrisEvent } from '@shared/tetris.ts';
import { randomSeed } from '@shared/rng.ts';

type Phase = 'menu' | 'loading' | 'playing' | 'over';

interface Result {
  score: number;
  lines: number;
  level: number;
  ms: number;
  saved: 'saving' | 'ok' | 'error' | 'offline';
  message?: string;
}

function SoloGame({ onExit }: { onExit: () => void }) {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('loading');
  const [opts, setOpts] = useState<EngineOptions | null>(null);
  const [session, setSession] = useState<{ id: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [popup, setPopup] = useState<{ id: number; text: string; sub?: string; color: string } | null>(null);
  const [render, setRender] = useState<'3d' | '2d'>('3d');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lbKey, setLbKey] = useState(0);
  const sceneEvents = useRef<TetrisEvent[]>([]);
  const lastLevel = useRef(1);

  const start = useCallback(async () => {
    setPhase('loading');
    setResult(null);
    setPaused(false);
    const handling = toFrames(loadHandling());
    setRender(loadRender().mode);
    try {
      const s = await api<{ id: string; seed: number }>('solo.start', { game: 'tetris', mode: 'infinity' });
      setSession({ id: s.id });
      setOpts({ seed: s.seed, mode: 'infinity', handling });
    } catch (e) {
      toast.err(`Không kết nối được máy chủ, ván này sẽ không được lưu điểm (${(e as Error).message})`);
      setSession(null);
      setOpts({ seed: randomSeed(), mode: 'infinity', handling });
    }
    lastLevel.current = 1;
    setPhase('playing');
  }, [toast]);

  useEffect(() => { start(); }, [start]);

  const finish = useCallback(async (eng: TetrisEngine, inputLog: InputEvent[]) => {
    setPhase('over');
    const r: Result = { score: eng.score, lines: eng.lines, level: eng.level, ms: Math.round((eng.frame / 60) * 1000), saved: session ? 'saving' : 'offline' };
    setResult(r);
    if (!session) return;
    try {
      await api('solo.submit', {
        id: session.id, inputs: encodeInputs(inputLog), frames: eng.frame, handling: eng.handling, score: eng.score, lines: eng.lines,
      });
      setResult({ ...r, saved: 'ok' });
      setLbKey((k) => k + 1);
    } catch (e) {
      setResult({ ...r, saved: 'error', message: (e as Error).message });
    }
  }, [session]);

  const onEvents = useCallback((events: TetrisEvent[], eng: TetrisEngine, inputLog: InputEvent[]) => {
    sceneEvents.current.push(...events);
    for (const e of events) {
      switch (e.t) {
        case 'move': sfx.move(); break;
        case 'rotate': sfx.rotate(); break;
        case 'hold': sfx.hold(); break;
        case 'harddrop': sfx.drop(); break;
        case 'lock': sfx.lock(); break;
        case 'clear':
          if (e.lines === 4) sfx.tetris(); else if (e.tspin) sfx.tspin(); else sfx.clear(e.lines);
          break;
        case 'tspin': sfx.tspin(); break;
        case 'level': sfx.levelUp(); break;
        case 'over': sfx.gameOver(); break;
      }
      const p = popupFor(e);
      if (p) setPopup({ id: Date.now() + Math.random(), ...p });
      if (e.t === 'level') setPopup({ id: Date.now(), text: `LEVEL ${e.level}`, color: '#a78bfa' });
    }
    if (eng.over) finish(eng, inputLog);
  }, [finish]);

  const loop = useTetrisLoop({ options: opts, paused: paused || phase !== 'playing', onEvents });

  useEffect(() => {
    if (!popup) return;
    const id = setTimeout(() => setPopup(null), 1300);
    return () => clearTimeout(id);
  }, [popup]);

  // Pause with Esc/P, auto-pause when the tab loses focus.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (phase !== 'playing') return;
      if (e.code === 'Escape' || e.code === 'KeyP') setPaused((p) => !p);
    };
    const blur = () => phase === 'playing' && setPaused(true);
    window.addEventListener('keydown', k);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('blur', blur); };
  }, [phase]);

  const overlay = phase === 'loading' ? <Spinner className="h-8 w-8 text-accent" />
    : paused ? (
      <div className="text-center">
        <div className="font-display text-3xl font-bold">Tạm dừng</div>
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={() => setPaused(false)}>Chơi tiếp</Button>
          <Button variant="ghost" onClick={() => setSettingsOpen(true)}>Cài đặt</Button>
          <Button variant="ghost" onClick={onExit}>Thoát</Button>
        </div>
      </div>
    ) : phase === 'over' && result ? (
      <div className="w-64 text-center">
        <div className="font-display text-3xl font-bold text-rose-300">Hết game</div>
        <div className="font-display mt-3 text-4xl font-black text-accent">{result.score.toLocaleString('vi-VN')}</div>
        <div className="mt-1 text-sm text-muted">{result.lines} hàng · level {result.level} · {Math.floor(result.ms / 60000)}:{String(Math.floor((result.ms % 60000) / 1000)).padStart(2, '0')}</div>
        <div className="mt-3 text-sm">
          {result.saved === 'saving' && <span className="text-muted">Đang lưu điểm…</span>}
          {result.saved === 'ok' && <span className="text-emerald-300">Đã lưu vào bảng xếp hạng</span>}
          {result.saved === 'error' && <span className="text-rose-300">Không lưu được: {result.message}</span>}
          {result.saved === 'offline' && <span className="text-amber-300">Ván chơi không kết nối, không lưu điểm</span>}
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={start}>Chơi lại</Button>
          <Button variant="ghost" onClick={onExit}>Về menu</Button>
        </div>
      </div>
    ) : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div>
        <Playfield engine={loop.engine} version={loop.version} mode={render} eventsForScene={sceneEvents} popup={popup} overlay={overlay} />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
          <Button size="sm" variant="ghost" onClick={() => setPaused(true)} disabled={phase !== 'playing'}>Tạm dừng (Esc)</Button>
          <Button size="sm" variant="ghost" onClick={() => { setPaused(true); setSettingsOpen(true); }}>Cài đặt</Button>
          <span className="hidden sm:inline">Phím: {keyLabel(loadKeys()[A.LEFT][0])}{keyLabel(loadKeys()[A.RIGHT][0])} di chuyển · {keyLabel(loadKeys()[A.CW][0])} xoay · {keyLabel(loadKeys()[A.HARD][0])} thả · {keyLabel(loadKeys()[A.HOLD][0])} giữ · Chuột: bấm trái thả, giữ trái rơi nhanh, phải xoay</span>
        </div>
      </div>
      <LeaderboardPanel game="tetris" mode="infinity" title="Top vô tận" reloadKey={lbKey} extra={(r) => <span className="text-xs text-dim">{String(r.meta?.lines ?? '')} hàng</span>} />
      <TetrisSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => { setRender(loadRender().mode); toast.info('Cài đặt mới áp dụng từ ván sau'); }} />
    </div>
  );
}

function VersusCreate() {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<'blitz' | 'survival'>('blitz');
  const [duration, setDuration] = useState(120);
  const [firstTo, setFirstTo] = useState(2);
  const [rated, setRated] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Panel className="p-6">
      <h2 className="font-display text-xl font-bold">Đấu 1v1</h2>
      <div className="mt-4 space-y-4">
        <Field label="Chế độ">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'blitz', label: 'Tính giờ (đếm KO)' }, { value: 'survival', label: 'Hạ gục (chết là thua ván)' }]} />
        </Field>
        {mode === 'blitz' ? (
          <Field label="Thời gian">
            <Segmented value={duration} onChange={setDuration} options={[60, 120, 180, 300].map((d) => ({ value: d, label: `${d / 60} phút` }))} />
          </Field>
        ) : (
          <Field label="Thắng mấy ván thì thắng trận">
            <Segmented value={firstTo} onChange={setFirstTo} options={[1, 2, 3, 5].map((d) => ({ value: d, label: `${d}` }))} />
          </Field>
        )}
        <label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={rated} onChange={(e) => setRated(e.target.checked)} className="h-5 w-5 accent-cyan-400" /> Tính rating</label>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Hai người nhận cùng thứ tự khối. Xóa hàng thì gửi hàng rác sang đối thủ (Double 1, Triple 2, Tetris 4, T-spin Double 4…, có cộng combo và back-to-back).</li>
          <li>Rác đang tới có thể bị triệt tiêu bằng cách xóa hàng trước khi nó dâng lên.</li>
          <li>{mode === 'blitz' ? 'Bị tràn thì đối thủ được 1 KO và bàn của bạn được làm mới. Hết giờ ai nhiều KO hơn thắng, bằng thì so rác đã gửi rồi tới điểm.' : 'Bị tràn là thua ván. Sau 60 giây mỗi ván, rác gửi đi tăng dần để ván không kéo dài.'}</li>
        </ul>
        <Button size="lg" className="w-full" loading={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ code: string }>('room.create', { game: 'tetris', settings: { mode, duration, firstTo, rated } });
            router.push(`/room?code=${r.code}`);
          } catch (e) {
            toast.err((e as Error).message);
            setBusy(false);
          }
        }}>Tạo phòng 1v1</Button>
      </div>
    </Panel>
  );
}

export default function TetrisPage() {
  const authed = useRequireAuth();
  const [playing, setPlaying] = useState(false);
  useWhere(playing ? 'Đang chơi Tetris' : 'Sảnh Tetris');
  const keys = useMemo(() => (typeof window !== 'undefined' ? loadKeys() : null), []);
  const [help, setHelp] = useState(false);

  if (!authed) return <Shell><div className="grid min-h-[50vh] place-items-center"><Spinner /></div></Shell>;
  if (playing) return <Shell wide><SoloGame onExit={() => setPlaying(false)} /></Shell>;

  return (
    <Shell>
      <GameBanner game={gameById('tetris')!} subtitle="Chơi vô tận tới khi chán, hoặc đấu 1v1 với bạn bè.">
        <Button variant="ghost" onClick={() => setHelp(true)}>Cách chơi</Button>
      </GameBanner>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <Panel className="relative overflow-hidden p-6">
            <h2 className="font-display text-xl font-bold">Chơi vô tận</h2>
            <p className="mt-1 text-sm text-muted">Tốc độ tăng mỗi 10 hàng (tối đa ở level 15). Chơi tới khi tràn thì thôi. Điểm được kiểm tra lại trên máy chủ trước khi lên bảng.</p>
            <Button size="lg" className="mt-5" onClick={() => setPlaying(true)}>Bắt đầu</Button>
          </Panel>
          <VersusCreate />
          <div className="grid gap-5 md:grid-cols-2">
            <JoinByCode />
            <OpenRooms game="tetris" />
          </div>
        </div>
        <LeaderboardPanel game="tetris" mode="infinity" title="Top vô tận" extra={(r) => <span className="text-xs text-dim">{String(r.meta?.lines ?? '')} hàng</span>} />
      </div>
      <Modal open={help} onClose={() => setHelp(false)} title="Cách chơi">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>Luật theo chuẩn Tetris hiện đại: xoay SRS, túi 7 khối, giữ khối, khối bóng, T-spin.</li>
          {keys && <li>Phím mặc định: {keyLabel(keys[A.LEFT][0])}/{keyLabel(keys[A.RIGHT][0])} di chuyển, {keyLabel(keys[A.SOFT][0])} rơi nhanh, {keyLabel(keys[A.HARD][0])} thả, {keyLabel(keys[A.CW][0])} / {keyLabel(keys[A.CCW][0])} xoay, {keyLabel(keys[A.R180][0])} xoay 180°, {keyLabel(keys[A.HOLD][0])} giữ.</li>}
          <li>Chuột: bấm chuột trái để thả thẳng xuống, giữ chuột trái để khối rơi nhanh, chuột phải để xoay.</li>
          <li>Điểm: Single 100, Double 300, Triple 500, Tetris 800, T-spin Double 1200… nhân với level. Back-to-back x1.5, combo +50 x combo x level.</li>
          <li>Đổi phím và độ nhạy (DAS/ARR) trong Cài đặt lúc đang chơi.</li>
        </ul>
      </Modal>
    </Shell>
  );
}
