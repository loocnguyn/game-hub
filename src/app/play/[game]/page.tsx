import { GAMES } from '@/lib/games';
import PlayLobby from './PlayLobby';

export const dynamicParams = false;
export const generateStaticParams = () =>
  GAMES.filter((g) => g.href === `/play/${g.id}`).map((g) => ({ game: g.id }));

export default async function Page({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  return <PlayLobby game={game} />;
}
