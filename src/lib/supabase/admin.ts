import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { assertSupabaseConfigured, publicEnv, serverEnv } from '@/lib/env';

/**
 * Service-role client. Bypasses row-level security entirely.
 *
 * Rules for using this:
 *   1. Only inside route handlers or server actions that have ALREADY
 *      established who the caller is and what they may do.
 *   2. Never pass user-controlled values straight into a filter that decides
 *      whose data is returned — resolve the subject from the session first.
 *   3. Never return raw results from this client to the browser without
 *      projecting them down to the fields the caller is entitled to.
 *
 * Legitimate uses in this codebase: the Stripe webhook (no user session),
 * public certificate verification (rate-limited, projected view), rate-limit
 * accounting, and admin operations that must touch auth-owned tables.
 */
export function createSupabaseAdminClient() {
  assertSupabaseConfigured('createSupabaseAdminClient');
  return createClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'afriorbit-lms-admin' } },
  });
}
