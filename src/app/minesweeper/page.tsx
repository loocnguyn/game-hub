'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Shell } from '@/components/TopBar';
import { Button, Panel, Segmented, Spinner, formatMs, useToast } from '@/components/ui';
import { LeaderboardPanel } from '@/components/Leaderboard';
import { useRequireAuth } from '@/lib/auth';
import { useWhere } from '@/lib/presence';
import { api } from '@/lib/api';
import { sfx } from '@/lib/sfx';
import { DIFFICULTIES, FLAGGED, Minesweeper, REVEALED, type Difficulty } from '@shared/minesweeper.ts';
import { randomSeed } from '@shared/rng.ts';

const NUM_COLORS = ['', '#60a5fa', '#4ade80', '#f87171', '#a78bfa', '#fb923c', '#22d3ee', '#f472b6', '#e2e8f0'];

function MineMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]" aria-label="mìn">
      <g stroke="#0b0c10" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7" />
      </g>
      <circle cx="12" cy="12" r="6.5" fill="#0b0c10" />
      <circle cx="9.8" cy="9.8" r="1.7" fill="#fff" />
    </svg>
  );
}

function FlagMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]" aria-label="cờ">
      <path d="M8 3v17" stroke="#f1f1f1" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.8 3.5 18.5 7.5 8.8 11.5Z" fill="#ef4444" />
      <path d="M5 20.5h7" stroke="#f1f1f1" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export default function MinesweeperPage() {
  const authed = useRequireAuth();
  useWhere('Đang chơi Dò mìn');
  const toast = useToast();
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [game, setGame] = useState<Minesweeper | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [, force] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedMs, setEndedMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [flagMode, setFlagMode] = useState(false);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'ok' | 'err' | 'offline'>('idle');
  const [lbKey, setLbKey] = useState(0);
  const [pressed, setPressed] = useState<number | null>(null);
  const longPress = useRef<number | null>(null);

  const newGame = useCallback(async (d: Difficulty) => {
    setGame(null);
    setStartedAt(null);
    setEndedMs(null);
    setSaved('idle');
    try {
      const s = await api<{ id: string; seed: number }>('solo.start', { game: 'minesweeper', mode: d });
      setSession(s.id);
      setGame(new Minesweeper(d, s.seed));
    } catch {
      setSession(null);
      setGame(new Minesweeper(d, randomSeed()));
    }
  }, []);

  useEffect(() => { if (authed) newGame(difficulty); }, [authed, difficulty, newGame]);
  useEffect(() => {
    if (!startedAt || endedMs !== null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [startedAt, endedMs]);

  async function afterAction(g: Minesweeper, firstClick: boolean) {
    const t0 = firstClick ? Date.now() : startedAt;
    if (firstClick) setStartedAt(t0);
    force((x) => x + 1);
    if (!g.over) return;
    const ms = Date.now() - (t0 ?? Date.now());
    setEndedMs(ms);
    if (!g.won) { sfx.boom(); return; }
    sfx.win();
    if (!session) { setSaved('offline'); return; }
    setSaved('saving');
    try {
      await api('solo.submit', { id: session, actions: g.log, timeMs: ms });
      setSaved('ok');
      setLbKey((k) => k + 1);
    } catch (e) {
      setSaved('err');
      toast.err((e as Error).message);
    }
  }

  function reveal(i: number) {
    if (!game || game.over) return;
    const first = !game.generated;
    if (game.state[i] === REVEALED) {
      if (game.chord(i).length) sfx.pop();
    } else if (flagMode) {
      if (game.toggleFlag(i)) sfx.flag();
    } else {
      const opened = game.reveal(i);
      if (opened.length) sfx.pop();
    }
    afterAction(game, first && game.generated);
  }
  function flag(i: number) {
    if (!game || game.over) return;
    if (game.state[i] === REVEALED) { if (game.chord(i).length) sfx.pop(); }
    else if (game.toggleFlag(i)) sfx.flag();
    afterAction(game, false);
  }

  if (!authed) return <Shell><div className="grid min-h-[50vh] place-items-center"><Spinner /></div></Shell>;
  const d = DIFFICULTIES[difficulty];
  const elapsed = endedMs ?? (startedAt ? now - startedAt : 0);
  const status = !game || !game.over ? 'Ván mới' : game.won ? 'Thắng · ván mới' : 'Thua · ván mới';
  const cell = difficulty === 'expert' ? 'min(3.1vw, 30px)' : difficulty === 'intermediate' ? 'min(5.2vw, 34px)' : 'min(9vw, 44px)';

  return (
    <Shell wide>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex w-full max-w-4xl flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-3xl font-bold">Dò mìn</h1>
            <Segmented value={difficulty} onChange={setDifficulty} options={(Object.keys(DIFFICULTIES) as Difficulty[]).map((k) => ({ value: k, label: `${DIFFICULTIES[k].label} ${DIFFICULTIES[k].w}×${DIFFICULTIES[k].h}` }))} />
          </div>
          <Panel className="inline-block p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div className="font-display rounded-lg bg-black/50 px-3 py-1 text-2xl font-bold tabular-nums text-rose-400">{String(d.mines - (game?.flags ?? 0)).padStart(3, '0')}</div>
              <button onClick={() => newGame(difficulty)} className={clsx('raised h-10 rounded-lg px-4 text-sm font-semibold transition hover:brightness-110', game?.over ? (game.won ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'bg-[#4a5263] text-white')}>{status}</button>
              <div className="font-display rounded-lg bg-black/50 px-3 py-1 text-2xl font-bold tabular-nums text-accent">{formatMs(elapsed)}</div>
            </div>
            {!game ? <div className="grid h-60 place-items-center"><Spinner /></div> : (
              <div
                className={clsx('grid select-none gap-[2px] rounded-lg bg-black/40 p-[2px]', game.over && !game.won && 'animate-shake')}
                style={{ gridTemplateColumns: `repeat(${game.w}, ${cell})` }}
                onContextMenu={(e) => e.preventDefault()}
                onMouseLeave={() => setPressed(null)}
              >
                {Array.from({ length: game.size }, (_, i) => {
                  const st = game.state[i];
                  const isMine = game.mine[i] === 1;
                  const showMine = game.over && isMine && st !== FLAGGED;
                  const wrongFlag = game.over && !game.won && st === FLAGGED && !isMine;
                  const revealed = st === REVEALED;
                  return (
                    <button
                      key={i}
                      style={{ width: cell, height: cell, fontSize: `calc(${cell} * 0.55)` }}
                      className={clsx(
                        'font-display grid place-items-center rounded-[4px] font-bold transition-colors',
                        revealed ? (i === game.exploded ? 'bg-red-600' : 'bg-[#1a1d24]') : pressed === i ? 'bg-[#3d4452]' : 'bg-[#4a5263] shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-3px_0_rgba(0,0,0,0.3)] hover:bg-[#566074]',
                      )}
                      onMouseDown={(e) => { if (e.button === 0) setPressed(i); }}
                      onMouseUp={(e) => { setPressed(null); if (e.button === 0) reveal(i); else if (e.button === 2) flag(i); else if (e.button === 1) { if (game.chord(i).length) sfx.pop(); afterAction(game, false); } }}
                      onTouchStart={() => { longPress.current = window.setTimeout(() => { longPress.current = null; flag(i); }, 380); }}
                      onTouchEnd={(e) => { if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; e.preventDefault(); reveal(i); } }}
                    >
                      {revealed && !isMine && game.adj[i] > 0 && <span style={{ color: NUM_COLORS[game.adj[i]] }}>{game.adj[i]}</span>}
                      {(showMine || (revealed && isMine)) && <MineMark />}
                      {st === FLAGGED && !wrongFlag && <FlagMark />}
                      {wrongFlag && <span className="text-rose-300">✕</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2 text-muted"><input type="checkbox" checked={flagMode} onChange={(e) => setFlagMode(e.target.checked)} className="accent-rose-400" /> Chế độ cắm cờ (điện thoại)</label>
              {game?.over && (
                <span className={game.won ? 'text-emerald-300' : 'text-rose-300'}>
                  {game.won ? `Thắng trong ${formatMs(elapsed, true)}` : 'Trúng mìn!'}
                  {game.won && saved === 'saving' && ' · đang lưu…'}
                  {game.won && saved === 'ok' && ' · đã lưu'}
                  {game.won && saved === 'offline' && ' · không lưu (mất kết nối)'}
                </span>
              )}
            </div>
          </Panel>
          <p className="mt-3 text-center text-xs text-dim">Chuột trái mở ô · chuột phải cắm cờ · bấm vào số để mở các ô xung quanh khi đã cắm đủ cờ</p>
          {game?.over && <Button className="mt-3" onClick={() => newGame(difficulty)}>Ván mới</Button>}
        </div>
        <LeaderboardPanel game="minesweeper" mode={difficulty} lowerIsBetter title={`Top ${d.label.toLowerCase()} (thời gian)`} reloadKey={lbKey} />
      </div>
    </Shell>
  );
}
