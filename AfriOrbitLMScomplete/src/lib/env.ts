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
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  '';

/** Safe in the browser. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
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
  const missing: string[] = [];
  if (!publicEnv.supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!publicEnv.supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return missing;
}

/** Throws with an actionable message when public Supabase config is absent. */
export function assertSupabaseConfigured(caller: string): void {
  const missing = missingPublicEnv();
  if (missing.length === 0) return;
  throw new Error(
    `[${caller}] ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} empty in this build. ` +
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
