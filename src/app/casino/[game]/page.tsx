import { GAMES } from '@/lib/games';
import CasinoGame from './CasinoGame';

export const dynamicParams = false;
export const generateStaticParams = () =>
  GAMES.filter((g) => g.href === `/casino/${g.id}`).map((g) => ({ game: g.id }));

export default async function Page({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  return <CasinoGame game={game} />;
}
