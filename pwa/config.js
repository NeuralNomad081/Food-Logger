/*
 * Supabase project config — PUBLIC values, safe to ship to browsers.
 * Get both from Supabase Dashboard → Project Settings → API.
 * Data is protected by Row Level Security, not by hiding these.
 */
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';

export function isConfigured() {
  return !SUPABASE_URL.includes('YOUR-PROJECT-REF')
    && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
}
