import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { assertSupabaseConfigured, publicEnv } from '@/lib/env';

/**
 * Request-scoped Supabase client that carries the caller's session.
 *
 * All queries made through this client run as the authenticated user and are
 * subject to row-level security. This is the client you should reach for by
 * default; the service-role client is a deliberate escalation.
 */
export async function createSupabaseServerClient() {
  /*
   * `await cookies()` must come first. Reading cookies is what tells Next this
   * route is dynamic, so during a production build it bails out of
   * prerendering right here and the code below never runs at build time.
   *
   * Asserting before this line breaks `next build` whenever the environment is
   * incomplete — which is precisely the situation where a successful build
   * matters most, because the deployed app is what serves the /setup page that
   * explains the problem. A build that fails on missing config leaves the
   * previous broken deployment in place and tells the operator nothing.
   */
  const cookieStore = await cookies();
  assertSupabaseConfigured('createSupabaseServerClient');

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh is handled in proxy.ts, so this is safe to ignore.
        }
      },
    },
  });
}
