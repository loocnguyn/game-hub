'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '@/lib/auth';
import { usePresence } from '@/lib/presence';
import { api } from '@/lib/api';
import { Avatar, Button, Field, Modal, formatChips, inputClass, useToast } from './ui';

export function LogoMark({ size = 34 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/covers/logo.png" alt="" width={size} height={size} className="shrink-0 transition group-hover:-rotate-6" />;
}

export function Logo({ href = '/hub' }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2">
      <LogoMark />
      <span className="font-display text-xl font-extrabold">Neon Arcade</span>
    </Link>
  );
}

/** Chip balance with the rendered chip image. */
export function ChipAmount({ value, className }: { value: number | null | undefined; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 font-semibold tabular-nums', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/covers/chip.png" alt="" width={18} height={18} />
      {formatChips(value)}
    </span>
  );
}

const NAV = [
  { href: '/hub', label: 'Sảnh game' },
  { href: '/leaderboard', label: 'Xếp hạng' },
];

export function TopBar() {
  const { profile, chips, signOut, setProfile } = useAuth();
  const { online } = usePresence();
  const path = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [showOnline, setShowOnline] = useState(false);
  const [editName, setEditName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 sm:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={clsx('relative px-3 py-5 text-sm font-medium transition', path.startsWith(n.href) ? 'text-text after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent' : 'text-muted hover:text-text')}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowOnline(true)} className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-text sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {online.length} online
          </button>
          <div className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-accent" title="Chip ảo dùng cho casino">
            <ChipAmount value={chips} />
          </div>
          {profile && (
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-white/5">
                <Avatar name={profile.name} size={34} />
                <span className="hidden max-w-[120px] truncate text-sm font-semibold md:block">{profile.name}</span>
              </button>
              {menu && (
                <div className="glass absolute right-0 mt-2 w-56 overflow-hidden rounded-lg p-1 shadow-2xl" onMouseLeave={() => setMenu(false)}>
                  <div className="px-3 py-2 text-xs text-dim">@{profile.username}</div>
                  <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => { setMenu(false); setEditName(profile.name); }}>Đổi tên hiển thị</button>
                  <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => { setMenu(false); router.push('/leaderboard'); }}>Bảng xếp hạng</button>
                  <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-white/10" onClick={async () => { await signOut(); router.replace('/'); }}>Đăng xuất</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal open={showOnline} onClose={() => setShowOnline(false)} title={`Đang online (${online.length})`}>
        <ul className="space-y-2">
          {online.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
              <Avatar name={u.name} size={32} />
              <div className="min-w-0">
                <div className="truncate font-semibold">{u.name}{u.id === profile?.id && <span className="ml-1 text-xs text-dim">(bạn)</span>}</div>
                <div className="truncate text-xs text-muted">{u.where}</div>
              </div>
            </li>
          ))}
          {!online.length && <li className="text-sm text-muted">Chưa có ai online.</li>}
        </ul>
      </Modal>

      <Modal open={editName !== null} onClose={() => setEditName(null)} title="Đổi tên hiển thị">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              const r = await api<{ profile: typeof profile }>('profile.update', { name: editName });
              if (r.profile) setProfile(r.profile);
              toast.ok('Đã đổi tên');
              setEditName(null);
            } catch (err) {
              toast.err((err as Error).message);
            } finally {
              setSaving(false);
            }
          }}
          className="space-y-4"
        >
          <Field label="Tên hiển thị"><input className={inputClass} value={editName ?? ''} maxLength={30} onChange={(e) => setEditName(e.target.value)} autoFocus /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditName(null)}>Hủy</Button>
            <Button loading={saving}>Lưu</Button>
          </div>
        </form>
      </Modal>
    </header>
  );
}

/** Standard page shell for signed-in pages. */
export function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className={clsx('mx-auto px-4 py-6', wide ? 'max-w-[1500px]' : 'max-w-7xl')}>{children}</main>
    </div>
  );
}
