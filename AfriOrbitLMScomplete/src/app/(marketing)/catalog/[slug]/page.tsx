import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  COURSES,
  getCourse,
  getTrack,
  lessonCount,
  simulatorCount,
  type LessonKind,
} from '@/content/curriculum';
import { Badge, ButtonLink, Card, PageHeader } from '@/components/ui/primitives';
import { formatMinutes, LEVEL_LABEL } from '@/lib/utils';

/**
 * Public course page.
 *
 * Everything here comes from the content module, so this route prerenders from
 * `generateStaticParams` and serves with no database connection whatsoever.
 * Enrolment and progress live behind /learn, where a session exists.
 */

export function generateStaticParams(): { slug: string }[] {
  return COURSES.map((course) => ({ slug: course.slug }));
}

const KIND_LABEL: Record<LessonKind, string> = {
  reading: 'Reading',
  video: 'Video',
  lab: 'Lab',
  quiz: 'Quiz',
  simulation: 'Sandbox',
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = getCourse(slug);

  return course
    ? { title: course.title, description: course.summary }
    : { title: 'Course not found' };
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();

  const track = getTrack(course.trackSlug);
  const lessons = lessonCount(course);
  const sims = simulatorCount(course);

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
        eyebrow={course.subtitle}
        title={course.title}
        description={course.summary}
      />

      <div className="mb-8 flex flex-wrap gap-2">
        <Badge tone={course.level === 'advanced' ? 'warning' : 'info'}>
          {LEVEL_LABEL[course.level]}
        </Badge>
        <Badge tone="neutral">{formatMinutes(course.minutes)}</Badge>
        <Badge tone="neutral">
          {lessons} lesson{lessons === 1 ? '' : 's'}
        </Badge>
        {sims > 0 ? (
          <Badge tone="success">
            {sims} simulator{sims === 1 ? '' : 's'}
          </Badge>
        ) : null}
        {course.requiresHardware ? <Badge tone="warning">Hardware required</Badge> : null}
        {course.tags.map((tag) => (
          <Badge key={tag} tone="neutral">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-10">
          {course.outcomes.length > 0 ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold tracking-tight">
                What you will be able to do
              </h2>
              <ul className="space-y-2">
                {course.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-2.5 text-sm">
                    <span className="mt-0.5 text-signal-400" aria-hidden="true">
                      ✓
                    </span>
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
                    <span className="mt-0.5" aria-hidden="true">
                      •
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="mb-4 text-lg font-semibold tracking-tight">Syllabus</h2>
            <div className="space-y-4">
              {course.modules.map((module, index) => (
                <Card key={module.slug} className="p-0">
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
                    {module.lessons.map((lesson) => (
                      <li key={lesson.slug}>
                        <Link
                          href={`/learn/${course.slug}/${lesson.slug}`}
                          className="flex items-center justify-between gap-4 px-5 py-3 text-sm transition-colors hover:bg-void-800/60"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="shrink-0 font-mono text-xs uppercase text-[var(--text-muted)]">
                              {KIND_LABEL[lesson.kind]}
                            </span>
                            <span className="truncate">{lesson.title}</span>
                            {lesson.isPreview ? (
                              <Badge tone="success" className="shrink-0">
                                Preview
                              </Badge>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-xs text-[var(--text-muted)]">
                            {lesson.minutes} min
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>

          {course.quiz ? (
            <section>
              <h2 className="mb-3 text-lg font-semibold tracking-tight">Assessment</h2>
              <Card>
                <h3 className="text-base font-semibold">{course.quiz.title}</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {course.quiz.instructions}
                </p>
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  {course.quiz.questions.length} question
                  {course.quiz.questions.length === 1 ? '' : 's'}, graded once you are
                  signed in.
                </p>
              </Card>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Source material</h2>
            <p className="text-sm leading-relaxed text-[var(--text-muted)]">
              {course.source}
            </p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <p className="text-sm text-[var(--text-muted)]">
              {track ? track.title : 'AfriOrbit Space'}
            </p>
            <p className="mt-1 text-2xl font-semibold">{formatMinutes(course.minutes)}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              of guided material, simulators included
            </p>

            <ButtonLink href={`/learn/${course.slug}`} size="lg" className="mt-5 w-full">
              Start the course
            </ButtonLink>
            <ButtonLink
              href="/register"
              variant="secondary"
              size="lg"
              className="mt-2 w-full"
            >
              Create an account
            </ButtonLink>

            {course.requiresHardware && course.hardwareNotes ? (
              <div className="mt-5 rounded-lg border border-ember-500/30 bg-ember-500/5 p-3 text-xs text-[var(--text-muted)]">
                <p className="mb-1 font-semibold text-ember-400">Hardware</p>
                {course.hardwareNotes}
              </div>
            ) : null}

            <dl className="mt-5 space-y-2.5 border-t border-[var(--border)] pt-5 text-sm">
              {[
                ['Level', LEVEL_LABEL[course.level]],
                ['Modules', String(course.modules.length)],
                ['Lessons', String(lessons)],
                ['Simulators', String(sims)],
                ['Hardware', course.requiresHardware ? 'Required' : 'Not required'],
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
