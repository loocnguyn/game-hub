'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { Shell } from '@/components/TopBar';
import { Badge, Button, Spinner, useToast } from '@/components/ui';
import { CATEGORIES, GAMES, type GameCategory, type GameInfo } from '@/lib/games';
import { useAuth, useRequireAuth } from '@/lib/auth';
import { useWhere } from '@/lib/presence';
import { api } from '@/lib/api';

function GameCard({ g, index }: { g: GameInfo; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, mx: 50, my: 50 });
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (0.5 - py) * 10, y: (px - 0.5) * 12, mx: px * 100, my: py * 100 });
  };
  const inner = (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035, type: 'spring', stiffness: 220, damping: 24 }}
      onMouseMove={onMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0, mx: 50, my: 50 })}
      style={{ transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      className={clsx(
        'group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c1c] p-5 transition-[box-shadow,transform] duration-200',
        g.comingSoon ? 'cursor-not-allowed' : 'cursor-pointer hover:shadow-[0_20px_60px_-20px_var(--glow)]',
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(420px circle at ${tilt.mx}% ${tilt.my}%, ${g.accent}33, transparent 45%), linear-gradient(135deg, ${g.accent}22, transparent 40%, ${g.accent2}22)`,
        }}
      />
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between">
          <div
            className="grid h-16 w-16 place-items-center rounded-2xl text-4xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
            style={{ background: `linear-gradient(135deg, ${g.accent}, ${g.accent2})`, boxShadow: `0 10px 40px -10px ${g.accent}`, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
          >
            {g.icon}
          </div>
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs text-muted">👥 {g.players}</span>
        </div>
        <h3 className="font-display mt-4 text-xl font-bold">{g.name}</h3>
        <p className="mt-1 flex-1 text-sm text-muted">{g.tagline}</p>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {g.badges?.map((b) => <Badge key={b} color={g.accent}>{b}</Badge>)}
          {g.comingSoon && <Badge color="#94a3b8">Sắp ra mắt · Steam</Badge>}
          {!g.comingSoon && (
            <span className="ml-auto translate-x-2 text-sm font-semibold opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" style={{ color: g.accent }}>Chơi ngay →</span>
          )}
        </div>
      </div>
      {g.comingSoon && <div className="absolute inset-0 bg-black/35 backdrop-grayscale" />}
    </motion.div>
  );
  if (g.comingSoon) return inner;
  if (g.external) return <a href={g.href} className="block h-full">{inner}</a>;
  return <Link href={g.href} className="block h-full" style={{ ['--glow' as string]: g.accent }}>{inner}</Link>;
}

export default function HubPage() {
  const authed = useRequireAuth();
  const { profile, setChips } = useAuth();
  const [cat, setCat] = useState<GameCategory | 'all'>('all');
  const [claiming, setClaiming] = useState(false);
  const toast = useToast();
  useWhere('Sảnh chính');

  if (!authed) return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8 text-cyan-300" /></div>;
  const list = GAMES.filter((g) => cat === 'all' || g.category === cat);

  return (
    <Shell>
      <section className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/25 via-fuchsia-600/10 to-cyan-500/20 p-7 sm:p-10">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -bottom-16 left-1/3 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-200">Xin chào</p>
            <h1 className="font-display mt-1 text-4xl font-bold sm:text-5xl">{profile?.name ?? 'Người chơi'}</h1>
            <p className="mt-2 max-w-xl text-muted">Chọn game để chơi. Game online thì tạo phòng rồi mời bạn vào.</p>
          </div>
          <Button
            variant="gold"
            loading={claiming}
            onClick={async () => {
              setClaiming(true);
              try {
                const r = await api<{ chips: number }>('wallet.bonus');
                setChips(r.chips);
                toast.ok('Đã nhận 5.000 chip');
              } catch (e) {
                toast.err((e as Error).message);
              } finally {
                setClaiming(false);
              }
            }}
          >
            Nhận 5.000 chip mỗi ngày
          </Button>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={clsx('rounded-full border px-4 py-2 text-sm font-medium transition', cat === c.id ? 'border-transparent bg-white text-black' : 'border-white/10 bg-white/5 text-muted hover:text-text')}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((g, i) => <GameCard key={g.id} g={g} index={i} />)}
      </div>
    </Shell>
  );
}
