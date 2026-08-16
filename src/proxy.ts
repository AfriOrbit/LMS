import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { missingPublicEnv, publicEnv } from '@/lib/env';

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
 * The Supabase origin, as something that is safe to put in a header.
 *
 * Never interpolate a raw environment value into an HTTP header. A trailing
 * newline on a pasted variable makes `Headers.set` throw `invalid header
 * value`; because this runs in the proxy, that throw turns into a 500 on every
 * single route while the build stays green — one of the least diagnosable
 * failures this app can have.
 *
 * `new URL(...).origin` is structurally incapable of containing whitespace, so
 * parsing and re-serialising removes the hazard rather than papering over it.
 * If the value will not parse, the entry is simply omitted: the
 * `https://*.supabase.co` wildcard on the same directive still covers every
 * real project, so the policy stays correct and the site stays up.
 */
function supabaseOrigin(): string {
  try {
    return new URL(publicEnv.supabaseUrl).origin;
  } catch {
    return '';
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * THE MARKETING SITE USED TO BE SERVED FROM HERE, AND IS NOT ANY MORE.
   *
   * There was a branch at the top of this function that matched the apex
   * hostname and rewrote it to a /www route group holding a vendored copy of
   * afriorbit.space. The company site is now its own deployment with its own
   * repository, so that copy was a second source of truth for the same nine
   * pages — and a live trap: attaching afriorbit.space to THIS project would
   * have served the old design, silently, while the new one sat unreachable on
   * another deployment.
   *
   * Removing it also removes a `dangerouslySetInnerHTML` surface and about
   * 220 kB of vendored HTML and JavaScript from this repository.
   *
   * Consequence worth knowing: this project must never have afriorbit.space
   * attached to it. Only develop.afriorbit.space (or whatever the LMS
   * hostname becomes) belongs here.
   */

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

  /*
   * The constructor is inside a try, and the check above is not redundant with
   * it.
   *
   * The check above knows *why* a value is unusable and can say so. This catch
   * knows only that something threw — but it covers the cases nobody
   * anticipated, and in this position that matters more than the quality of
   * the message. Anything that throws here throws on every request the proxy
   * matches, which is every page, `/setup` included. A site whose diagnostic
   * page is taken down by the fault it diagnoses has no way back in except
   * reading platform logs, and the whole point of /setup is to spare someone
   * that.
   *
   * `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL` is the throw that
   * prompted this. It should now be impossible to reach — and if some future
   * version of the SDK finds a new reason to reject its arguments, the site
   * degrades to a page explaining itself rather than to 500s.
   */
  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
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
  } catch (error) {
    console.error(
      'AFRIORBIT_SERVER_ERROR [proxy] the Supabase client could not be constructed. ' +
        'This is a configuration fault, not a code fault — see /setup.',
      error,
    );
    if (pathname === '/setup') {
      const pass = NextResponse.next({ request });
      applySecurityHeaders(pass, request);
      return pass;
    }
    const url = request.nextUrl.clone();
    url.pathname = '/setup';
    url.search = '?missing=NEXT_PUBLIC_SUPABASE_URL';
    const out = NextResponse.redirect(url);
    applySecurityHeaders(out, request);
    return out;
  }

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
    `connect-src 'self' ${supabaseOrigin()} https://*.supabase.co wss://*.supabase.co https://api.stripe.com`,
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
