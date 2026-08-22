import Link from 'next/link';
import { notFound } from 'next/navigation';

import { courseLessons, getLesson, type LessonKind } from '@/content/curriculum';
import { Markdown } from '@/components/markdown';
import { LessonSidebar } from '@/components/learn/lesson-sidebar';
import { LessonFooter } from '@/components/learn/lesson-footer';
import { SandboxMount } from '@/components/sandbox/sandbox-mount';
import { Badge, Card } from '@/components/ui/primitives';
import { requireActiveMember } from '@/lib/auth';
import { loadCourseState } from '@/lib/learning/course-state';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<LessonKind, string> = {
  reading: 'Reading',
  video: 'Video',
  lab: 'Lab',
  quiz: 'Quiz',
  simulation: 'Sandbox',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}) {
  const { courseSlug, lessonSlug } = await params;
  const found = getLesson(courseSlug, lessonSlug);

  return found
    ? { title: `${found.lesson.title} — ${found.course.title}` }
    : { title: 'Lesson not found' };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}) {
  const { courseSlug, lessonSlug } = await params;
  const ctx = await requireActiveMember();

  // The lesson itself comes from the repository, never the database.
  const found = getLesson(courseSlug, lessonSlug);
  if (!found) notFound();

  const { course, lesson } = found;
  const ordered = courseLessons(course);
  const index = ordered.findIndex((entry) => entry.lesson.slug === lesson.slug);
  const previous = index > 0 ? ordered[index - 1].lesson : null;
  const next = index < ordered.length - 1 ? ordered[index + 1].lesson : null;

  // Progress is optional. Anything missing here costs a tick mark, not content.
  const state = await loadCourseState(course.slug, ctx.userId);
  const completedSlugs = state.completedSlugs;
  const lessonId = state.lessonIdBySlug[lesson.slug] ?? null;
  const lessonQuiz = lessonId
    ? (state.quizzes.find((quiz) => quiz.lessonId === lessonId) ?? null)
    : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
      <LessonSidebar
        courseSlug={course.slug}
        courseTitle={course.title}
        modules={course.modules.map((module) => ({
          slug: module.slug,
          title: module.title,
          lessons: module.lessons.map((entry) => ({
            slug: entry.slug,
            title: entry.title,
          })),
        }))}
        completedSlugs={completedSlugs}
        currentLessonSlug={lesson.slug}
      />

      <article className="min-w-0">
        <nav className="mb-5 text-sm text-[var(--text-muted)]">
          <Link href={`/learn/${course.slug}`} className="hover:text-[var(--text)]">
            {course.title}
          </Link>
          <span className="mx-2">/</span>
          <span>
            Lesson {index + 1} of {ordered.length}
          </span>
        </nav>

        <header className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="info">{KIND_LABEL[lesson.kind]}</Badge>
            <Badge tone="neutral">{lesson.minutes} min</Badge>
            {lesson.isPreview ? <Badge tone="neutral">Preview</Badge> : null}
            {completedSlugs.includes(lesson.slug) ? (
              <Badge tone="success">Complete</Badge>
            ) : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {lesson.title}
          </h1>
        </header>

        {lesson.body ? <Markdown>{lesson.body}</Markdown> : null}

        {lesson.simulationKey ? (
          <div className="mt-10">
            <SandboxMount simulationKey={lesson.simulationKey} />
          </div>
        ) : null}

        {lessonQuiz ? (
          <Card className="mt-10 border-[var(--accent-line)] bg-[var(--accent-bg)]">
            <h2 className="text-base font-semibold">{lessonQuiz.title}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Pass mark {lessonQuiz.passThreshold}% · up to {lessonQuiz.maxAttempts}{' '}
              attempts
              {lessonQuiz.timeLimitMinutes
                ? ` · ${lessonQuiz.timeLimitMinutes} minutes`
                : ''}
            </p>
            <Link
              href={`/quiz/${lessonQuiz.id}`}
              className="mt-4 inline-flex h-10 items-center bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
            >
              Open assessment
            </Link>
          </Card>
        ) : null}

        <LessonFooter
          lessonId={lessonId}
          completed={completedSlugs.includes(lesson.slug)}
          courseSlug={course.slug}
          previousSlug={previous?.slug ?? null}
          previousTitle={previous?.title ?? null}
          nextSlug={next?.slug ?? null}
          nextTitle={next?.title ?? null}
        />
      </article>
    </div>
  );
}
