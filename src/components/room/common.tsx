'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useRouter } from 'next/navigation';
import { serverNow } from '@/lib/api';
import { usePresence } from '@/lib/presence';
import { useAuth } from '@/lib/auth';
import { sfx } from '@/lib/sfx';
import { Avatar, Button, formatMs, Modal, Panel, useToast } from '@/components/ui';

/** Re-render on every animation frame while `active` (for smooth clocks/countdowns). */
export function useNow(active = true, everyMs = 100) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(serverNow()), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
  return now;
}

export function ClockFace({ ms, running, low = 20_000 }: { ms: number; running: boolean; low?: number }) {
  const isLow = ms <= low;
  const lastBeep = useRef(0);
  useEffect(() => {
    if (!running || ms > 10_000 || ms <= 0) return;
    const sec = Math.ceil(ms / 1000);
    if (sec !== lastBeep.current) {
      lastBeep.current = sec;
      sfx.lowTime();
    }
  }, [ms, running]);
  return (
    <div
      className={clsx(
        'font-display min-w-[110px] rounded-xl px-4 py-2 text-right text-3xl font-bold tabular-nums transition-colors',
        running ? (isLow ? 'bg-red-500 text-white shadow-[0_0_30px_-4px_rgba(239,68,68,0.9)]' : 'bg-white text-black') : 'bg-white/5 text-muted',
      )}
    >
      {formatMs(ms, ms < 10_000)}
    </div>
  );
}

export function PlayerStrip({
  name, sub, active, clock, color, right,
}: { name?: string; sub?: ReactNode; active?: boolean; clock?: ReactNode; color?: string; right?: ReactNode }) {
  return (
    <div className={clsx('flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition', active ? 'border-accent/40 bg-accent/5' : 'border-white/10 bg-white/[0.03]')}>
      {name ? <Avatar name={name} size={40} color={color} /> : <div className="h-10 w-10 rounded-full border-2 border-dashed border-white/20" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{name ?? <span className="text-dim">Đang chờ người chơi…</span>}</div>
        {sub && <div className="truncate text-xs text-muted">{sub}</div>}
      </div>
      {right}
      {clock}
    </div>
  );
}

export function InvitePanel({ code, game }: { code: string; game: string }) {
  const { online, invite } = usePresence();
  const { profile } = useAuth();
  const toast = useToast();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const link = typeof window !== 'undefined' ? `${window.location.origin}/room?code=${code}` : '';
  const others = online.filter((u) => u.id !== profile?.id);
  return (
    <Panel className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">Mã phòng</div>
      <div className="mt-1 flex items-center gap-2">
        <div className="font-display flex-1 rounded-xl bg-black/40 px-3 py-2 text-center text-2xl font-bold tracking-[0.3em] text-accent">{code}</div>
        <Button
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast.ok('Đã chép link phòng');
            } catch {
              toast.info(link);
            }
          }}
        >
          Chép link
        </Button>
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Mời người đang online</div>
      <ul className="mt-2 max-h-56 space-y-1.5 overflow-auto pr-1">
        {others.map((u) => (
          <li key={u.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5">
            <Avatar name={u.name} size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.name}</div>
              <div className="truncate text-[11px] text-dim">{u.where}</div>
            </div>
            <Button
              size="sm"
              variant={sent[u.id] ? 'ghost' : 'primary'}
              disabled={sent[u.id]}
              onClick={async () => {
                try {
                  await invite(u.id, game, code);
                  setSent((x) => ({ ...x, [u.id]: true }));
                  toast.ok(`Đã mời ${u.name}`);
                } catch (e) {
                  toast.err((e as Error).message);
                }
              }}
            >
              {sent[u.id] ? 'Đã mời' : 'Mời'}
            </Button>
          </li>
        ))}
        {!others.length && <li className="py-2 text-sm text-dim">Chưa có ai khác online. Gửi mã phòng cho bạn nhé.</li>}
      </ul>
    </Panel>
  );
}

const REASONS: Record<string, string> = {
  checkmate: 'Chiếu hết',
  stalemate: 'Hết nước đi',
  insufficient: 'Không đủ quân để chiếu hết',
  repetition: 'Lặp lại thế cờ 3 lần',
  fifty_moves: 'Luật 50 nước',
  timeout: 'Hết giờ',
  timeout_draw: 'Hết giờ nhưng đối thủ không đủ quân để thắng',
  resign: 'Đầu hàng',
  agreement: 'Hai bên đồng ý hòa',
  aborted: 'Ván bị hủy',
  perpetual_check: 'Chiếu dai',
  no_capture: '60 nước không ăn quân',
  five: 'Đủ 5 quân liền',
  board_full: 'Hết chỗ trên bàn',
  boxes: 'Chiếm nhiều ô hơn',
  boxes_tie: 'Bằng số ô',
  ko: 'Nhiều KO hơn',
  attack: 'Bằng KO, gửi nhiều hàng rác hơn',
  score: 'Bằng KO và rác, nhiều điểm hơn',
  draw: 'Bằng nhau hoàn toàn',
  rounds: 'Thắng đủ số ván',
  forfeit: 'Đối thủ rời trận',
};
export const reasonText = (r: string, game?: string) => (r === 'stalemate' && game === 'chess' ? 'Hòa pat' : REASONS[r] ?? r);

export function ResultModal({
  open, title, subtitle, delta, onRematch, rematchState, onClose, lobbyHref,
}: {
  open: boolean; title: string; subtitle?: string; delta?: number | null; onRematch?: () => void;
  rematchState?: 'none' | 'sent' | 'incoming'; onClose: () => void; lobbyHref: string;
}) {
  const router = useRouter();
  return (
    <Modal open={open} onClose={onClose}>
      <div className="text-center">
        <div className="font-display text-4xl font-bold">{title}</div>
        {subtitle && <div className="mt-2 text-muted">{subtitle}</div>}
        {typeof delta === 'number' && (
          <div className={clsx('mt-3 text-lg font-semibold', delta >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
            Rating {delta >= 0 ? '+' : ''}{delta}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {onRematch && (
            <Button onClick={onRematch} disabled={rematchState === 'sent'}>
              {rematchState === 'sent' ? 'Đang chờ đối thủ…' : rematchState === 'incoming' ? 'Đồng ý đấu lại' : 'Đấu lại'}
            </Button>
          )}
          <Button variant="ghost" onClick={() => router.push(lobbyHref)}>Về sảnh</Button>
          <Button variant="ghost" onClick={onClose}>Xem bàn</Button>
        </div>
      </div>
    </Modal>
  );
}

export function MoveList({ sans, pairs = true }: { sans: string[]; pairs?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [sans.length]);
  const rows: [string, string?][] = [];
  if (pairs) for (let i = 0; i < sans.length; i += 2) rows.push([sans[i], sans[i + 1]]);
  return (
    <div ref={ref} className="max-h-64 min-h-24 overflow-auto rounded-xl bg-black/30 p-2 font-mono text-sm">
      {!sans.length && <div className="p-2 text-dim">Chưa có nước đi</div>}
      {pairs
        ? rows.map(([a, b], i) => (
          <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] rounded px-1 py-0.5 odd:bg-white/[0.03]">
            <span className="text-dim">{i + 1}.</span>
            <span>{a}</span>
            <span>{b ?? ''}</span>
          </div>
        ))
        : <div className="flex flex-wrap gap-1.5">{sans.map((s, i) => <span key={i} className="rounded bg-white/5 px-1.5">{i + 1}. {s}</span>)}</div>}
    </div>
  );
}
