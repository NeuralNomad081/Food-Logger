/*
 * Supabase project config — PUBLIC values, safe to ship to browsers.
 * Get both from Supabase Dashboard → Project Settings → API.
 * Data is protected by Row Level Security, not by hiding these.
 */
export const SUPABASE_URL = 'https://gumlzhyllcqbkbkudzll.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_jkZB2XbUg4ZZIRyozkFxlQ_jlG-Cg2r';

export function isConfigured() {
  return !SUPABASE_URL.includes('YOUR-PROJECT-REF')
    && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
}
