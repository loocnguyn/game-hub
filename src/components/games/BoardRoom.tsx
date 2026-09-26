'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { RULES } from '@shared/rules.ts';
import { timeLeft, type BoardState } from '@shared/boardroom.ts';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { sfx } from '@/lib/sfx';
import { Button, Panel, Segmented, useToast } from '@/components/ui';
import { ClockFace, InvitePanel, MoveList, PlayerStrip, reasonText, ResultModal, useNow } from '@/components/room/common';
import type { useRoom } from '@/lib/useRoom';
import ChessBoard2D from './boards/ChessBoard2D';
import XiangqiBoard from './boards/XiangqiBoard';
import CaroBoard from './boards/CaroBoard';
import DotsBoard from './boards/DotsBoard';

const ChessBoard3D = dynamic(() => import('./boards/ChessBoard3D'), { ssr: false });

type Room = ReturnType<typeof useRoom<BoardState>>;

const SIDE_NAMES: Record<string, [string, string]> = {
  chess: ['Trắng', 'Đen'],
  xiangqi: ['Đỏ', 'Đen'],
  caro: ['X', 'O'],
  dots: ['Xanh', 'Hồng'],
};
const SIDE_COLORS: Record<string, [string, string]> = {
  chess: ['#f5f0e6', '#1f2937'],
  xiangqi: ['#dc2626', '#111827'],
  caro: ['#38bdf8', '#f472b6'],
  dots: ['#22d3ee', '#f472b6'],
};

export interface BoardProps {
  game: string;
  fen: string;
  moves: string[];
  settings: BoardState['settings'];
  mySide: 0 | 1 | null;
  turn: 0 | 1;
  canMove: boolean;
  lastMove: string | null;
  check: boolean;
  onMove: (move: string) => void;
  premove?: string | null;
  onPremove?: (move: string | null) => void;
}

