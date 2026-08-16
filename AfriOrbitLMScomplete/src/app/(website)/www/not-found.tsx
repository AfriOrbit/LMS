import Link from 'next/link';

import { NAV_PRODUCTS, NAV_TOP } from '@/content/site-pages';
import { LMS_URL } from '@/lib/site-config';

export const metadata = {
  title: { absolute: 'Page not found — AfriOrbit Space' },
};

/**
 * The marketing site's own 404.
 *
 * Without this boundary, a miss on the apex falls through to the app-wide
 * not-found page, which is branded "AfriOrbit Learning" and offers links into
 * the LMS. Someone who mistypes a URL on the company website should not be
 * told they are lost inside a product they may never have heard of.
 *
 * It also catches a real case rather than a hypothetical one: every LMS path
 * requested on the apex — /dashboard, /login, /catalog — lands here, because
 * the proxy rewrites the whole apex namespace into /www and only the nine
 * marketing routes exist there. So this page has to answer "you want the
 * learning platform, which is on the other hostname" clearly.
 */
export default function WebsiteNotFound() {
  return (
    <section className="ao-section" data-surface="light">
      <div className="ao-shell ao-stack" style={{ paddingTop: '5rem', paddingBottom: '5rem' }}>
        <p className="ao-eyebrow">404</p>
        <h1 className="ao-h1">That page is not here.</h1>
        <p className="ao-body ao-dim" style={{ maxWidth: '52ch' }}>
          If you were looking for a course, a simulator or your dashboard, those live on the learning
          platform rather than on this site.
        </p>

        <div className="ao-row" style={{ gap: '.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <a className="ao-btn" href={LMS_URL}>
            Go to the learning platform
          </a>
          <Link className="ao-btn ao-btn--ghost" href="/">
            Back to the home page
          </Link>
        </div>

        <div className="ao-grid" style={{ marginTop: '3rem' }}>
          <div className="ao-col-6">
            <p className="ao-eyebrow">Products</p>
            <ul className="ao-list" style={{ marginTop: '.75rem' }}>
              {NAV_PRODUCTS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="ao-col-6">
            <p className="ao-eyebrow">More</p>
            <ul className="ao-list" style={{ marginTop: '.75rem' }}>
              {NAV_TOP.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
              <li>
                <Link href="/request-access">Request access</Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
