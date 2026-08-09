import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Markdown } from '@/components/markdown';
import { Badge, Card, PageHeader } from '@/components/ui/primitives';
import { getSessionContext } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate, formatMinutes, formatPrice, LEVEL_LABEL } from '@/lib/utils';
import type { Cohort, Course, Enrollment, Lesson, Module } from '@/types/db';

import { EnrollPanel } from './enroll-panel';

export const revalidate = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('courses')
    .select('title, summary')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle<{ title: string; summary: string }>();

  return data
    ? { title: data.title, description: data.summary }
    : { title: 'Course not found' };
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const ctx = await getSessionContext();

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .maybeSingle<Course>();

  if (!course || course.status !== 'published') notFound();

  const [{ data: modules }, { data: lessons }, { data: cohorts }] = await Promise.all([
    supabase
      .from('modules')
      .select('*')
      .eq('course_id', course.id)
      .order('sort_order')
      .returns<Module[]>(),
    supabase
      .from('lessons_readable')
      .select('id, module_id, slug, title, kind, estimated_minutes, sort_order, is_preview')
      .eq('course_id', course.id)
      .order('sort_order')
      .returns<Lesson[]>(),
    supabase
      .from('cohorts')
      .select('*')
      .eq('course_id', course.id)
      .eq('is_published', true)
      .gte('ends_on', new Date().toISOString().slice(0, 10))
      .order('starts_on')
      .returns<Cohort[]>(),
  ]);

  let enrollment: Enrollment | null = null;
  if (ctx) {
    const { data } = await supabase
      .from('enrollments')
      .select('*')
      .eq('user_id', ctx.userId)
      .eq('course_id', course.id)
      .maybeSingle<Enrollment>();
    enrollment = data;
  }

  const totalLessons = (lessons ?? []).length;

  return (
    <>
      <nav className="mb-6 text-sm text-[var(--text-muted)]">
        <Link href="/catalog" className="hover:text-[var(--text)]">
          Catalogue
        </Link>
        <span className="mx-2">/</span>
        <span>{course.title}</span>
      </nav>

      <PageHeader
        eyebrow={course.subtitle || undefined}
        title={course.title}
        description={course.summary}
      />

      <div className="mb-8 flex flex-wrap gap-2">
        <Badge tone={course.level === 'advanced' ? 'warning' : 'info'}>
          {LEVEL_LABEL[course.level]}
        </Badge>
        <Badge tone="neutral">{formatMinutes(course.estimated_minutes)}</Badge>
        <Badge tone="neutral">{totalLessons} lessons</Badge>
        {course.requires_hardware ? <Badge tone="warning">Hardware required</Badge> : null}
        {course.issues_certificate ? <Badge tone="success">Certificate</Badge> : null}
        {course.tags.map((tag) => (
          <Badge key={tag} tone="neutral">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-10">
          {course.description ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold tracking-tight">About this course</h2>
              <Markdown variant="compact">{course.description}</Markdown>
            </section>
          ) : null}

          {course.outcomes.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold tracking-tight">
                What you will be able to do
              </h2>
              <ul className="space-y-2">
                {course.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-2.5 text-sm">
                    <span className="mt-0.5 text-signal-400">✓</span>
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {course.prerequisites.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold tracking-tight">Prerequisites</h2>
              <ul className="space-y-2">
                {course.prerequisites.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-[var(--text-muted)]">
                    <span className="mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="mb-4 text-lg font-semibold tracking-tight">Syllabus</h2>
            <div className="space-y-4">
              {(modules ?? []).map((module, index) => {
                const moduleLessons = (lessons ?? []).filter(
                  (l) => l.module_id === module.id,
                );
                return (
                  <Card key={module.id} className="p-0">
                    <div className="border-b border-[var(--border)] px-5 py-4">
                      <p className="font-mono text-xs text-[var(--text-muted)]">
                        Module {index + 1}
                      </p>
                      <h3 className="mt-0.5 text-base font-semibold">{module.title}</h3>
                      {module.summary ? (
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {module.summary}
                        </p>
                      ) : null}
                    </div>
                    <ul className="divide-y divide-[var(--border)]">
                      {moduleLessons.map((lesson) => (
                        <li
                          key={lesson.id}
                          className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span
                              className="shrink-0 font-mono text-xs uppercase text-[var(--text-muted)]"
                              aria-label={lesson.kind}
                            >
                              {lesson.kind.slice(0, 3)}
                            </span>
                            <span className="truncate">{lesson.title}</span>
                            {lesson.is_preview ? (
                              <Badge tone="success" className="shrink-0">
                                Preview
                              </Badge>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-xs text-[var(--text-muted)]">
                            {lesson.estimated_minutes} min
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          </section>

          {(cohorts ?? []).length > 0 ? (
            <section>
              <h2 className="mb-4 text-lg font-semibold tracking-tight">Upcoming cohorts</h2>
              <div className="space-y-3">
                {(cohorts ?? []).map((cohort) => (
                  <Card key={cohort.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">{cohort.name}</h3>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {formatDate(cohort.starts_on)} – {formatDate(cohort.ends_on)} ·{' '}
                          {cohort.delivery_mode.replace('_', ' ')} ·{' '}
                          {cohort.location ?? 'Online'}
                        </p>
                      </div>
                      <Badge
                        tone={cohort.seats_taken >= cohort.capacity ? 'danger' : 'success'}
                      >
                        {Math.max(0, cohort.capacity - cohort.seats_taken)} seats left
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <p className="text-2xl font-semibold">
              {formatPrice(course.price_cents, course.currency)}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {course.price_cents === 0
                ? 'Open to all approved accounts'
                : 'One-time payment, lifetime access'}
            </p>

            <EnrollPanel
              courseId={course.id}
              courseSlug={course.slug}
              priceCents={course.price_cents}
              signedIn={Boolean(ctx)}
              accountActive={ctx?.profile.status === 'active'}
              enrolled={Boolean(enrollment)}
            />

            {course.requires_hardware && course.hardware_notes ? (
              <div className="mt-5 rounded-lg border border-ember-500/30 bg-ember-500/5 p-3 text-xs text-[var(--text-muted)]">
                <p className="mb-1 font-semibold text-ember-400">Hardware</p>
                {course.hardware_notes}
              </div>
            ) : null}

            <dl className="mt-5 space-y-2.5 border-t border-[var(--border)] pt-5 text-sm">
              {[
                ['Level', LEVEL_LABEL[course.level]],
                ['Duration', formatMinutes(course.estimated_minutes)],
                ['Lessons', String(totalLessons)],
                ['Pass mark', `${course.pass_threshold}%`],
                [
                  'Certificate',
                  course.issues_certificate ? 'Yes, verifiable' : 'No',
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}
