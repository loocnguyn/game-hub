'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';
import { classify, beats, rankOf, suitOf, TURN_MS, type TLPublic } from '@shared/tienlen.ts';
import { useAuth } from '@/lib/auth';
import { sfx } from '@/lib/sfx';
import type { useRoom } from '@/lib/useRoom';
import { Avatar, Button, Panel, useToast } from '@/components/ui';
import { InvitePanel, useNow } from '@/components/room/common';
import { CardBack, PlayingCard } from './cards';

type View = TLPublic & { hand?: number[] };
type Room = ReturnType<typeof useRoom<View>>;

const TYPE_NAMES: Record<string, string> = { single: 'Lẻ', pair: 'Đôi', triple: 'Sám', quad: 'Tứ quý', seq: 'Sảnh', dseq: 'Đôi thông' };
const PLACE = ['Nhất', 'Nhì', 'Ba', 'Bét'];

function TurnRing({ deadline, now }: { deadline: number | null; now: number }) {
  if (!deadline) return null;
  const left = Math.max(0, deadline - now);
  const pct = left / TURN_MS;
  return (
    <svg className="pointer-events-none absolute -inset-1.5" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r="24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
      <circle cx="26" cy="26" r="24" fill="none" stroke={pct < 0.3 ? '#ef4444' : '#22d3ee'} strokeWidth="3" strokeDasharray={`${pct * 150.8} 150.8`} transform="rotate(-90 26 26)" strokeLinecap="round" />
    </svg>
  );
}

