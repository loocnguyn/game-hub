'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

let client: SupabaseClient | null = null;

/** Browser singleton. Uses the default storage key so the session is shared with /poker. */
export function sb(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}

/**
 * Resolves once the stored session has been restored and handed to Realtime.
 * Channels opened before this would join as `anon` and RLS would hide every row change.
 */
export async function realtimeReady(): Promise<void> {
  const client = sb();
  const { data } = await client.auth.getSession();
  if (data.session?.access_token) await client.realtime.setAuth(data.session.access_token);
}
