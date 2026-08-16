import Link from 'next/link';
import Script from 'next/script';
import type { ReactNode } from 'react';

import { NAV_PRODUCTS, NAV_TOP } from '@/content/site-pages';
import { LMS_URL } from '@/lib/site-config';

import { NavProducts } from './nav-products';

/*
 * IBM Plex, self-hosted from npm.
 *
 * The design system asks for it through --ao-sans and --ao-mono, and the
 * static site pulled it from Google's CDN at runtime. Neither that nor
 * `next/font/google` is right here:
 *
 *   - the CDN link puts a third-party origin on the critical path of every
 *     page and would need the CSP widened to allow it;
 *   - `next/font/google` removes the runtime dependency but replaces it with a
 *     BUILD-TIME one — it fetches the font files from fonts.googleapis.com
 *     during `next build`. A deploy that fails because Google was unreachable
 *     is exactly the kind of avoidable fragility that has already cost this
 *     project two broken deploys.
 *
 * Fontsource ships the same woff2 files as an npm package, so they arrive with
 * `npm ci` and the build touches no network at all. Only the weights the
 * design system actually uses are imported; the package contains 100-700 plus
 * italics, and importing the lot would add about a megabyte for nothing.
 */
import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

import '@/styles/orbit-ds.css';

/**
 * The public marketing site.
 *
 * WHY THESE PAGES LIVE UNDER /www
 *
 * This app serves two hostnames from one Vercel project: the apex
 * (afriorbit.space) shows the marketing site, and the LMS subdomain shows the
 * learning platform. `src/proxy.ts` rewrites apex requests from `/rocketry` to
 * `/www/rocketry`.
 *
 * The alternative — putting the marketing pages at the real root — collides
 * immediately: both properties want `/`, and several LMS routes (`/catalog`,
 * `/login`) would shadow or be shadowed by a root catch-all. An internal
 * prefix keeps the two route trees disjoint, so a new marketing page can never
 * silently take over an LMS URL.
 *
 * `/www/*` is reachable directly on the LMS host too. That is deliberate: it
 * makes the rewrite debuggable in production without DNS games. The proxy
 * canonicalises anyone who lands there from the apex.
 */

export const metadata = {
  metadataBase: new URL('https://www.afriorbit.space'),
};

function Brand() {
  return (
    <Link className="ao-brand" href="/">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="6.5" fill="var(--ao-accent)" />
        <ellipse
          cx="16"
          cy="16"
          rx="14"
          ry="5.5"
          fill="none"
          stroke="var(--ao-ember)"
          strokeWidth="1.6"
          transform="rotate(-28 16 16)"
        />
        <circle cx="27" cy="10.2" r="2.1" fill="var(--ao-ember)" />
      </svg>
      AfriOrbit <span className="ao-brand__sub">Space</span>
    </Link>
  );
}

export default function WebsiteLayout({ children }: { children: ReactNode }) {
  return (
    /*
     * `data-surface="light"` is not decoration. The design system defines its
     * colour tokens under [data-surface='light'] and [data-surface='dark'],
     * so without it every var(--ao-*) reference resolves to nothing and the
     * page renders unstyled-but-laid-out — which looks like a broken build
     * rather than a missing attribute. The static site put it on <body>; here
     * it goes on the website wrapper so it cannot leak into the LMS.
     */
    <div className="ao" data-surface="light">
      <header className="ao-header" data-surface="light">
        <div className="ao-shell ao-header__inner">
          <Brand />

          <nav className="ao-nav" aria-label="Primary">
            <NavProducts items={NAV_PRODUCTS} />
            {NAV_TOP.map((item) => (
              <Link className="ao-nav__item" href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
            {/* The one link that crosses to the other hostname. Absolute, and
                not a next/link — prefetching a different origin does nothing
                useful and Next would warn about it. */}
            <a className="ao-nav__item" href={LMS_URL}>
              Learning
            </a>
          </nav>

          <Link className="ao-btn ao-btn--sm ao-btn--compact" href="/request-access">
            Request access
          </Link>
        </div>
      </header>

      <main id="main">{children}</main>

      <footer className="ao-foot" data-surface="light">
        <div className="ao-shell">
          <div className="ao-grid" style={{ padding: '3rem 0' }}>
            <div className="ao-col-6 ao-stack">
              <p className="ao-eyebrow">AfriOrbit Space</p>
              <p className="ao-body-s ao-dim" style={{ maxWidth: '38ch' }}>
                Space capability built on hardware you can put on a bench. Nairobi, Kenya.
              </p>
            </div>
            <div className="ao-col-5">
              <p className="ao-eyebrow">Products</p>
              <ul className="ao-list" style={{ marginTop: '.75rem' }}>
                {NAV_PRODUCTS.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="ao-col-5">
              <p className="ao-eyebrow">More</p>
              <ul className="ao-list" style={{ marginTop: '.75rem' }}>
                {NAV_TOP.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </li>
                ))}
                <li>
                  <a href={LMS_URL}>Learning platform</a>
                </li>
                <li>
                  <Link href="/request-access">Request access</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {/* The vertical simulators (rocketry flight profile, reaction-wheel
          attitude, launch azimuth, mission console). `afterInteractive` because
          nothing above the fold depends on it — the pages are static HTML and
          render fully without it; the script only fills in the simulator
          placeholders. */}
      <Script src="/site/afriorbit-sims.js" strategy="afterInteractive" />
    </div>
  );
}
