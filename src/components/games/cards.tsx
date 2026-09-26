'use client';
import { clsx } from 'clsx';
import { RANKS, SUITS, rankOf, suitOf } from '@shared/tienlen.ts';

export function PlayingCard({
  c, selected, onClick, size = 'md', dim, className,
}: { c: number; selected?: boolean; onClick?: () => void; size?: 'sm' | 'md' | 'lg'; dim?: boolean; className?: string }) {
  const rank = RANKS[rankOf(c)];
  const suit = SUITS[suitOf(c)];
  const red = suitOf(c) >= 2;
  const dims = { sm: 'h-14 w-10 text-[11px]', md: 'h-24 w-[68px] text-sm', lg: 'h-28 w-20 text-base' }[size];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={clsx(
        'relative shrink-0 select-none rounded-lg border bg-gradient-to-br from-white to-slate-100 font-bold shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] transition-all duration-150',
        dims,
        red ? 'text-rose-600' : 'text-slate-900',
        selected ? '-translate-y-4 border-cyan-400 ring-2 ring-cyan-300' : 'border-slate-300',
        onClick && !selected && 'hover:-translate-y-1.5',
        dim && 'opacity-60',
        className,
      )}
    >
      <span className="absolute left-1 top-0.5 leading-none">{rank}<br />{suit}</span>
      <span className={clsx('absolute inset-0 grid place-items-center', size === 'sm' ? 'text-lg' : 'text-3xl')}>{suit}</span>
      <span className="absolute bottom-0.5 right-1 rotate-180 leading-none">{rank}<br />{suit}</span>
    </button>
  );
}

export function CardBack({ size = 'sm', className }: { size?: 'sm' | 'md'; className?: string }) {
  const dims = size === 'sm' ? 'h-12 w-9' : 'h-24 w-[68px]';
  return (
    <div className={clsx('shrink-0 rounded-md border border-white/30 bg-[repeating-linear-gradient(45deg,#6d28d9,#6d28d9_4px,#7c3aed_4px,#7c3aed_8px)] shadow-md', dims, className)} />
  );
}
