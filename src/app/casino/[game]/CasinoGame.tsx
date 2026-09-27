'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Shell } from '@/components/TopBar';
import { Panel, Spinner } from '@/components/ui';
import { useRequireAuth } from '@/lib/auth';
import { useWhere } from '@/lib/presence';
import { gameById } from '@/lib/games';
import { GameBanner } from '@/components/GameBanner';

const Sicbo = dynamic(() => import('@/components/casino/Sicbo'), { ssr: false });
const Roulette = dynamic(() => import('@/components/casino/Roulette'), { ssr: false });
const Crash = dynamic(() => import('@/components/casino/Crash'), { ssr: false });

export default function CasinoGame({ game }: { game: string }) {
  const info = gameById(game);
  const authed = useRequireAuth();
  useWhere(info ? `Đang chơi ${info.name}` : 'Casino');
  if (!authed) return <Shell><div className="grid min-h-[50vh] place-items-center"><Spinner /></div></Shell>;
  if (!info || !['sicbo', 'roulette', 'crash'].includes(game)) {
    return <Shell><Panel className="mx-auto mt-16 max-w-md p-8 text-center">Không có trò này. <Link className="text-accent underline" href="/hub">Về sảnh</Link></Panel></Shell>;
  }
  return (
    <Shell wide>
      <GameBanner game={info} compact subtitle="Chip ảo, chỉ để giải trí." />
      {game === 'sicbo' && <Sicbo />}
      {game === 'roulette' && <Roulette />}
      {game === 'crash' && <Crash />}
    </Shell>
  );
}
