'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Shell } from '@/components/TopBar';
import { Button, Panel, Segmented, Spinner, formatMs, useToast } from '@/components/ui';
import { LeaderboardPanel } from '@/components/Leaderboard';
import { useRequireAuth } from '@/lib/auth';
import { useWhere } from '@/lib/presence';
import { api } from '@/lib/api';
import { sfx } from '@/lib/sfx';
import { generateSudoku, SUDOKU_LEVELS, type SudokuDifficulty } from '@shared/sudoku.ts';
import { randomSeed } from '@shared/rng.ts';

interface Snapshot { grid: number[]; notes: number[] }

export default function SudokuPage() {
  const authed = useRequireAuth();
  useWhere('Đang chơi Sudoku');
  const toast = useToast();
  const [level, setLevel] = useState<SudokuDifficulty>('easy');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<number[]>([]);
  const [solution, setSolution] = useState<number[]>([]);
  const [grid, setGrid] = useState<number[]>([]);
  const [notes, setNotes] = useState<number[]>([]); // bitmask per cell
  const [sel, setSel] = useState<number>(40);
  const [noteMode, setNoteMode] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [doneMs, setDoneMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [saved, setSaved] = useState<'idle' | 'saving' | 'ok' | 'err' | 'offline'>('idle');
  const [lbKey, setLbKey] = useState(0);

  const newGame = useCallback(async (lv: SudokuDifficulty) => {
    setLoading(true);
    let seed: number;
    try {
      const s = await api<{ id: string; seed: number }>('solo.start', { game: 'sudoku', mode: lv });
      setSession(s.id);
      seed = s.seed;
    } catch {
      setSession(null);
      seed = randomSeed();
    }
    // generation can take a moment on "expert": yield to paint the spinner first
    await new Promise((r) => setTimeout(r, 20));
    const p = generateSudoku(seed, lv);
    setPuzzle(p.puzzle);
    setSolution(p.solution);
    setGrid(p.puzzle.slice());
    setNotes(new Array(81).fill(0));
    setMistakes(0);
    setHistory([]);
    setDoneMs(null);
    setSaved('idle');
    setStartedAt(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) newGame(level); }, [authed, level, newGame]);
  useEffect(() => {
    if (doneMs !== null || loading) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [doneMs, loading]);

  const finish = useCallback(async (g: number[]) => {
    const ms = Date.now() - startedAt;
    setDoneMs(ms);
    sfx.win();
    if (!session) { setSaved('offline'); return; }
    setSaved('saving');
    try {
      await api('solo.submit', { id: session, grid: g, timeMs: ms, mistakes });
      setSaved('ok');
      setLbKey((k) => k + 1);
    } catch (e) {
      setSaved('err');
      toast.err((e as Error).message);
    }
  }, [session, startedAt, mistakes, toast]);

  const input = useCallback((d: number) => {
    if (doneMs !== null || puzzle[sel]) return;
    setHistory((h) => [...h.slice(-199), { grid: grid.slice(), notes: notes.slice() }]);
    if (noteMode && d > 0) {
      const n = notes.slice();
      n[sel] ^= 1 << d;
      setNotes(n);
      sfx.click();
      return;
    }
    const g = grid.slice();
    g[sel] = d;
    setGrid(g);
    if (d > 0) {
      if (d !== solution[sel]) { setMistakes((m) => m + 1); sfx.lock(); }
      else {
        sfx.pop();
        // clear this digit from notes of peers
        const n = notes.slice();
        n[sel] = 0;
        const r = Math.floor(sel / 9), c = sel % 9;
        for (let i = 0; i < 81; i++) {
          const rr = Math.floor(i / 9), cc = i % 9;
          if (rr === r || cc === c || (Math.floor(rr / 3) === Math.floor(r / 3) && Math.floor(cc / 3) === Math.floor(c / 3))) n[i] &= ~(1 << d);
        }
        setNotes(n);
      }
    }
    if (g.every((v, i) => v === solution[i])) finish(g);
  }, [doneMs, puzzle, sel, grid, notes, noteMode, solution, finish]);

  const undo = () => {
    const last = history[history.length - 1];
    if (!last || doneMs !== null) return;
    setGrid(last.grid);
    setNotes(last.notes);
    setHistory((h) => h.slice(0, -1));
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') input(Number(e.key));
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') input(0);
      else if (e.key === 'ArrowLeft') setSel((s) => (s % 9 ? s - 1 : s));
      else if (e.key === 'ArrowRight') setSel((s) => (s % 9 < 8 ? s + 1 : s));
      else if (e.key === 'ArrowUp') setSel((s) => (s >= 9 ? s - 9 : s));
      else if (e.key === 'ArrowDown') setSel((s) => (s < 72 ? s + 9 : s));
      else if (e.key.toLowerCase() === 'n') setNoteMode((v) => !v);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') undo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const counts = useMemo(() => {
    const c = new Array(10).fill(0);
    grid.forEach((v, i) => { if (v && v === solution[i]) c[v]++; });
    return c;
  }, [grid, solution]);

  if (!authed) return <Shell><div className="grid min-h-[50vh] place-items-center"><Spinner /></div></Shell>;
  const selVal = grid[sel];
  const sr = Math.floor(sel / 9), sc = sel % 9;

  return (
    <Shell>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex w-full max-w-[560px] flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-3xl font-bold">Sudoku</h1>
            <Segmented value={level} onChange={setLevel} options={(Object.keys(SUDOKU_LEVELS) as SudokuDifficulty[]).map((k) => ({ value: k, label: SUDOKU_LEVELS[k].label }))} />
          </div>
          <div className="mb-3 flex w-full max-w-[560px] justify-between text-sm text-muted">
            <span>Lỗi: <b className={mistakes ? 'text-rose-300' : ''}>{mistakes}</b></span>
            <span className="font-display text-lg text-text tabular-nums">{formatMs(doneMs ?? now - startedAt)}</span>
          </div>
          {loading ? <div className="grid aspect-square w-full max-w-[560px] place-items-center"><Spinner className="h-8 w-8" /></div> : (
            <div className="grid aspect-square w-full max-w-[560px] grid-cols-9 overflow-hidden rounded-2xl border-2 border-violet-400/40 bg-[#0c0e22]">
              {grid.map((v, i) => {
                const r = Math.floor(i / 9), c = i % 9;
                const given = puzzle[i] !== 0;
                const related = r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3));
                const same = selVal && v === selVal;
                const wrong = v && !given && v !== solution[i];
                return (
                  <button
                    key={i}
                    onClick={() => setSel(i)}
                    className={clsx(
                      'font-display relative grid place-items-center text-[clamp(16px,4.5vw,28px)] transition-colors',
                      c % 3 === 2 && c < 8 && 'border-r-2 border-r-violet-400/40', c % 3 !== 2 && 'border-r border-r-white/5',
                      r % 3 === 2 && r < 8 && 'border-b-2 border-b-violet-400/40', r % 3 !== 2 && 'border-b border-b-white/5',
                      i === sel ? 'bg-violet-500/40' : same ? 'bg-violet-500/20' : related ? 'bg-white/[0.05]' : '',
                      given ? 'font-bold text-slate-100' : wrong ? 'text-rose-400' : 'text-accent',
                    )}
                  >
                    {v ? v : notes[i] ? (
                      <div className="grid h-full w-full grid-cols-3 p-0.5 text-[clamp(7px,1.4vw,11px)] leading-none text-slate-400">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <span key={d} className="grid place-items-center">{notes[i] & (1 << d) ? d : ''}</span>)}
                      </div>
                    ) : ''}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-4 grid w-full max-w-[560px] grid-cols-9 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button key={d} onClick={() => input(d)} disabled={counts[d] >= 9}
                className="font-display rounded-xl bg-white/5 py-3 text-2xl font-bold transition hover:bg-violet-500/30 disabled:opacity-25">
                {d}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button variant="ghost" onClick={undo}>Hoàn tác</Button>
            <Button variant="ghost" onClick={() => input(0)}>Xóa</Button>
            <Button variant={noteMode ? 'primary' : 'ghost'} onClick={() => setNoteMode((v) => !v)}>Ghi chú: {noteMode ? 'bật' : 'tắt'} (N)</Button>
            <Button variant="ghost" onClick={() => newGame(level)}>Ván mới</Button>
          </div>
          {doneMs !== null && (
            <Panel className="mt-4 px-6 py-4 text-center">
              <div className="font-display text-2xl font-bold text-emerald-300">Hoàn thành! {formatMs(doneMs)}</div>
              <div className="mt-1 text-sm text-muted">{saved === 'saving' ? 'Đang lưu…' : saved === 'ok' ? 'Đã lưu vào bảng xếp hạng' : saved === 'offline' ? 'Không lưu (mất kết nối)' : ''}</div>
            </Panel>
          )}
        </div>
        <LeaderboardPanel game="sudoku" mode={level} lowerIsBetter title={`Top ${SUDOKU_LEVELS[level].label.toLowerCase()}`} reloadKey={lbKey} />
      </div>
    </Shell>
  );
}
