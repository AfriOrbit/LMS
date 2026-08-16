'use client';

import { createBrowserClient } from '@supabase/ssr';

import { publicEnv } from '@/lib/env';

let cached: ReturnType<typeof createBrowserClient> | undefined;

/** Browser Supabase client. Anon key only — never holds elevated credentials. */
export function createSupabaseBrowserClient() {
  cached ??= createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return cached;
}
