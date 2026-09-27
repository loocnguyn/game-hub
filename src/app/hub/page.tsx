'use client';
import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { Shell } from '@/components/TopBar';
import { Button, Spinner, useToast } from '@/components/ui';
import { CATEGORIES, GAMES, coverOf, gameById, type GameCategory, type GameInfo } from '@/lib/games';
import { useAuth, useRequireAuth } from '@/lib/auth';
import { useWhere } from '@/lib/presence';
import { api } from '@/lib/api';

function GameLink({ g, className, children }: { g: GameInfo; className?: string; children: React.ReactNode }) {
  if (g.comingSoon) return <div className={className}>{children}</div>;
  if (g.external) return <a href={g.href} className={className}>{children}</a>;
  return <Link href={g.href} className={className}>{children}</Link>;
}

function GameCard({ g, index }: { g: GameInfo; index: number }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
    >
      <GameLink g={g} className={clsx('group block', g.comingSoon && 'cursor-default')}>
        <div
          className="[perspective:900px]"
          onMouseMove={(e) => {
            if (g.comingSoon) return;
            const r = e.currentTarget.getBoundingClientRect();
            setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -8, y: ((e.clientX - r.left) / r.width - 0.5) * 10 });
          }}
          onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        >
          <div
            className="relative aspect-[16/10] overflow-hidden rounded-lg border border-line bg-panel transition-[transform,box-shadow,border-color] duration-200 group-hover:border-line-2 group-hover:shadow-[0_24px_40px_-24px_rgba(0,0,0,0.9)]"
            style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverOf(g)}
              alt=""
              loading="lazy"
              className={clsx('h-full w-full object-cover transition-transform duration-300', g.comingSoon ? 'opacity-60 grayscale' : 'group-hover:scale-[1.04]')}
            />
            {g.comingSoon && <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold">Sắp ra mắt trên Steam</span>}
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <h3 className="font-display text-lg font-bold leading-tight transition-colors group-hover:text-accent">{g.name}</h3>
          <span className="shrink-0 text-xs text-dim">{g.players} người</span>
        </div>
        <p className="mt-0.5 text-sm text-muted">{g.tagline}</p>
      </GameLink>
    </motion.div>
  );
}

function Featured({ g }: { g: GameInfo }) {
  return (
    <Link href={g.href} className="group relative block overflow-hidden rounded-xl border border-line bg-panel">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={coverOf(g)} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] md:left-auto md:w-[68%]" />
      <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/60 to-transparent md:bg-gradient-to-r md:from-panel md:from-35% md:via-panel/70 md:to-transparent" />
      <div className="relative flex min-h-[260px] flex-col justify-end p-6 sm:p-8 md:min-h-[300px] md:max-w-[46%]">
        <span className="text-sm font-semibold text-accent">Nổi bật</span>
        <h2 className="font-display mt-1 text-4xl font-extrabold sm:text-5xl">{g.name}</h2>
        <p className="mt-2 text-muted">{g.tagline}.</p>
        <span className="raised mt-5 inline-flex h-11 w-fit items-center rounded-lg bg-accent px-5 font-semibold text-accent-ink">Chơi ngay</span>
      </div>
    </Link>
  );
}

export default function HubPage() {
  const authed = useRequireAuth();
  const { profile, setChips } = useAuth();
  const [cat, setCat] = useState<GameCategory | 'all'>('all');
  const [claiming, setClaiming] = useState(false);
  const toast = useToast();
  useWhere('Sảnh chính');

  if (!authed) return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8 text-accent" /></div>;
  const list = GAMES.filter((g) => cat === 'all' || g.category === cat);

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Chào {profile?.name ?? 'bạn'}</h1>
          <p className="mt-1 text-muted">Chọn game để chơi. Game online thì tạo phòng rồi gửi mã cho bạn bè.</p>
        </div>
        <Button
          variant="ghost"
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {!claiming && <img src="/covers/chip.png" alt="" width={20} height={20} />}
          Nhận 5.000 chip mỗi ngày
        </Button>
      </div>

      {cat === 'all' && <Featured g={gameById('tetris')!} />}

      <div className="mb-6 mt-10 flex gap-1 overflow-x-auto border-b border-line">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={clsx(
              'relative shrink-0 px-3 pb-3 pt-1 text-sm font-medium transition',
              cat === c.id ? 'text-text after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent' : 'text-muted hover:text-text',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((g, i) => <GameCard key={g.id} g={g} index={i} />)}
      </div>
    </Shell>
  );
}
