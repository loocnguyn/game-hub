import type { ReactNode } from 'react';
import { coverOf, type GameInfo } from '@/lib/games';

/** Page header with the game's cover art. `compact` is a thin strip for pages where the game needs the room. */
export function GameBanner({ game, subtitle, compact, children }: { game: GameInfo; subtitle?: ReactNode; compact?: boolean; children?: ReactNode }) {
  if (compact) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverOf(game)} alt="" className="h-12 w-[76px] rounded-md border border-line object-cover" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold leading-tight">{game.name}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="relative mb-6 overflow-hidden rounded-xl border border-line bg-panel">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={coverOf(game)} alt="" className="absolute inset-y-0 right-0 h-full w-full object-cover sm:w-[70%]" />
      <div className="absolute inset-0 bg-gradient-to-r from-panel from-30% via-panel/80 to-transparent" />
      <div className="relative flex min-h-[150px] flex-wrap items-end justify-between gap-4 p-6 sm:min-h-[180px] sm:p-8">
        <div className="max-w-lg">
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{game.name}</h1>
          <p className="mt-1.5 text-muted">{subtitle ?? game.tagline}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
