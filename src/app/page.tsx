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
        <section className="starfield relative overflow-hidden border-b border-[var(--border)]">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
            <Badge tone="info" className="mb-5">
              EduSat programme · satellite-to-IoT
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Train engineers to build, fly and operate{' '}
              <span className="bg-gradient-to-r from-ion-300 to-ember-400 bg-clip-text text-transparent">
                real small satellites
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)]">
              AfriOrbit&rsquo;s learning platform for the EduSat CubeSat and IoT edge
              device. Structured tracks, hands-on labs on flight-representative hardware,
              and assessment rigorous enough that the certificate means something.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/catalog" size="lg">
                Browse the curriculum
              </ButtonLink>
              <ButtonLink href="/register" size="lg" variant="secondary">
                Create an account
              </ButtonLink>
            </div>

            <dl className="mt-16 grid grid-cols-2 gap-6 border-t border-[var(--border)] pt-8 sm:grid-cols-4">
              {[
                ['3', 'courses in the EduSat track'],
                ['30+', 'hours of assessed material'],
                ['1U', 'flight-representative platform'],
                ['2FA', 'on every account'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="text-2xl font-semibold text-ion-300">{value}</dt>
                  <dd className="mt-1 text-sm text-[var(--text-muted)]">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="grid gap-6 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <Card key={pillar.title}>
                <h2 className="text-base font-semibold">{pillar.title}</h2>
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
              <h2 className="text-2xl font-semibold tracking-tight">The EduSat track</h2>
              <p className="mt-1.5 text-sm text-[var(--text-muted)]">
                Take them in order, or jump to the one that matches your gap.
              </p>
            </div>
            <Link href="/catalog" className="shrink-0 text-sm text-ion-300 hover:underline">
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
                  <Link href={`/catalog/${course.slug}`} className="hover:text-ion-300">
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
