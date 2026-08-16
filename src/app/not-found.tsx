import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter, SiteNav } from '@/components/site-nav';
import { ButtonLink } from '@/components/ui/primitives';
import { WEBSITE_LABEL, WEBSITE_URL } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

/**
 * The 404.
 *
 * There was one of these before, but it lived inside the `(website)` route
 * group that carried the vendored marketing site. Deleting that group took the
 * only custom not-found page with it and left Next's unstyled default — which
 * is a white page reading "404 | This page could not be found" with no
 * navigation on it at all, and no way back into the application.
 *
 * It renders the site chrome deliberately. Most 404s here are a mistyped or
 * stale course URL, and the person hitting one wants the catalogue, not an
 * apology.
 */
export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col justify-center px-4 py-20 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
          404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          That page is not here.
        </h1>
        <p className="mt-4 max-w-[52ch] text-[var(--text-muted)]">
          The link may be out of date, or the course may have been unpublished. The catalogue
          lists everything currently open for enrolment.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/catalog">Browse the catalogue</ButtonLink>
          <ButtonLink href="/dashboard" variant="secondary">
            Go to your dashboard
          </ButtonLink>
          <a
            href={WEBSITE_URL}
            className="inline-flex items-center gap-1.5 border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text)]"
          >
            {WEBSITE_LABEL}
            <span aria-hidden className="text-[0.8em]">
              ↗
            </span>
          </a>
        </div>
        <p className="mt-10 text-sm text-[var(--text-muted)]">
          Verifying a certificate?{' '}
          <Link href="/verify" className="text-[var(--accent)] hover:underline">
            Enter the code here
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
