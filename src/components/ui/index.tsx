'use client';
import { clsx } from 'clsx';
import { createContext, isValidElement, useCallback, useContext, useEffect, useId, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ---------------- Button ----------------
type Variant = 'primary' | 'ghost' | 'danger' | 'success' | 'gold';
export function Button({
  variant = 'primary', size = 'md', className, loading, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const base = 'relative inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 select-none disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.97]';
  const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };
  const variants: Record<Variant, string> = {
    primary: 'text-white bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 shadow-[0_8px_30px_-8px_rgba(168,85,247,0.8)] hover:brightness-110',
    ghost: 'text-text bg-white/5 border border-white/10 hover:bg-white/10',
    danger: 'text-white bg-gradient-to-r from-rose-600 to-red-500 hover:brightness-110',
    success: 'text-white bg-gradient-to-r from-emerald-500 to-green-500 hover:brightness-110',
    gold: 'text-black bg-gradient-to-r from-amber-300 to-yellow-500 hover:brightness-110',
  };
  return (
    <button className={clsx(base, sizes[size], variants[variant], className)} disabled={loading || rest.disabled} {...rest}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className ?? 'h-5 w-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('glass neon-ring rounded-2xl', className)}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  // A <label> would name the *first* button of a Segmented control, so only native form
  // controls get one; groups of buttons are labelled with aria-labelledby instead.
  const nativeControl = isValidElement(children) && typeof children.type === 'string' && ['input', 'select', 'textarea'].includes(children.type);
  const caption = <span id={id} className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">{label}</span>;
  const hintEl = hint && <span className="mt-1 block text-xs text-dim">{hint}</span>;
  if (nativeControl) {
    return <label className="block">{caption}{children}{hintEl}</label>;
  }
  return <div role="group" aria-labelledby={id} className="block">{caption}{children}{hintEl}</div>;
}

export const inputClass =
  'h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 text-[15px] outline-none transition placeholder:text-dim focus:border-cyan-400/60 focus:bg-black/40';

export function Segmented<T extends string | number>({
  value, onChange, options, className,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={clsx('inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/30 p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition',
            o.value === value ? 'bg-gradient-to-r from-cyan-500/80 to-violet-500/80 text-white shadow' : 'text-muted hover:bg-white/5 hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(-2).join('').toUpperCase() || '?';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{
        width: size, height: size, fontSize: size * 0.38,
        background: color ?? `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${(hue + 60) % 360} 80% 45%))`,
        boxShadow: '0 0 0 2px rgba(255,255,255,0.12)',
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

// ---------------- Modal ----------------
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose?: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open || !onClose) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            role="dialog" aria-modal
            className={clsx('glass neon-ring max-h-[90vh] w-full overflow-auto rounded-2xl p-6', wide ? 'max-w-3xl' : 'max-w-md')}
            initial={{ y: 20, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {title && <h2 className="font-display mb-4 text-xl font-bold">{title}</h2>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------- Toasts ----------------
type Toast = { id: number; text: ReactNode; kind: 'info' | 'ok' | 'err'; action?: { label: string; onClick: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, 'id'> & { ms?: number }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'> & { ms?: number }) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.ms ?? 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
              className={clsx(
                'pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl',
                t.kind === 'err' && 'border-red-400/30 bg-red-950/80 text-red-100',
                t.kind === 'ok' && 'border-emerald-400/30 bg-emerald-950/80 text-emerald-100',
                t.kind === 'info' && 'border-white/10 bg-slate-900/85 text-text',
              )}
            >
              <span className="flex-1">{t.text}</span>
              {t.action && (
                <button className="rounded-lg bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25" onClick={() => { t.action!.onClick(); setToasts((xs) => xs.filter((x) => x.id !== t.id)); }}>
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastCtx);
  // Stable identity: callers put the toast object in hook dependency lists.
  return useMemo(() => ({
    info: (text: ReactNode, opts?: Partial<Toast> & { ms?: number }) => push({ text, kind: 'info', ...opts }),
    ok: (text: ReactNode, opts?: Partial<Toast> & { ms?: number }) => push({ text, kind: 'ok', ...opts }),
    err: (text: ReactNode, opts?: Partial<Toast> & { ms?: number }) => push({ text, kind: 'err', ...opts }),
  }), [push]);
}

// ---------------- misc ----------------
export function formatMs(ms: number, withTenths = false): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const base = `${m}:${String(s).padStart(2, '0')}`;
  if (withTenths) return `${base}.${Math.floor((t % 1000) / 100)}`;
  return base;
}
export function formatChips(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('vi-VN');
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider" style={color ? { color, borderColor: `${color}55` } : undefined}>
      {children}
    </span>
  );
}
