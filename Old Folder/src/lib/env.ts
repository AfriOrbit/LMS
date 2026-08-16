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

/** Safe in the browser. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME ?? 'AfriOrbit Space',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'learn@afriorbit.space',
} as const;

export function assertPublicEnv(): void {
  required('NEXT_PUBLIC_SUPABASE_URL', publicEnv.supabaseUrl);
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY', publicEnv.supabaseAnonKey);
}

/** Server only. Never import into a client component. */
export const serverEnv = {
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
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
