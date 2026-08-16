import { createSupabaseServerClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';
import { formatMinutes, formatPrice, LEVEL_LABEL } from '@/lib/utils';
import type { Course } from '@/types/db';

import './embed.css';

export const revalidate = 300;
export const metadata = { robots: { index: false, follow: false } };

/**
 * Embeddable catalogue.
 *
 * Rendered inside an iframe on afriorbit.space. Deliberately self-contained:
 * no session, no cookies, no auth surface. The proxy sets a
 * `frame-ancestors` CSP allowing only the configured marketing origins, and
 * every link opens in the top-level window so learners land on the real app
 * rather than navigating inside the frame.
 */
export default async function EmbedCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; limit?: string; theme?: string }>;
}) {
  const { level, limit, theme } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase.from('courses').select('*').eq('status', 'published');
  if (level && ['foundation', 'intermediate', 'advanced'].includes(level)) {
    query = query.eq('level', level);
  }

  const max = Math.min(24, Math.max(1, Number.parseInt(limit ?? '6', 10) || 6));
  const { data: courses } = await query
    .order('sort_order')
    .limit(max)
    .returns<Course[]>();

  return (
    <div className="embed-root" data-theme={theme === 'light' ? 'light' : 'dark'}>
      <div className="embed-grid">
        {(courses ?? []).map((course) => (
          <a
            key={course.id}
            className="embed-card"
            href={`${publicEnv.siteUrl}/catalog/${course.slug}`}
            target="_top"
            rel="noopener"
          >
            <div className="embed-tags">
              <span className="embed-tag embed-tag--level">
                {LEVEL_LABEL[course.level]}
              </span>
              {course.requires_hardware ? (
                <span className="embed-tag">Hardware</span>
              ) : null}
              {course.issues_certificate ? (
                <span className="embed-tag embed-tag--cert">Certificate</span>
              ) : null}
            </div>
            <h3 className="embed-title">{course.title}</h3>
            <p className="embed-summary">{course.summary}</p>
            <div className="embed-meta">
              <span>{formatMinutes(course.estimated_minutes)}</span>
              <span className="embed-price">
                {formatPrice(course.price_cents, course.currency)}
              </span>
            </div>
          </a>
        ))}
      </div>

      <a
        className="embed-cta"
        href={`${publicEnv.siteUrl}/catalog`}
        target="_top"
        rel="noopener"
      >
        View the full curriculum →
      </a>

      {/*
        Reports height to the parent so the host page can size the iframe.
        Origin is checked on the receiving side by embed.js.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function () {
  function report() {
    var h = document.documentElement.scrollHeight;
    parent.postMessage({ type: 'afriorbit-embed-height', height: h }, '*');
  }
  window.addEventListener('load', report);
  if (window.ResizeObserver) new ResizeObserver(report).observe(document.body);
  setTimeout(report, 300);
})();`,
        }}
      />
    </div>
  );
}
