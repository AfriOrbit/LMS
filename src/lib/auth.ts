import 'server-only';

import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole, Profile } from '@/types/db';

export interface SessionContext {
  userId: string;
  email: string;
  profile: Profile;
  /** True when the caller presented a second factor in this session. */
  aal2: boolean;
}

/**
 * Load the caller's identity from the verified session plus their live profile
 * row. Returns null when unauthenticated.
 *
 * Note that `profile` is fetched under RLS, so it can only ever be the
 * caller's own row (or, for staff, a row they are entitled to read).
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createSupabaseServerClient();

  /*
   * WRAPPED, for the same reason the identical call in src/proxy.ts is
   * wrapped — and this one was not, which was an inconsistency waiting to
   * happen.
   *
   * `getClaims` is a network call: it fetches the project's JWKS to verify the
   * token. If that fetch fails — a paused project, a DNS blip, a cold start
   * that races the network — the rejection propagates out of every page that
   * calls this, and a Server Component that rejects is a blank "Internal
   * Server Error". Note which pages those are: only the signed-in ones. The
   * marketing site, the catalogue and the login page would all keep working,
   * which makes the failure look like a bug in the dashboard rather than a bad
   * minute at Supabase.
   *
   * Degrading to signed-out is the right failure. Row-level security, not this
   * call, is what protects the data; the worst case is that someone is sent to
   * /login and signs in again.
   */
  let claimsData: Awaited<ReturnType<typeof supabase.auth.getClaims>>['data'] = null;
  try {
    ({ data: claimsData } = await supabase.auth.getClaims());
  } catch (error) {
    console.error('[auth] getClaims failed; treating request as signed out', error);
    return null;
  }

  const claims = claimsData?.claims as
    | { sub?: string; email?: string; aal?: string }
    | undefined;

  if (!claims?.sub) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', claims.sub)
    .single<Profile>();

  if (error || !profile) return null;

  return {
    userId: claims.sub,
    email: claims.email ?? profile.email,
    profile,
    aal2: claims.aal === 'aal2',
  };
}

/** Require a signed-in user, else send them to login. */
export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  return ctx;
}

/**
 * Require an approved account that has cleared its second factor.
 * This is the guard for everything that touches course content.
 */
export async function requireActiveMember(): Promise<SessionContext> {
  const ctx = await requireUser();

  if (ctx.profile.mfa_enabled && !ctx.aal2) redirect('/account/mfa/challenge');

  const policy = process.env.MFA_POLICY === 'staff' ? 'staff' : 'all';
  const mfaRequired =
    policy === 'all' || ctx.profile.role === 'admin' || ctx.profile.role === 'instructor';
  if (mfaRequired && !ctx.profile.mfa_enabled) redirect('/account/mfa');

  if (ctx.profile.status !== 'active') redirect('/pending');

  return ctx;
}

const RANK: Record<AppRole, number> = { learner: 0, instructor: 1, admin: 2 };

/** Require at least the given role, on top of the active-member checks. */
export async function requireRole(minimum: AppRole): Promise<SessionContext> {
  const ctx = await requireActiveMember();
  if (RANK[ctx.profile.role] < RANK[minimum]) redirect('/dashboard');
  return ctx;
}

export async function requireStaff(): Promise<SessionContext> {
  return requireRole('instructor');
}

export async function requireAdmin(): Promise<SessionContext> {
  return requireRole('admin');
}

/**
 * Guard for API route handlers. Unlike the page guards it throws a Response
 * rather than redirecting, so handlers can return a clean JSON error.
 */
export async function requireApiUser(options?: {
  role?: AppRole;
  requireActive?: boolean;
  requireAal2?: boolean;
}): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) {
    throw new ApiAuthError(401, 'authentication_required');
  }
  if (options?.requireAal2 !== false && ctx.profile.mfa_enabled && !ctx.aal2) {
    throw new ApiAuthError(403, 'second_factor_required');
  }
  if (options?.requireActive !== false && ctx.profile.status !== 'active') {
    throw new ApiAuthError(403, 'account_not_active');
  }
  if (options?.role && RANK[ctx.profile.role] < RANK[options.role]) {
    throw new ApiAuthError(403, 'insufficient_role');
  }
  return ctx;
}

export class ApiAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiAuthError';
  }
}
