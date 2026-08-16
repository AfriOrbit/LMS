/**
 * Environment configuration.
 *
 * Public values are inlined at build time by Next and are safe to expose.
 * Server-only values are read lazily so that importing this module from a
 * client component cannot leak them — and so a missing optional integration
 * (Stripe, for example) does not break the whole build.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/**
 * `NEXT_PUBLIC_SITE_URL` is THIS APPLICATION'S origin — the LMS — not the
 * marketing site's.
 *
 * The name is a trap, and it is worth naming rather than leaving for someone
 * to fall into. Since the marketing site and the LMS became one project there
 * are two hostnames in play, and `NEXT_PUBLIC_SITE_HOST` (in lib/site-config)
 * means the marketing apex while this means the LMS. Anyone reading the
 * dashboard would reasonably set this to `https://afriorbit.space`, and the
 * consequences are quiet and bad: certificate verification URLs printed on
 * issued certificates would point at a hostname with no /verify route, and
 * Stripe would return buyers to a 404 after payment.
 *
 * So it defaults to the LMS host rather than requiring anyone to get it right.
 * In development it falls back to localhost, because a build there should not
 * send Stripe redirects to production.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const lmsHost = process.env.NEXT_PUBLIC_LMS_HOST?.trim() || 'develop.afriorbit.space';
  return process.env.NODE_ENV === 'production' ? `https://${lmsHost}` : 'http://localhost:3000';
}

/**
 * TWO NAMES FOR THE SAME KEY, AND WHY BOTH ARE ACCEPTED.
 *
 * Supabase has renamed its API keys: `anon` is now `publishable`, and
 * `service_role` is now `secret`. The Supabase Vercel integration writes the
 * NEW names — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
 * `SUPABASE_SECRET_KEY` — while most existing code, this project included, was
 * written against the old ones.
 *
 * The failure that causes is genuinely nasty to debug: you connect the
 * official integration, the Vercel dashboard fills with Supabase variables,
 * and the app still insists Supabase is not configured. Nothing is wrong on
 * either side; the two are just using different vocabulary.
 *
 * So both are read, old name first. Each is a static `process.env.X` reference
 * so Next inlines both at build time — a computed lookup would silently
 * produce `undefined` in the browser.
 */
const anonKey = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  ''
).trim();

/** Safe in the browser. */
export const publicEnv = {
  /*
   * TRIMMED, and that is not cosmetic.
   *
   * A value pasted into a hosting dashboard picks up a trailing newline more
   * often than anyone expects. This one is interpolated into the
   * Content-Security-Policy header, and an HTTP header value may not contain
   * CR or LF: `Headers.set` throws `invalid header value`, the proxy throws on
   * EVERY request, and the whole site returns 500 — while the build succeeds
   * perfectly, because nothing is wrong at compile time.
   *
   * That failure cost a day of debugging. Trimming here is the cheap half of
   * the fix; the other half is in proxy.ts, which now derives a parsed origin
   * rather than trusting this string.
   */
  supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
  supabaseAnonKey: anonKey,
  siteUrl: resolveSiteUrl(),
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'AfriOrbit Space',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'learn@afriorbit.space',
} as const;

export function assertPublicEnv(): void {
  required('NEXT_PUBLIC_SUPABASE_URL', publicEnv.supabaseUrl);
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY', publicEnv.supabaseAnonKey);
}

/**
 * Which required public variables are absent, as a list rather than a throw.
 *
 * The proxy uses this to redirect to /setup instead of dying, and the Supabase
 * client factories use it to raise an error that says what to do. The
 * @supabase/ssr SDK's own message — "Your project's URL and Key are required
 * to create a Supabase client!" — is accurate but says nothing about *why*
 * they are absent when the hosting dashboard clearly shows them set. That
 * "why" is almost always build-time inlining, and it deserves to be in the
 * error text where someone reading a log will see it.
 */
export function missingPublicEnv(): string[] {
  return publicEnvProblems().map((p) => p.name);
}

export interface EnvProblem {
  name: string;
  reason: 'absent' | 'malformed';
  detail: string;
}

