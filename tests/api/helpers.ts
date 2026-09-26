// Helpers for integration tests against the deployed Supabase project.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const URL = process.env.SUPABASE_URL || 'https://fedhavhjkmsweyhsxkkk.supabase.co';
export const KEY = process.env.SUPABASE_KEY || 'sb_publishable_gNxrf3C8oNlUxEFT14GCLQ_9oXCZ8He';
export const DOMAIN = 'players.royalpoker.test';

export interface TestUser {
  username: string;
  password: string;
  name: string;
  id: string;
  token: string;
  client: SupabaseClient;
}

const RUN = Date.now().toString(36).slice(-5);
let counter = 0;

export async function register(username: string, password: string, name: string) {
  const res = await fetch(`${URL}/functions/v1/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ username, password, name }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Creates (or reuses) a throwaway account and signs in. */
export async function makeUser(label: string): Promise<TestUser> {
  const username = `zt_${RUN}_${label}_${counter++}`.slice(0, 20);
  const password = `pw-${RUN}-test`;
  const name = `Test ${label}`;
  const r = await register(username, password, name);
  if (r.status !== 200 && r.status !== 409) throw new Error(`register failed ${r.status} ${JSON.stringify(r.body)}`);
  const client = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: `${username}@${DOMAIN}`, password });
  if (error || !data.session) throw new Error(`sign in failed: ${error?.message}`);
  return { username, password, name, id: data.user!.id, token: data.session.access_token, client };
}

export async function call<T = any>(u: TestUser | null, op: string, params: Record<string, unknown> = {}): Promise<{ status: number; body: T & { error?: string } }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: KEY };
  if (u) headers.Authorization = `Bearer ${u.token}`;
  const res = await fetch(`${URL}/functions/v1/hub`, { method: 'POST', headers, body: JSON.stringify({ op, ...params }) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Like `call` but throws on error. */
export async function ok<T = any>(u: TestUser, op: string, params: Record<string, unknown> = {}): Promise<T> {
  const r = await call<T>(u, op, params);
  if (r.status !== 200) throw new Error(`${op} -> ${r.status}: ${r.body?.error}`);
  return r.body;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 30_000, stepMs = 500): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for condition');
    await sleep(stepMs);
  }
}
