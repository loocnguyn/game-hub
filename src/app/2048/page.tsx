'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Shell } from '@/components/TopBar';
import { Button, Spinner, useToast } from '@/components/ui';
import { LeaderboardPanel } from '@/components/Leaderboard';
import { useRequireAuth } from '@/lib/auth';
import { useWhere } from '@/lib/presence';
import { api } from '@/lib/api';
import { sfx } from '@/lib/sfx';
import { Game2048, SIZE, type Dir, type Tile } from '@shared/g2048.ts';
import { randomSeed } from '@shared/rng.ts';

const TILE_STYLE: Record<number, [string, string]> = {
  2: ['#1e293b', '#e2e8f0'], 4: ['#233554', '#e2e8f0'], 8: ['#0e7490', '#fff'], 16: ['#0891b2', '#fff'], 32: ['#7c3aed', '#fff'],
  64: ['#9333ea', '#fff'], 128: ['#db2777', '#fff'], 256: ['#e11d48', '#fff'], 512: ['#ea580c', '#fff'], 1024: ['#d97706', '#fff'], 2048: ['#facc15', '#111'],
};
const styleFor = (v: number) => TILE_STYLE[v] ?? ['#fde047', '#111'];

export default function Page2048() {
  const authed = useRequireAuth();
  useWhere('Đang chơi 2048');
  const toast = useToast();
  const [game, setGame] = useState<Game2048 | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const moves = useRef('');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'ok' | 'err' | 'offline'>('idle');
  const [lbKey, setLbKey] = useState(0);
  const [best, setBest] = useState(0);
  const [wonShown, setWonShown] = useState(false);
  const [stopped, setStopped] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try { setBest(Number(localStorage.getItem('hub:2048:best')) || 0); } catch { /* ignore */ }
  }, []);

  const newGame = useCallback(async () => {
    setGame(null);
    moves.current = '';
    setSaved('idle');
    setWonShown(false);
    setStopped(false);
    try {
      const s = await api<{ id: string; seed: number }>('solo.start', { game: '2048', mode: 'classic' });
      setSession(s.id);
      setGame(new Game2048(s.seed));
    } catch {
      setSession(null);
      setGame(new Game2048(randomSeed()));
    }
  }, []);
  useEffect(() => { if (authed) newGame(); }, [authed, newGame]);

  const submit = useCallback(async (g: Game2048) => {
    if (!session) { setSaved('offline'); return; }
    if (saved === 'saving' || saved === 'ok') return;
    setSaved('saving');
    try {
      await api('solo.submit', { id: session, moves: moves.current, score: g.score });
      setSaved('ok');
      setLbKey((k) => k + 1);
    } catch (e) {
      setSaved('err');
      toast.err((e as Error).message);
    }
  }, [session, saved, toast]);

  const move = useCallback((d: Dir) => {
    if (!game || game.over || stopped) return;
    moves.current += d;
    const changed = game.move(d);
    if (!changed) return;
    if (game.tiles().some((t) => t.merged)) sfx.pop(); else sfx.move();
    if (game.score > best) {
      setBest(game.score);
      try { localStorage.setItem('hub:2048:best', String(game.score)); } catch { /* ignore */ }
    }
    if (game.best >= 2048 && !wonShown) { setWonShown(true); sfx.win(); toast.ok('Đạt 2048! Có thể chơi tiếp.'); }
    if (game.over) { sfx.gameOver(); submit(game); }
    setTick((t) => t + 1);
  }, [game, best, wonShown, submit, toast, stopped]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
      if (e.code in map) { e.preventDefault(); move(map[e.code]); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [move]);

  if (!authed) return <Shell><div className="grid min-h-[50vh] place-items-center"><Spinner /></div></Shell>;
  void tick;
  const tiles: Tile[] = game ? [...game.removed.map((t) => ({ ...t, id: -t.id })), ...game.tiles()] : [];
  const pct = 100 / SIZE;

  return (
    <Shell>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex w-full max-w-[520px] items-end justify-between">
            <h1 className="font-display text-5xl font-black text-amber-300 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]">2048</h1>
            <div className="flex gap-2">
              <div className="glass rounded-xl px-4 py-1.5 text-center"><div className="text-[10px] uppercase tracking-widest text-muted">Điểm</div><div className="font-display text-xl font-bold">{game?.score ?? 0}</div></div>
              <div className="glass rounded-xl px-4 py-1.5 text-center"><div className="text-[10px] uppercase tracking-widest text-muted">Cao nhất</div><div className="font-display text-xl font-bold">{best}</div></div>
            </div>
          </div>
          <div
            className="relative aspect-square w-full max-w-[520px] touch-none rounded-2xl border border-white/10 bg-[#0b0d1f] p-2 shadow-[0_30px_80px_-30px_rgba(251,191,36,0.4)]"
            onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={(e) => {
              const t0 = touch.current; touch.current = null;
              if (!t0) return;
              const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y;
              if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
              move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
            }}
          >
            <div className="relative h-full w-full">
              {Array.from({ length: SIZE * SIZE }, (_, i) => (
                <div key={i} className="absolute p-1.5" style={{ left: `${(i % SIZE) * pct}%`, top: `${Math.floor(i / SIZE) * pct}%`, width: `${pct}%`, height: `${pct}%` }}>
                  <div className="h-full w-full rounded-xl bg-white/[0.04]" />
                </div>
              ))}
              {tiles.map((t) => {
                const [bg, fg] = styleFor(t.value);
                const big = t.value >= 128;
                return (
                  <motion.div
                    key={t.id}
                    initial={t.isNew ? { scale: 0, left: `${t.c * pct}%`, top: `${t.r * pct}%` } : false}
                    animate={{ left: `${t.c * pct}%`, top: `${t.r * pct}%`, scale: t.merged ? [1, 1.14, 1] : 1, opacity: t.id < 0 ? 0 : 1 }}
                    transition={{ duration: 0.12 }}
                    className="absolute p-1.5"
                    style={{ width: `${pct}%`, height: `${pct}%`, zIndex: t.merged ? 2 : 1 }}
                  >
                    <div className="font-display grid h-full w-full place-items-center rounded-xl font-black"
                      style={{ background: bg, color: fg, fontSize: t.value >= 1024 ? 'clamp(18px,5vw,34px)' : t.value >= 128 ? 'clamp(22px,6vw,40px)' : 'clamp(26px,7vw,48px)', boxShadow: big ? `0 0 30px -4px ${bg}` : 'none' }}>
                      {t.value}
                    </div>
                  </motion.div>
                );
              })}
              {(game?.over || stopped) && game && (
                <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-black/65 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="font-display text-3xl font-bold">{stopped && !game.over ? 'Đã dừng' : 'Hết nước đi'}</div>
                    <div className="mt-1 text-muted">{game.score} điểm · ô lớn nhất {game.best}</div>
                    <div className="mt-2 text-sm">{saved === 'saving' ? 'Đang lưu…' : saved === 'ok' ? <span className="text-emerald-300">Đã lưu điểm</span> : saved === 'offline' ? <span className="text-amber-300">Không lưu (mất kết nối)</span> : null}</div>
                    <Button className="mt-4" onClick={newGame}>Chơi lại</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" onClick={newGame}>Ván mới</Button>
            {game && !game.over && !stopped && game.score > 0 && <Button variant="ghost" onClick={() => { setStopped(true); submit(game); }}>Dừng & lưu điểm</Button>}
          </div>
          <p className="mt-2 text-xs text-dim">Dùng phím mũi tên / WASD hoặc vuốt để gộp các ô cùng số.</p>
        </div>
        <LeaderboardPanel game="2048" mode="classic" title="Top 2048" reloadKey={lbKey} extra={(r) => <span className="text-xs text-dim">ô {String(r.meta?.best ?? '')}</span>} />
      </div>
    </Shell>
  );
}
