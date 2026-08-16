/**
 * site-config.ts — which hostname is which.
 *
 * One Vercel project serves two properties. Everything that needs to know
 * which is which reads it from here, so moving the LMS from `develop.` to
 * `learn.` later is one environment variable and a DNS record, not a search
 * across the codebase.
 *
 * These are NEXT_PUBLIC_ because the website layout renders a cross-origin link
 * to the LMS in the browser. They are hostnames, not secrets.
 *
 * The defaults are the production values, so a fresh clone and a preview
 * deployment both behave sensibly with no environment set at all.
 */

/** Apex hostname. The marketing site lives here. */
export const SITE_HOST = process.env.NEXT_PUBLIC_SITE_HOST ?? 'afriorbit.space';

/** Subdomain hostname. The learning platform lives here. */
export const LMS_HOST = process.env.NEXT_PUBLIC_LMS_HOST ?? 'develop.afriorbit.space';

export const SITE_URL = `https://${SITE_HOST}`;
export const LMS_URL = `https://${LMS_HOST}`;

/**
 * Is this request for the marketing site?
 *
 * Matches the apex and its `www.` form. Everything else — the LMS subdomain,
 * `*.vercel.app` preview URLs, and localhost — is treated as the LMS, because
 * that is where development and preview work happens and a preview URL that
 * silently showed the marketing site would be a confusing default.
 *
 * The `?site=1` escape hatch makes the marketing site reachable on a preview
 * deployment, which is the only practical way to review it before the domain
 * is pointed at the project.
 */
export function isWebsiteHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.split(':')[0].toLowerCase();
  return h === SITE_HOST || h === `www.${SITE_HOST}`;
}
