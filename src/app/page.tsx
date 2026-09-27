'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { useAuth } from '@/lib/auth';
import { GAMES, coverOf } from '@/lib/games';
import { LogoMark } from '@/components/TopBar';
import { Button, Field, inputClass, Panel, Segmented, Spinner } from '@/components/ui';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

function AuthCard() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) return setError('Tên đăng nhập 3–20 ký tự: chữ thường không dấu, số, dấu _ hoặc .');
    if (password.length < 6) return setError('Mật khẩu cần ít nhất 6 ký tự');
    if (mode === 'register') {
      if (password !== confirm) return setError('Mật khẩu nhập lại không khớp');
      if (name.trim().length < 2) return setError('Tên hiển thị cần ít nhất 2 ký tự');
    }
    setBusy(true);
    try {
      if (mode === 'login') await signIn(u, password);
      else await signUp(u, password, name.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="w-full max-w-md p-7 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h2>
        <Segmented
          value={mode}
          onChange={(m) => { setMode(m); setError(''); }}
          options={[{ value: 'login', label: 'Đăng nhập' }, { value: 'register', label: 'Đăng ký' }]}
        />
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Tên đăng nhập">
          <input className={inputClass} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="vd: loc.nguyen" autoFocus />
        </Field>
        {mode === 'register' && (
          <Field label="Tên hiển thị">
            <input className={inputClass} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Tên bạn bè sẽ thấy" />
          </Field>
        )}
        <Field label="Mật khẩu">
          <input className={inputClass} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {mode === 'register' && (
          <Field label="Nhập lại mật khẩu">
            <input className={inputClass} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        )}
        {error && <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <Button size="lg" className="w-full" loading={busy}>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</Button>
        <p className="text-center text-xs text-dim">
          Dùng chung tài khoản với Royal Poker.
        </p>
      </form>
    </Panel>
  );
}

function CoverWall() {
  // Three rows of covers on a tilted plane, drifting slowly sideways.
  const games = GAMES.filter((g) => !g.comingSoon);
  const rows = [games.slice(0, 5), games.slice(5, 10), games.slice(9, 14).concat(games.slice(0, 1))];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden [perspective:1400px]" aria-hidden>
      <div className="absolute left-[38%] top-1/2 w-[1500px] -translate-y-1/2 [transform:rotateX(22deg)_rotateY(-24deg)_rotateZ(6deg)] [transform-style:preserve-3d]">
        {rows.map((row, r) => (
          <div key={r} className={clsx('mb-5 flex w-max gap-5', r % 2 ? 'animate-[drift_60s_linear_infinite_reverse]' : 'animate-[drift_70s_linear_infinite]')}>
            {[...row, ...row].map((g, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${g.id}-${i}`} src={coverOf(g)} alt="" className="h-[200px] w-[320px] rounded-lg border border-white/10 object-cover shadow-[0_30px_40px_-20px_rgba(0,0,0,0.9)]" />
            ))}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-bg from-35% via-bg/80 to-bg/20" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
    </div>
  );
}

function Landing() {
  const { ready, session } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (ready && session) {
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/hub');
    }
  }, [ready, session, params, router]);

  const count = GAMES.filter((g) => !g.comingSoon).length;
  return (
    <div className="relative min-h-screen overflow-hidden">
      <CoverWall />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-5">
        <header className="flex h-20 items-center">
          <div className="flex items-center gap-2">
            <LogoMark size={38} />
            <span className="font-display text-2xl font-extrabold">Neon Arcade</span>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.2fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="font-semibold text-accent">{count} trò chơi · chơi trên trình duyệt</p>
            <h1 className="font-display mt-3 text-5xl font-extrabold leading-[1.02] sm:text-6xl lg:text-7xl">
              Sảnh game
              <br />
              cho nhóm bạn
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted">
              Tetris, cờ vua, cờ tướng, caro, tiến lên, cờ tỉ phú, dò mìn, sudoku và vài game khác. Tạo phòng rồi gửi mã cho bạn bè là chơi được.
            </p>
          </motion.div>

          <motion.div className="flex justify-center lg:justify-end" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
            {!ready || session ? <Spinner className="h-8 w-8 text-accent" /> : <AuthCard />}
          </motion.div>
        </div>

        <footer className="py-6 text-center text-xs text-dim">Chip trong casino là chip ảo để giải trí, không có giá trị quy đổi.</footer>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  );
}
