'use client';
import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Shell } from '@/components/TopBar';
import { Button, Panel, Spinner, useToast } from '@/components/ui';
import { useAuth, useRequireAuth } from '@/lib/auth';
import { useRoom } from '@/lib/useRoom';
import { gameById } from '@/lib/games';
import { useWhere } from '@/lib/presence';

const BoardRoom = dynamic(() => import('@/components/games/BoardRoom'), { ssr: false });
const TetrisVersus = dynamic(() => import('@/components/games/tetris/TetrisVersus'), { ssr: false });
const TienLenTable = dynamic(() => import('@/components/games/TienLenTable'), { ssr: false });
const MonopolyGame = dynamic(() => import('@/components/games/monopoly/MonopolyGame'), { ssr: false });

export default function RoomView({ code }: { code: string }) {
  const authed = useRequireAuth();
  const { profile } = useAuth();
  const room = useRoom(code, { userId: profile?.id });
  const toast = useToast();
  const triedJoin = useRef(false);
  const game = gameById(room.view?.game ?? '');
  useWhere(game ? `Đang chơi ${game.name}` : 'Trong phòng');

  // Arriving from an invite link: take a free seat automatically.
  useEffect(() => {
    const s = room.state as any;
    if (!s || !profile || triedJoin.current) return;
    const seated =
      (s.seats && s.seats.some((x: any) => x?.id === profile.id)) ||
      (s.players && s.players.some((x: any) => x?.id === profile.id));
    const hasFree = s.seats ? s.seats.some((x: any) => x === null) : s.players ? s.players.length < 6 : false;
    if (!seated && s.status === 'waiting' && hasFree) {
      triedJoin.current = true;
      room.join().catch((e) => toast.err((e as Error).message));
    }
  }, [room, profile, toast]);

  if (!authed || (!room.view && !room.error)) {
    return <Shell><div className="grid min-h-[60vh] place-items-center"><Spinner className="h-8 w-8 text-accent" /></div></Shell>;
  }
  if (room.gone || (!room.view && room.error)) {
    return (
      <Shell>
        <Panel className="mx-auto mt-16 max-w-md p-8 text-center">
          <div className="font-display text-2xl font-bold">Không tìm thấy phòng</div>
          <p className="mt-2 text-muted">{room.error ?? 'Phòng đã đóng.'}</p>
          <Link href="/hub"><Button className="mt-6">Về sảnh</Button></Link>
        </Panel>
      </Shell>
    );
  }
  const s = room.state as any;
  return (
    <Shell wide>
      {s.kind === 'board' && <BoardRoom room={room} />}
      {s.kind === 'tetris' && <TetrisVersus room={room} />}
      {s.kind === 'tienlen' && <TienLenTable room={room} />}
      {s.kind === 'monopoly' && <MonopolyGame room={room} />}
    </Shell>
  );
}
