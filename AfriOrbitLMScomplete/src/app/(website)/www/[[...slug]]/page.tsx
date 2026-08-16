import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SITE_PAGES, getSitePage } from '@/content/site-pages';
import { SITE_URL } from '@/lib/site-config';

type Params = { slug?: string[] };

/**
 * Prerender every marketing page at build time.
 *
 * These pages have no per-request state — no session, no database, no
 * personalisation — so they should be static files on the CDN, not functions.
 * That is also what keeps the apex fast from Nairobi: a cache hit at the edge
 * rather than a round trip to a function region.
 */
export function generateStaticParams(): Params[] {
  return SITE_PAGES.map((p) => ({
    slug: p.path === '/' ? [] : p.path.replace(/^\//, '').split('/'),
  }));
}

/**
 * `true`, not `false`, and the reason is the 404 page.
 *
 * With `dynamicParams = false` an unlisted path never enters this route at
 * all: Next rejects it before the segment matches, so the `(website)` layout
 * never mounts and the miss falls through to the app-wide not-found — which is
 * branded "AfriOrbit Learning". Since the proxy rewrites the ENTIRE apex
 * namespace into `/www`, that is not an edge case; every mistyped URL and
 * every LMS path requested on the apex hits it.
 *
 * Letting the param through means the layout mounts, `notFound()` fires inside
 * it, and the marketing 404 renders with the site's own header, footer and a
 * pointer to the learning platform. The nine real pages are still prerendered
 * by `generateStaticParams`; only misses are dynamic, and they are cheap.
 */
export const dynamicParams = true;

function pathFrom(slug: string[] | undefined): string {
  return !slug || slug.length === 0 ? '/' : `/${slug.join('/')}`;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const path = pathFrom(slug);
  const page = getSitePage(path);
  if (!page) return { title: 'Not found — AfriOrbit Space' };

  const canonical = `${SITE_URL}${page.path === '/' ? '' : page.path}`;
  return {
    // `absolute` because the root layout appends "· AfriOrbit Learning" to
    // every title in the app. That is right for the LMS and wrong for the
    // marketing site, which is a different property with a different name —
    // "Rocketry — AfriOrbit Space · AfriOrbit Learning" reads like a mistake,
    // and it is the string that shows up in search results.
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonical,
      siteName: 'AfriOrbit Space',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description },
  };
}

export default async function WebsitePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const page = getSitePage(pathFrom(slug));
  if (!page) notFound();

  return (
    <div
      /**
       * Raw HTML, deliberately.
       *
       * These fragments are build-time artefacts of the site generator in the
       * `afriorbit-web` repo, vendored by `scripts/import-site.mjs`, which
       * rejects any fragment containing a script tag, an iframe, an inline
       * event handler or a `javascript:` URL before it will write the content
       * module. Nothing user-supplied and nothing fetched at runtime reaches
       * this element.
       *
       * If the marketing site ever moves to a CMS, that invariant breaks and
       * this must become sanitised rendering or real components. The check in
       * the import script is what currently makes it safe; it is not a
       * formality.
       */
      dangerouslySetInnerHTML={{ __html: page.html }}
    />
  );
}

