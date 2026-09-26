// Public Supabase settings (the publishable key is meant to be exposed; data is protected by RLS).
// Shared with Royal Poker so one account works across every game.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fedhavhjkmsweyhsxkkk.supabase.co';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || 'sb_publishable_gNxrf3C8oNlUxEFT14GCLQ_9oXCZ8He';
export const USER_DOMAIN = 'players.royalpoker.test';
