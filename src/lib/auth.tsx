'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { sb } from './supabase';
import { api, register as registerAccount } from './api';
import { USER_DOMAIN } from './config';

export interface Profile {
  id: string;
  username: string;
  name: string;
  avatar: string;
}

interface AuthState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  chips: number | null;
  signIn(username: string, password: string): Promise<void>;
  signUp(username: string, password: string, name: string): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  setChips(n: number): void;
  setProfile(p: Profile): void;
}

const Ctx = createContext<AuthState | null>(null);

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase();
}

function fallbackProfile(session: Session): Profile {
  const meta = session.user.user_metadata || {};
  const username = String(meta.username || (session.user.email || '').split('@')[0]);
  return { id: session.user.id, username, name: String(meta.full_name || username), avatar: '' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [chips, setChips] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ profile: Profile; chips: number }>('me');
      setProfile(me.profile);
      setChips(me.chips);
    } catch {
      /* keep the fallback profile */
    }
  }, []);

  useEffect(() => {
    const client = sb();
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) setProfile(fallbackProfile(data.session));
      setReady(true);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) setProfile((p) => (p && p.id === s.user.id ? p : fallbackProfile(s)));
      else {
        setProfile(null);
        setChips(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user.id) refresh();
  }, [session?.user.id, refresh]);

  const value = useMemo<AuthState>(() => ({
    ready, session, profile, chips,
    async signIn(username, password) {
      const u = normalizeUsername(username);
      const { error } = await sb().auth.signInWithPassword({ email: `${u}@${USER_DOMAIN}`, password });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Sai tên đăng nhập hoặc mật khẩu' : error.message);
    },
    async signUp(username, password, name) {
      await registerAccount(normalizeUsername(username), password, name);
      const { error } = await sb().auth.signInWithPassword({ email: `${normalizeUsername(username)}@${USER_DOMAIN}`, password });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await sb().auth.signOut();
    },
    refresh,
    setChips,
    setProfile,
  }), [ready, session, profile, chips, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** Redirects to the landing page when signed out. Returns true once the user is known to be signed in. */
export function useRequireAuth(): boolean {
  const { ready, session } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready && !session) {
      const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/hub';
      router.replace(`/?next=${encodeURIComponent(next)}`);
    }
  }, [ready, session, router]);
  return ready && !!session;
}
