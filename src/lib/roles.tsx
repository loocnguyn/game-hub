'use client';
import { useEffect, useState } from 'react';
import { sb } from './supabase';

export type Role = 'admin' | 'member';

// Roles live in hub_profiles.role, which clients can read but never write.
let adminIds: Promise<Set<string>> | null = null;
function loadAdmins() {
  adminIds ??= Promise.resolve(sb().from('hub_profiles').select('id').eq('role', 'admin'))
    .then(({ data }) => new Set((data ?? []).map((r: { id: string }) => r.id)))
    .catch(() => {
      adminIds = null; // try again next time
      return new Set<string>();
    });
  return adminIds;
}

/** Ids of admin accounts (fetched once per page load). */
export function useAdmins(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    loadAdmins().then((s) => live && setIds(s));
    return () => {
      live = false;
    };
  }, []);
  return ids;
}

export function RoleBadge({ role, className = '' }: { role: Role; className?: string }) {
  if (role !== 'admin') return null;
  return <span className={`inline-flex shrink-0 items-center rounded bg-accent px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-accent-ink ${className}`}>Admin</span>;
}
