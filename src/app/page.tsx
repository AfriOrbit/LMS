import Link from 'next/link';

import { Markdown } from '@/components/markdown';
import { SiteFooter, SiteNav } from '@/components/site-nav';
import { Badge, ButtonLink, Card } from '@/components/ui/primitives';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatMinutes, LEVEL_LABEL } from '@/lib/utils';
import type { Course } from '@/types/db';

export const revalidate = 300;

const PILLARS = [
  {
    title: 'Systems engineering, not slideware',
    body: 'Power budgets, link budgets, and verification campaigns worked through with real numbers. Every module ends with arithmetic you can defend at a design review.',
  },
  {
    title: 'Hardware in the loop',
    body: 'Courses are built around the EduSat 1U platform and the IoT edge device. Kits are tracked, issued to a cohort, and returned — with a digital twin when hardware is in transit.',
  },
  {
    title: 'Assessed and certified',
    body: 'Server-graded assessments, instructor-graded lab reports against a published rubric, and certificates anyone can verify from a code.',
  },
];

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .eq('status', 'published')
    .order('sort_order')
    .limit(3)
    .returns<Course[]>();

  return (
    <>
      <SiteNav />

      <main id="main">
        <section className="relative border-b border-[var(--border)]">
          <div className="mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
            {/*
              A plain monospace eyebrow, not a tinted pill. The pill read as a
              "new!" badge; this reads as an instrument label, which is what it
              is — and it matches the eyebrow on every page of the company site.
            */}
            <p className="t-label">EduSat programme · satellite-to-IoT</p>

            {/*
              No gradient. "real small satellites" was set in a blue-to-amber
              clip-path gradient, which is the one decorative flourish this
              design language does not have — and it made three words of a
              headline the lowest-contrast text on the page.
            */}
            <h1 className="t-display mt-7 max-w-[16ch]">
              Train engineers to build, fly and operate real small satellites.
            </h1>
            <p className="t-lead mt-7 max-w-[58ch]">
              AfriOrbit&rsquo;s learning platform for the EduSat CubeSat and IoT edge device.
              Structured tracks, hands-on labs on flight-representative hardware, and assessment
              rigorous enough that the certificate means something.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/catalog" size="lg">
                Browse the curriculum
              </ButtonLink>
              <ButtonLink href="/register" size="lg" variant="secondary">
                Create an account
              </ButtonLink>
            </div>

            {/*
              Divided by vertical hairlines rather than gaps, so the row reads
              as one instrument panel instead of four floating numbers. Label
              above value: the label is what makes the number mean anything.
            */}
            <dl className="mt-16 grid grid-cols-2 border-t border-[var(--border)] lg:grid-cols-4">
              {[
                ['3', 'Courses', 'in the EduSat track'],
                ['30+', 'Hours', 'of assessed material'],
                ['1U', 'Platform', 'flight-representative'],
                ['2FA', 'Security', 'on every account'],
              ].map(([value, label, hint], i) => (
                <div
                  key={label}
                  className={[
                    'border-b border-[var(--border)] py-7 sm:px-6 sm:first:pl-0',
                    i % 2 === 1 ? 'border-l pl-5 sm:pl-6' : '',
                    'lg:border-l lg:pl-6 lg:first:border-l-0 lg:first:pl-0',
                  ].join(' ')}
                >
                  <dt className="t-label">{label}</dt>
                  <dd className="t-stat mt-3">{value}</dd>
                  <dd className="mt-2 text-[0.8125rem] text-[var(--text-faint)]">{hint}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="grid gap-6 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <Card key={pillar.title}>
                <h2 className="t-h3">{pillar.title}</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
                  {pillar.body}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="t-h2">The EduSat track</h2>
              <p className="mt-1.5 text-sm text-[var(--text-muted)]">
                Take them in order, or jump to the one that matches your gap.
              </p>
            </div>
            <Link
              href="/catalog"
              className="shrink-0 border-b border-[var(--border-strong)] pb-0.5 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--text)]"
            >
              All courses →
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {(courses ?? []).map((course, index) => (
              <Card key={course.id} className="flex flex-col">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <Badge tone={course.level === 'advanced' ? 'warning' : 'info'}>
                    {LEVEL_LABEL[course.level]}
                  </Badge>
                  {course.requires_hardware ? <Badge tone="neutral">Hardware</Badge> : null}
                </div>
                <h3 className="text-base font-semibold leading-snug">
                  <Link href={`/catalog/${course.slug}`} className="hover:text-[var(--accent)]">
                    {course.title}
                  </Link>
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
                  {course.summary}
                </p>
                <p className="mt-4 text-xs text-[var(--text-muted)]">
                  {formatMinutes(course.estimated_minutes)} ·{' '}
                  {course.issues_certificate ? 'Certificate' : 'No certificate'}
                </p>
              </Card>
            ))}
            {(courses ?? []).length === 0 ? (
              <Card className="md:col-span-3">
                <Markdown variant="compact">
                  {
                    'No published courses yet. Sign in as an administrator and publish a course, or run the seed migration:\n\n```\nnpx supabase db reset\n```'
                  }
                </Markdown>
              </Card>
            ) : null}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