export default function BoardRoom({ room }: { room: Room }) {
  const s = room.state!;
  const { profile } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [premove, setPremove] = useState<string | null>(null);
  const [view3d, setView3d] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const prevMoves = useRef(s.moves.length);
  const prevStatus = useRef(s.status);
  const now = useNow(s.status === 'playing', 100);

  const mySide: 0 | 1 | null = s.seats[0]?.id === profile?.id ? 0 : s.seats[1]?.id === profile?.id ? 1 : null;
  const bottom: 0 | 1 = mySide ?? 0;
  const top: 0 | 1 = bottom === 0 ? 1 : 0;
  const names = SIDE_NAMES[s.game];
  const colors = SIDE_COLORS[s.game];

  // Optimistic display of our own pending move.
  const display = useMemo(() => {
    if (!pending) return { fen: s.fen, moves: s.moves };
    const r = RULES[s.game].play(s.moves, pending, s.settings);
    return r ? { fen: r.fen, moves: [...s.moves, pending] } : { fen: s.fen, moves: s.moves };
  }, [pending, s.fen, s.moves, s.game, s.settings]);

  // Sounds + clear pending when the server confirms.
  useEffect(() => {
    if (s.moves.length !== prevMoves.current) {
      setPending(null);
      const last = s.sans[s.sans.length - 1] || '';
      if (s.check) sfx.check();
      else if (last.includes('x') || last.includes('+')) sfx.capture();
      else sfx.piece();
      prevMoves.current = s.moves.length;
    }
    if (prevStatus.current !== 'finished' && s.status === 'finished') {
      setResultOpen(true);
      const won = s.result?.winner !== null && s.result?.winner === mySide;
      if (won) sfx.win();
      else sfx.gameOver();
    }
    prevStatus.current = s.status;
  }, [s.moves.length, s.status, s.check, s.sans, s.result, mySide]);

  // Rematch accepted: follow to the new room.
  useEffect(() => {
    if (s.nextCode) router.push(`/room/${s.nextCode}`);
  }, [s.nextCode, router]);

  const canMove = s.status === 'playing' && mySide !== null && s.turn === mySide && !pending;

  async function send(move: string) {
    setPending(move);
    try {
      await room.act('move', { move });
    } catch (e) {
      setPending(null);
      toast.err((e as Error).message);
    }
  }

  // Play a stored premove as soon as it becomes our turn.
  useEffect(() => {
    if (!premove || !canMove) return;
    const legal = RULES[s.game].play(s.moves, premove, s.settings);
    setPremove(null);
    if (legal) send(premove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMove, premove]);

  const act = async (action: string, params: Record<string, unknown> = {}) => {
    try {
      await room.act(action, params);
    } catch (e) {
      toast.err((e as Error).message);
    }
  };

  const clockFor = (side: 0 | 1) => {
    const running = s.status === 'playing' && s.turn === side && s.clock.turnStart !== null;
    const ms = s.status === 'playing' ? timeLeft(s, side, now) : s.clock.rem[side];
    return <ClockFace ms={ms} running={running} />;
  };
  const firstMoveHint = s.status === 'playing' && s.firstMoveDeadline && s.moves.length < 2
    ? Math.max(0, Math.ceil((s.firstMoveDeadline - now) / 1000))
    : null;

  // Fit the board (plus the two player strips) into the viewport height.
  const aspect = s.game === 'xiangqi' ? 568 / 628 : 1;
  const boardWidth = `max(300px, min(${s.game === 'xiangqi' ? 680 : 760}px, calc((100vh - 290px) * ${aspect.toFixed(4)})))`;

  const boardProps: BoardProps = {
    game: s.game, fen: display.fen, moves: display.moves, settings: s.settings, mySide, turn: s.turn,
    canMove, lastMove: pending ?? s.moves[s.moves.length - 1] ?? null, check: s.check && !pending, onMove: send,
    premove, onPremove: mySide !== null && s.status === 'playing' ? setPremove : undefined,
  };

  const result = s.result;
  const resultTitle = !result ? '' : result.reason === 'aborted' ? 'Ván bị hủy'
    : result.winner === null ? 'Hòa'
    : mySide === null ? `${names[result.winner]} thắng`
    : result.winner === mySide ? 'Bạn thắng!' : 'Bạn thua';
  const rematchState = mySide === null ? 'none' : s.rematch[mySide] ? 'sent' : s.rematch[mySide === 0 ? 1 : 0] ? 'incoming' : 'none';
  const scoreLine = s.game === 'dots' ? (() => {
    const boxes = display.fen.split('|')[1] || '';
    return [...boxes].reduce((acc, c) => { if (c === '1') acc[0]++; if (c === '2') acc[1]++; return acc; }, [0, 0]);
  })() : null;

  const sideLabel = (side: 0 | 1) => {
    const seat = s.seats[side];
    const parts = [names[side]];
    if (seat?.rating) parts.push(String(Math.round(seat.rating)));
    if (scoreLine) parts.push(`${scoreLine[side]} ô`);
    return parts.join(' · ');
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-full" style={{ maxWidth: boardWidth }}>
          <PlayerStrip name={s.seats[top]?.name} sub={sideLabel(top)} active={s.status === 'playing' && s.turn === top} clock={clockFor(top)} />
        </div>
        <div className="relative w-full" style={{ maxWidth: boardWidth }}>
          {s.game === 'chess' && (view3d ? <div className="aspect-square w-full overflow-hidden rounded-2xl"><ChessBoard3D {...boardProps} /></div> : <ChessBoard2D {...boardProps} />)}
          {s.game === 'xiangqi' && <XiangqiBoard {...boardProps} />}
          {s.game === 'caro' && <CaroBoard {...boardProps} />}
          {s.game === 'dots' && <DotsBoard {...boardProps} colors={colors} />}
          {s.status === 'waiting' && (
            <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/55 backdrop-blur-[2px]">
              <div className="text-center">
                <div className="font-display text-2xl font-bold">Đang chờ đối thủ</div>
                <div className="mt-1 text-muted">Gửi mã phòng hoặc mời người đang online ở bên phải</div>
              </div>
            </div>
          )}
        </div>
        <div className="w-full" style={{ maxWidth: boardWidth }}>
          <PlayerStrip name={s.seats[bottom]?.name} sub={sideLabel(bottom)} active={s.status === 'playing' && s.turn === bottom} clock={clockFor(bottom)} />
        </div>
      </div>

      <div className="space-y-4">
        {s.status === 'waiting' && <InvitePanel code={room.view!.code} game={s.game} />}
        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-lg font-bold">{s.status === 'finished' ? resultTitle : s.status === 'waiting' ? 'Phòng chờ' : mySide === null ? 'Đang xem' : s.turn === mySide ? 'Tới lượt bạn' : 'Lượt đối thủ'}</div>
              <div className="text-xs text-muted">
                {Math.round(s.settings.base / 60000 * 10) / 10} phút + {s.settings.inc / 1000}s · {s.settings.rated ? 'Tính rating' : 'Giao hữu'}
                {s.game === 'caro' && s.settings.caro && ` · ${s.settings.caro.size}×${s.settings.caro.size}${s.settings.caro.blockTwoEnds ? ' · chặn 2 đầu' : ''}`}
              </div>
            </div>
            {s.game === 'chess' && <Segmented value={view3d ? '3d' : '2d'} onChange={(v) => setView3d(v === '3d')} options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }]} />}
          </div>
          {firstMoveHint !== null && mySide !== null && s.turn === mySide && (
            <div className="mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200">Đi nước đầu trong {firstMoveHint}s, nếu không ván sẽ bị hủy</div>
          )}
          {s.status === 'finished' && result && <div className="mt-2 text-sm text-muted">{reasonText(result.reason, s.game)}</div>}
          {s.drawOffer !== null && s.status === 'playing' && mySide !== null && s.drawOffer !== mySide && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-cyan-400/10 px-3 py-2 text-sm">
              <span className="flex-1">Đối thủ xin hòa</span>
              <Button size="sm" variant="success" onClick={() => act('draw')}>Đồng ý</Button>
              <Button size="sm" variant="ghost" onClick={() => act('decline')}>Từ chối</Button>
            </div>
          )}
          <div className="mt-4">
            <MoveList sans={s.sans} pairs={s.game !== 'caro' && s.game !== 'dots'} />
          </div>
          {premove && <div className="mt-2 text-xs text-cyan-200">Đã đặt trước nước {premove} <button className="underline" onClick={() => setPremove(null)}>hủy</button></div>}
          {mySide !== null && s.status === 'playing' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={s.moves.length < 2 || s.drawOffer === mySide} onClick={() => act('draw')}>
                {s.drawOffer === mySide ? 'Đã xin hòa' : 'Xin hòa'}
              </Button>
              {confirmResign ? (
                <>
                  <Button size="sm" variant="danger" onClick={() => { setConfirmResign(false); act('resign'); }}>{s.moves.length < 2 ? 'Hủy ván' : 'Chắc chắn đầu hàng'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmResign(false)}>Thôi</Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmResign(true)}>{s.moves.length < 2 ? 'Hủy ván' : 'Đầu hàng'}</Button>
              )}
            </div>
          )}
          {s.status === 'finished' && mySide !== null && (
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => act('rematch')} disabled={rematchState === 'sent' || !s.seats[0] || !s.seats[1]}>
                {rematchState === 'sent' ? 'Đang chờ đối thủ…' : rematchState === 'incoming' ? 'Đồng ý đấu lại' : 'Đấu lại'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResultOpen(true)}>Kết quả</Button>
            </div>
          )}
          {s.status === 'waiting' && mySide !== null && (
            <Button size="sm" variant="ghost" className="mt-4" onClick={async () => { await room.leave(); router.push(`/play/${s.game}`); }}>Rời phòng</Button>
          )}
        </Panel>
      </div>

      <ResultModal
        open={resultOpen && s.status === 'finished'}
        title={resultTitle}
        subtitle={result ? reasonText(result.reason, s.game) : undefined}
        delta={mySide !== null && s.ratingDelta ? s.ratingDelta[mySide] : null}
        onRematch={mySide !== null && s.seats[0] && s.seats[1] ? () => act('rematch') : undefined}
        rematchState={rematchState}
        onClose={() => setResultOpen(false)}
        lobbyHref={`/play/${s.game}`}
      />
    </div>
  );
}