/**
 * PRESENT IS NOT THE SAME AS USABLE, and conflating the two cost a day.
 *
 * This function used to test emptiness alone. A `NEXT_PUBLIC_SUPABASE_URL` set
 * to `gqobaozemkhcsoiecazp.supabase.co` — the project reference without the
 * scheme, which is exactly what you get by copying the hostname out of a
 * browser address bar — is not empty, so the guard in the proxy waved it
 * through, and the very next line handed it to `createServerClient`, which
 * threw:
 *
 *     Error: Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.
 *
 * The proxy runs on every matched request, so that throw was a 500 on every
 * page of the LMS. Worse, it was a 500 on `/setup` too — the one page whose
 * entire job is to explain a configuration mistake. The diagnostic could not
 * reach the person who needed it because the diagnostic was behind the fault.
 *
 * So validity is checked here, at the same gate as presence, and a malformed
 * value is treated exactly like an absent one: redirect to /setup, which
 * re-reads the raw value and says what is wrong with it in words.
 */
export function publicEnvProblems(): EnvProblem[] {
  const problems: EnvProblem[] = [];

  if (!publicEnv.supabaseUrl) {
    problems.push({
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      reason: 'absent',
      detail: 'not set in this build',
    });
  } else if (!isUsableHttpUrl(publicEnv.supabaseUrl)) {
    problems.push({
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      reason: 'malformed',
      detail: 'set, but not a valid http(s) URL — it needs the https:// scheme',
    });
  }

  if (!publicEnv.supabaseAnonKey) {
    problems.push({
      name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      reason: 'absent',
      detail: 'not set in this build',
    });
  }

  return problems;
}

/**
 * The same test `@supabase/supabase-js` applies internally, made explicit here
 * so the failure happens at a gate we control rather than inside a constructor
 * three stack frames deep in a minified chunk.
 */
export function isUsableHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Throws with an actionable message when public Supabase config is absent. */
export function assertSupabaseConfigured(caller: string): void {
  const problems = publicEnvProblems();
  if (problems.length === 0) return;
  const missing = problems.map((p) => `${p.name} (${p.detail})`);
  throw new Error(
    `[${caller}] ${missing.join(' and ')}. ` +
      'These are NEXT_PUBLIC_ variables, which Next.js inlines at BUILD time — ' +
      'setting them in your hosting dashboard does nothing until you redeploy ' +
      'WITHOUT the build cache. Also confirm they are enabled for the Production ' +
      'environment, not only Preview. Visit /api/health on this deployment to see ' +
      'which build is live and exactly what it can read.',
  );
}

/** Server only. Never import into a client component. */
export const serverEnv = {
  /**
   * `SUPABASE_SECRET_KEY` is the new name for `SUPABASE_SERVICE_ROLE_KEY`, and
   * it is what the Supabase Vercel integration writes. Both are accepted for
   * the same reason as the publishable key above. Read at runtime, so no
   * inlining concern here.
   */
  get supabaseServiceRoleKey(): string {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!key) {
      throw new Error(
        'Missing the Supabase secret key. Set SUPABASE_SERVICE_ROLE_KEY, or ' +
          'SUPABASE_SECRET_KEY if you are using the Supabase Vercel integration, ' +
          'which writes the newer name. Never prefix either with NEXT_PUBLIC_.',
      );
    }
    return key;
  },
  get ipHashSalt(): string {
    return required('IP_HASH_SALT', process.env.IP_HASH_SALT);
  },
  get stripeSecretKey(): string | undefined {
    return process.env.STRIPE_SECRET_KEY;
  },
  get stripeWebhookSecret(): string | undefined {
    return process.env.STRIPE_WEBHOOK_SECRET;
  },
  /**
   * 'all'   — every account must hold a verified TOTP factor (default)
   * 'staff' — required for admins and instructors, optional for learners
   */
  get mfaPolicy(): 'all' | 'staff' {
    return process.env.MFA_POLICY === 'staff' ? 'staff' : 'all';
  },
  /**
   * 'approval' — new accounts land in `pending` and an admin activates them
   * 'open'     — accounts activate as soon as email is verified
   */
  get registrationMode(): 'approval' | 'open' {
    return process.env.REGISTRATION_MODE === 'open' ? 'open' : 'approval';
  },
  /** Comma-separated origins permitted to iframe the embeddable catalog. */
  get embedAllowedOrigins(): string[] {
    return (process.env.EMBED_ALLOWED_ORIGINS ?? 'https://www.afriorbit.space,https://afriorbit.space')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },
} as const;

export const isProduction = process.env.NODE_ENV === 'production';
