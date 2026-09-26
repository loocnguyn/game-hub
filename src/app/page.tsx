'use client';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { useAuth } from '@/lib/auth';
import { GAMES } from '@/lib/games';
import { Button, Field, inputClass, Panel, Segmented, Spinner } from '@/components/ui';

const HeroScene = dynamic(() => import('@/components/three/HeroScene'), { ssr: false });

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
    <Panel className="w-full max-w-md p-7">
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

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 -z-0">
        <HeroScene />
      </div>
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-r from-[#05050d] via-[#05050d]/70 to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-5">
        <header className="flex h-20 items-center">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-violet-500 to-fuchsia-500 shadow-[0_0_30px_-4px_rgba(168,85,247,0.9)]">
              <div className="grid grid-cols-2 gap-[3px]">{[0, 1, 2, 3].map((i) => <span key={i} className={clsx('h-2 w-2 rounded-[2px]', i === 3 ? 'bg-white/40' : 'bg-white')} />)}</div>
            </div>
            <span className="font-display text-xl font-bold tracking-wide">NEON<span className="text-gradient">ARCADE</span></span>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.2fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-cyan-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" /> {GAMES.filter((g) => !g.comingSoon).length} trò chơi
            </div>
            <h1 className="font-display text-5xl font-bold leading-[1.05] sm:text-6xl lg:text-7xl">
              Neon <span className="text-gradient">Arcade</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Tetris, cờ vua, cờ tướng, caro, tiến lên, cờ tỉ phú, dò mìn, sudoku và vài game khác. Tạo phòng rồi gửi mã cho bạn bè là chơi được.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {GAMES.filter((g) => !g.comingSoon).map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-sm backdrop-blur" style={{ boxShadow: `0 0 18px -8px ${g.accent}` }}>
                  <span style={{ color: g.accent }}>{g.icon}</span>{g.name}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div className="flex justify-center lg:justify-end" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.15 }}>
            {!ready ? <Spinner className="h-8 w-8 text-cyan-300" /> : session ? <Spinner className="h-8 w-8 text-cyan-300" /> : <AuthCard />}
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
