'use client';

import { createBrowserClient } from '@supabase/ssr';

import { assertSupabaseConfigured, publicEnv } from '@/lib/env';

let cached: ReturnType<typeof createBrowserClient> | undefined;

/** Browser Supabase client. Anon key only — never holds elevated credentials. */
export function createSupabaseBrowserClient() {
  assertSupabaseConfigured('createSupabaseBrowserClient');
  cached ??= createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return cached;
}
