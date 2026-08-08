import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { publicEnv } from '@/lib/env';

/**
 * Request gate for the whole application. Runs before every matched route.
 *
 * Responsibilities, in order:
 *   1. Refresh the Supabase session cookie so server components see a live one.
 *   2. Decide, from JWT claims alone (no DB round trip), whether this request
 *      is allowed to reach the route it asked for.
 *   3. Apply security headers, including the CSP.
 *
 * The claim check here is a *routing* decision. It is deliberately not the
 * only thing standing between a user and data — row-level security in Postgres
 * is. If a claim is stale, the worst case is that someone reaches a page that
 * then renders nothing they are entitled to see.
 */

/** Routes that require an authenticated session. */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/learn',
  '/labs',
  '/certificates',
  '/account',
  '/admin',
  '/enroll',
];

/** Routes an authenticated user should be bounced away from. */
const AUTH_PAGES = ['/login', '/register', '/reset-password'];

/** Reachable while the account is still `pending` or MFA is incomplete. */
const ONBOARDING_PATHS = [
  '/account/security',
  '/account/mfa',
  '/pending',
  '/verify-email',
  '/redeem',
  '/logout',
];

const ADMIN_PREFIX = '/admin';
const INSTRUCTOR_PREFIXES = ['/admin/grading', '/admin/cohorts', '/admin/courses'];

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function redirect(request: NextRequest, pathname: string, from?: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  if (from && from !== pathname) url.searchParams.set('next', from);
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Verifies the JWT (locally when asymmetric keys are in use) and refreshes
  // the session when needed. Must run before any redirect so the refreshed
  // cookie is not discarded.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as
    | {
        sub?: string;
        email?: string;
        aal?: string;
        user_role?: string;
        account_status?: string;
        mfa_enabled?: boolean;
        email_verified?: boolean;
      }
    | undefined;

  const isAuthenticated = Boolean(claims?.sub);
  const role = claims?.user_role ?? 'learner';
  const status = claims?.account_status ?? 'pending';
  const aal = claims?.aal ?? 'aal1';
  const mfaEnabled = claims?.mfa_enabled === true;

  // Read as a plain env var rather than through lib/env, which is server-only
  // and would drag unrelated modules into the proxy bundle.
  const mfaPolicy = process.env.MFA_POLICY === 'staff' ? 'staff' : 'all';
  const mfaRequired = mfaPolicy === 'all' || role === 'admin' || role === 'instructor';

  const needsAuth = startsWithAny(pathname, PROTECTED_PREFIXES);
  const onOnboarding = startsWithAny(pathname, ONBOARDING_PATHS);

  let decision: NextResponse | undefined;

  if (needsAuth && !isAuthenticated) {
    decision = redirect(request, '/login', pathname);
  } else if (isAuthenticated && startsWithAny(pathname, AUTH_PAGES)) {
    decision = redirect(request, '/dashboard');
  } else if (isAuthenticated && !onOnboarding) {
    if (mfaEnabled && aal !== 'aal2') {
      // Enrolled but has not presented the second factor in this session.
      decision = redirect(request, '/account/mfa/challenge', pathname);
    } else if (mfaRequired && !mfaEnabled && needsAuth) {
      decision = redirect(request, '/account/mfa', pathname);
    } else if (needsAuth && status !== 'active') {
      decision = redirect(request, '/pending');
    } else if (startsWithAny(pathname, [ADMIN_PREFIX])) {
      const instructorOk =
        role === 'instructor' && startsWithAny(pathname, INSTRUCTOR_PREFIXES);
      if (role !== 'admin' && !instructorOk) {
        decision = redirect(request, '/dashboard');
      }
    }
  }

  const out = decision ?? response;

  // Carry any refreshed session cookies onto a redirect response.
  if (decision) {
    response.cookies.getAll().forEach((cookie) => decision!.cookies.set(cookie));
  }

  applySecurityHeaders(out, request);
  return out;
}

function applySecurityHeaders(response: NextResponse, request: NextRequest) {
  const isEmbed = request.nextUrl.pathname.startsWith('/embed');

  const allowedFrameAncestors = (
    process.env.EMBED_ALLOWED_ORIGINS ??
    'https://www.afriorbit.space https://afriorbit.space'
  )
    .split(/[,\s]+/)
    .filter(Boolean)
    .join(' ');

  // The embed route is the only thing we permit to be framed, and only by the
  // marketing site. Everything else — crucially every authenticated page — is
  // frame-denied, which is what keeps 2FA and session cookies out of reach of
  // a clickjacking or cross-frame attack.
  const frameAncestors = isEmbed ? `'self' ${allowedFrameAncestors}` : "'none'";

  const csp = [
    "default-src 'self'",
    // Next injects inline bootstrap scripts; 'strict-dynamic' with a nonce is
    // the stricter option but requires nonce plumbing through every script.
    // See docs/SECURITY.md for the upgrade path.
    "script-src 'self' 'unsafe-inline' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    `connect-src 'self' ${publicEnv.supabaseUrl} https://*.supabase.co wss://*.supabase.co https://api.stripe.com`,
    "media-src 'self' https://*.supabase.co",
    "frame-src 'self' https://js.stripe.com",
    `frame-ancestors ${frameAncestors}`,
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self), interest-cohort=()',
  );
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('Cross-Origin-Opener-Policy', isEmbed ? 'unsafe-none' : 'same-origin');
  if (!isEmbed) response.headers.set('X-Frame-Options', 'DENY');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the public embed script, which must
     * be cacheable and cross-origin readable.
     */
    '/((?!_next/static|_next/image|favicon.ico|embed.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