export default function TienLenTable({ room }: { room: Room }) {
  const s = room.state!;
  const { profile } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const now = useNow(true, 200);
  const mySeat = s.seats.findIndex((x) => x?.id === profile?.id);
  const hand = useMemo(() => s.hand ?? [], [s.hand]);
  const [selected, setSelected] = useState<number[]>([]);
  const [sortBySuit, setSortBySuit] = useState(false);
  const [busy, setBusy] = useState(false);
  const prevTurn = useRef(s.turn);
  const prevPlays = useRef(s.lastPlays.length);

  useEffect(() => { setSelected((sel) => sel.filter((c) => hand.includes(c))); }, [hand]);
  useEffect(() => {
    if (s.lastPlays.length !== prevPlays.current) {
      sfx.card();
      if (s.lastPlays[s.lastPlays.length - 1]?.cut) sfx.boom();
    }
    prevPlays.current = s.lastPlays.length;
    if (s.status === 'playing' && s.turn === mySeat && prevTurn.current !== s.turn) sfx.notify();
    prevTurn.current = s.turn;
  }, [s.lastPlays, s.turn, s.status, mySeat]);

  const sortedHand = useMemo(() => {
    const h = [...hand];
    if (sortBySuit) h.sort((a, b) => suitOf(a) - suitOf(b) || rankOf(a) - rankOf(b));
    else h.sort((a, b) => a - b);
    return h;
  }, [hand, sortBySuit]);

  const combo = selected.length ? classify(selected) : null;
  const tableCombo = s.table ? classify(s.table.cards) : null;
  const canBeat = combo && (!tableCombo || beats(tableCombo, combo));
  const myTurn = s.status === 'playing' && s.turn === mySeat;

  const act = async (action: string, params: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await room.act(action, params);
      if (action === 'play') setSelected([]);
    } catch (e) {
      toast.err((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // seat positions relative to me (counter-clockwise: bottom -> right -> top -> left)
  const base = mySeat >= 0 ? mySeat : 0;
  const posOf = (seat: number) => ['bottom', 'right', 'top', 'left'][(seat - base + 4) % 4];
  const posClass: Record<string, string> = {
    bottom: 'bottom-3 left-1/2 -translate-x-1/2',
    top: 'top-3 left-1/2 -translate-x-1/2',
    left: 'left-3 top-1/2 -translate-y-1/2',
    right: 'right-3 top-1/2 -translate-y-1/2',
  };

  const seated = s.seats.filter(Boolean).length;
  const nextIn = s.status === 'finished' && s.nextStartAt ? Math.max(0, Math.ceil((s.nextStartAt - now) / 1000)) : 0;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div>
        <div style={{ maxWidth: 'max(360px, min(64rem, calc((100vh - 330px) * 1.6)))' }} className="relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-[48px] border-[10px] border-[#3b2412] bg-[radial-gradient(ellipse_at_center,#1f7a4d_0%,#125b37_55%,#0b3d25_100%)] shadow-[inset_0_0_80px_rgba(0,0,0,0.6),0_30px_80px_-30px_rgba(0,0,0,0.9)]">
          <div className="absolute inset-6 rounded-[36px] border border-emerald-200/10" />
          {/* seats */}
          {s.seats.map((seat, i) => {
            if (i === mySeat && mySeat >= 0) return null;
            const pos = posOf(i);
            const place = s.finished.indexOf(i);
            return (
              <div key={i} className={clsx('absolute flex items-center gap-2', posClass[pos], pos === 'left' || pos === 'right' ? 'flex-col' : 'flex-row')}>
                <div className="relative">
                  {seat ? <Avatar name={seat.name} size={46} /> : <div className="h-[46px] w-[46px] rounded-full border-2 border-dashed border-white/30" />}
                  {s.status === 'playing' && s.turn === i && <TurnRing deadline={s.deadline} now={now} />}
                </div>
                <div className={clsx('rounded-lg bg-black/40 px-2 py-1 text-center text-xs', pos === 'top' && 'order-first')}>
                  <div className="max-w-[110px] truncate font-semibold">{seat?.name ?? 'Ghế trống'}</div>
                  {seat && <div className="text-emerald-200">{s.scores[i] >= 0 ? '+' : ''}{s.scores[i]} điểm</div>}
                  {s.status === 'playing' && s.inGame[i] && place < 0 && (
                    <div className="mt-1 flex items-center justify-center gap-1">
                      <CardBack size="sm" className="h-7 w-5" /> <span className="font-bold">{s.counts[i]}</span>
                      {s.passed[i] && <span className="ml-1 rounded bg-white/15 px-1 text-[10px]">Bỏ</span>}
                    </div>
                  )}
                  {place >= 0 && <div className="font-bold text-amber-300">{PLACE[place]}</div>}
                  {s.status === 'waiting' && seat && <div className={s.ready[i] ? 'text-emerald-300' : 'text-muted'}>{s.ready[i] ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</div>}
                </div>
              </div>
            );
          })}
          {/* center: current play */}
          <div className="absolute inset-0 grid place-items-center">
            <AnimatePresence mode="popLayout">
              {s.table ? (
                <motion.div key={s.lastPlays.length} initial={{ scale: 0.7, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center">
                  <div className="flex justify-center -space-x-5">{s.table.cards.map((c) => <PlayingCard key={c} c={c} size="md" />)}</div>
                  <div className="mt-2 text-sm text-emerald-100">
                    {s.seats[s.table.seat]?.name ?? '?'} · {TYPE_NAMES[s.table.type]}{s.table.cut && <span className="ml-1 font-bold text-amber-300">CHẶT!</span>}
                  </div>
                </motion.div>
              ) : s.status === 'playing' ? (
                <motion.div key="free" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-emerald-100/80">
                  {s.seats[s.turn]?.name} được đi trước
                </motion.div>
              ) : null}
            </AnimatePresence>
            {s.status === 'finished' && (
              <div className="rounded-2xl bg-black/55 p-5 text-center backdrop-blur">
                {s.instant && <div className="mb-2 text-amber-300">{s.seats[s.instant.seat]?.name} tới trắng: {s.instant.reason}!</div>}
                <div className="font-display text-xl font-bold">Kết quả ván {s.gameNo}</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {s.seats.map((seat, i) => seat && s.deltas ? (
                    <li key={i} className="flex justify-between gap-6">
                      <span>{s.finished.includes(i) ? PLACE[s.finished.indexOf(i)] + ' · ' : ''}{seat.name}</span>
                      <span className={s.deltas[i] >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{s.deltas[i] >= 0 ? '+' : ''}{s.deltas[i]}</span>
                    </li>
                  ) : null)}
                </ul>
                {seated >= 2 && <div className="mt-3 text-xs text-muted">Ván mới bắt đầu sau {nextIn}s</div>}
              </div>
            )}
            {s.status === 'waiting' && (
              <div className="rounded-2xl bg-black/45 p-5 text-center backdrop-blur">
                <div className="font-display text-xl font-bold">Bàn chờ ({seated}/4)</div>
                <div className="mt-1 text-sm text-muted">Cần ít nhất 2 người, tất cả bấm sẵn sàng thì chia bài.</div>
              </div>
            )}
          </div>
        </div>

        {/* my area */}
        {mySeat >= 0 && (
          <div className="mx-auto mt-4 max-w-5xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar name={profile?.name ?? '?'} size={44} />
                  {myTurn && <TurnRing deadline={s.deadline} now={now} />}
                </div>
                <div>
                  <div className="font-semibold">{profile?.name} <span className="text-sm text-emerald-300">{s.scores[mySeat] >= 0 ? '+' : ''}{s.scores[mySeat]} điểm</span></div>
                  <div className="text-xs text-muted">
                    {s.status === 'playing' ? (myTurn ? <span className="text-accent">Tới lượt bạn · {Math.max(0, Math.ceil(((s.deadline ?? now) - now) / 1000))}s</span> : s.passed[mySeat] ? 'Bạn đã bỏ lượt vòng này' : 'Chờ lượt') : ''}
                    {combo && <span className="ml-2">Đang chọn: {TYPE_NAMES[combo.type]}</span>}
                    {selected.length > 0 && !combo && <span className="ml-2 text-rose-300">Bộ không hợp lệ</span>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.status === 'waiting' && (
                  <>
                    <Button onClick={() => act('ready', { ready: !s.ready[mySeat] })} variant={s.ready[mySeat] ? 'ghost' : 'primary'} loading={busy}>{s.ready[mySeat] ? 'Hủy sẵn sàng' : 'Sẵn sàng'}</Button>
                    <Button variant="ghost" onClick={async () => { await room.leave(); router.push('/play/tienlen'); }}>Rời bàn</Button>
                  </>
                )}
                {s.status === 'playing' && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setSortBySuit((v) => !v)}>Xếp theo {sortBySuit ? 'số' : 'chất'}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelected([])} disabled={!selected.length}>Bỏ chọn</Button>
                    <Button variant="ghost" onClick={() => act('pass')} disabled={!myTurn || !s.table || busy}>Bỏ lượt</Button>
                    <Button onClick={() => act('play', { cards: selected })} disabled={!myTurn || !canBeat || busy} loading={busy}>Đánh</Button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-5 flex min-h-[120px] justify-center">
              <div className="flex flex-wrap justify-center gap-y-3" style={{ marginLeft: 22 }}>
                {sortedHand.map((c) => (
                  <PlayingCard
                    key={c}
                    c={c}
                    size="lg"
                    className="-ml-[22px]"
                    selected={selected.includes(c)}
                    onClick={() => { sfx.click(); setSelected((sel) => (sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c])); }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-4">
        {s.seats.some((x) => x === null) && <InvitePanel code={room.view!.code} game="tienlen" />}
        <Panel className="p-4">
          <div className="font-display text-lg font-bold">Các lượt vừa đánh</div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {[...s.lastPlays].reverse().map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-24 truncate text-muted">{s.seats[p.seat]?.name ?? '?'}</span>
                <span className="flex -space-x-3">{p.cards.map((c) => <PlayingCard key={c} c={c} size="sm" />)}</span>
                {p.cut && <span className="text-xs font-bold text-amber-300">chặt</span>}
              </li>
            ))}
            {!s.lastPlays.length && <li className="text-dim">Chưa có ai đánh</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
