import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { missingPublicEnv, publicEnv } from '@/lib/env';
import { isWebsiteHost } from '@/lib/site-config';

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

/**
 * Security headers for the marketing site.
 *
 * Deliberately NOT the LMS policy. The apex has no session, talks to no
 * backend and posts to no form handler, so its `connect-src` should not name
 * Supabase or Stripe at all — a policy that grants reach nothing on that
 * hostname uses is just a wider hole. It also means these headers can be
 * applied before the environment check, which is what lets the marketing site
 * stay up when the LMS configuration is broken.
 */
function applyWebsiteHeaders(response: NextResponse): void {
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // Next emits inline bootstrap scripts. Same trade-off as the LMS policy;
      // see docs/SECURITY.md for the nonce upgrade path.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ].join('; '),
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()',
  );
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * TWO PROPERTIES, ONE PROJECT.
   *
   * The apex (afriorbit.space) serves the marketing site; the LMS subdomain
   * serves the learning platform. This branch is FIRST, before the environment
   * check and before any Supabase client is constructed, and that ordering is
   * the point rather than an optimisation:
   *
   *   - The marketing pages are statically prerendered and need no session.
   *     Refreshing one on every page view would add a Supabase round trip to
   *     the critical path of the front page.
   *   - It decouples availability. A paused Supabase project, a rotated key or
   *     a missing environment variable takes the LMS down; it must not take the
   *     company's public website down with it, and without this ordering it
   *     would — every apex request would redirect to /setup.
   */
  if (isWebsiteHost(request.headers.get('host'))) {
    const url = request.nextUrl.clone();
    if (!pathname.startsWith('/www')) {
      url.pathname = pathname === '/' ? '/www' : `/www${pathname}`;
    }
    const out = NextResponse.rewrite(url);
    applyWebsiteHeaders(out);
    return out;
  }

  /*
   * Fail visibly, not fatally.
   *
   * Without this the Supabase client constructor throws on a missing URL or
   * key, and because this proxy runs on every matched route the whole site
   * returns 500 — including robots.txt, which makes it look like an outage
   * rather than a configuration error. Redirecting to a page that names the
   * missing variables turns a two-hour investigation into a ten-second read.
   */
  const missing = missingPublicEnv();
  if (missing.length > 0) {
    if (pathname === '/setup') {
      const pass = NextResponse.next({ request });
      applySecurityHeaders(pass, request);
      return pass;
    }
    const url = request.nextUrl.clone();
    url.pathname = '/setup';
    url.search = `?missing=${encodeURIComponent(missing.join(','))}`;
    const out = NextResponse.redirect(url);
    applySecurityHeaders(out, request);
    return out;
  }

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
  //
  // Wrapped because this is a network call to Supabase on every request. If
  // the project is paused, the key is wrong, or Supabase has a bad minute,
  // an unhandled rejection here would 500 the entire site rather than
  // degrading to logged-out — which is the correct behaviour: row-level
  // security, not this call, is what protects the data.
  let claimsData: Awaited<ReturnType<typeof supabase.auth.getClaims>>['data'] = null;
  try {
    ({ data: claimsData } = await supabase.auth.getClaims());
  } catch (error) {
    console.error('[proxy] getClaims failed; treating request as signed out', error);
  }
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
    /*
     * api/health is excluded deliberately. It is the probe you reach for when
     * everything else is broken, so it must not depend on the component most
     * likely to be broken.
     */
    '/((?!_next/static|_next/image|favicon.ico|embed.js|afriorbit-sims.js|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|js)$).*)',
  ],
};
