/**
 * site-config.ts — which hostname is which, and where the other property is.
 *
 * This file used to describe one Vercel project serving two properties, with a
 * predicate that decided per-request whether a hostname was the marketing site
 * or the LMS. That is no longer the architecture: the company site is its own
 * deployment, so this project serves exactly one thing and the only question
 * left is the address of the OTHER one.
 *
 * `SITE_HOST` / `isWebsiteHost` are gone with the /www route group they served.
 * If they come back, so does the trap they created — see the note at the top of
 * proxy.ts.
 *
 * These are NEXT_PUBLIC_ because the cross-link is rendered in the browser.
 * They are hostnames, not secrets.
 */

/** This application's hostname. The learning platform lives here. */
export const LMS_HOST = process.env.NEXT_PUBLIC_LMS_HOST ?? 'develop.afriorbit.space';

export const LMS_URL = `https://${LMS_HOST}`;

/**
 * The marketing site, as an absolute URL — the other half of the cross-link.
 *
 * The LMS and the company site are two deployments. From here the only route
 * back is the "AfriOrbit Home" button, so this address has to be correct and
 * has to be changeable without a code edit: today it points at the vercel.app
 * deployment, and it becomes https://afriorbit.space the day that domain is
 * attached.
 *
 * `NEXT_PUBLIC_WEBSITE_URL` overrides it. A malformed value falls back rather
 * than rendering a dead button, and check-routing.ts asserts the result is a
 * bare https origin so a typo cannot ship quietly.
 *
 * The default is the live deployment as of this change. When afriorbit.space is
 * attached to the WEBSITE project, set the variable here to `https://afriorbit.space`
 * and redeploy — it is NEXT_PUBLIC_, so it is compiled in at build time and a
 * dashboard edit alone will not move it.
 */
export const WEBSITE_URL: string = (() => {
  const fallback = 'https://afriorbit-website.vercel.app';
  const raw = process.env.NEXT_PUBLIC_WEBSITE_URL?.trim().replace(/\/+$/, '');
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : fallback;
  } catch {
    return fallback;
  }
})();

/** The Home button. Internal now — the marketing pages live at /home. */
export const HOME_PATH = '/home';
export const HOME_LABEL = 'Home';

/**
 * The Squarespace main site.
 *
 * afriorbit.space is the company's front door and it is not this application.
 * The link is environment-configurable because the address can move — to the
 * apex, to www, or to a squarespace.com address while a domain is in flight —
 * and a hostname baked into a component is how a link rots.
 *
 * NEXT_PUBLIC_ because it renders in statically generated markup, so it is
 * compiled in at BUILD time: changing it needs a redeploy, not just a save.
 */
export const MAIN_SITE_URL: string = (() => {
  const fallback = 'https://afriorbit.space';
  const raw = process.env.NEXT_PUBLIC_MAIN_SITE_URL?.trim().replace(/\/+$/, '');
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : fallback;
  } catch {
    return fallback;
  }
})();

export const MAIN_SITE_LABEL = 'AfriOrbit Space';

/**
 * Kept as an alias so nothing that already imported it breaks. The separate
 * marketing deployment is retired; its pages are served from /home by this
 * application now.
 */
export const WEBSITE_LABEL = MAIN_SITE_LABEL;
