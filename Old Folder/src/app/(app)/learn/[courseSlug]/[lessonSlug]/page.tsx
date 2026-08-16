import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Markdown } from '@/components/markdown';
import { LessonSidebar } from '@/components/learn/lesson-sidebar';
import { LessonFooter } from '@/components/learn/lesson-footer';
import { SandboxMount } from '@/components/sandbox/sandbox-mount';
import { Alert, Badge, Card } from '@/components/ui/primitives';
import { requireActiveMember } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Course, Lesson, LessonProgress, Module, Quiz } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}) {
  const { courseSlug, lessonSlug } = await params;
  const ctx = await requireActiveMember();
  const supabase = await createSupabaseServerClient();

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', courseSlug)
    .maybeSingle<Course>();

  if (!course) notFound();

  const [{ data: lessons }, { data: modules }, { data: progress }, { data: quizzes }] =
    await Promise.all([
      supabase
        .from('lessons_readable')
        .select('*')
        .eq('course_id', course.id)
        .order('sort_order')
        .returns<Lesson[]>(),
      supabase
        .from('modules')
        .select('*')
        .eq('course_id', course.id)
        .order('sort_order')
        .returns<Module[]>(),
      supabase
        .from('lesson_progress')
        .select('*')
        .eq('user_id', ctx.userId)
        .eq('course_id', course.id)
        .returns<LessonProgress[]>(),
      supabase
        .from('quizzes')
        .select('*')
        .eq('course_id', course.id)
        .returns<Quiz[]>(),
    ]);

  const ordered = lessons ?? [];
  const index = ordered.findIndex((l) => l.slug === lessonSlug);
  if (index === -1) notFound();

  const lesson = ordered[index];
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index < ordered.length - 1 ? ordered[index + 1] : null;

  const completedIds = new Set(
    (progress ?? []).filter((p) => p.completed).map((p) => p.lesson_id),
  );
  const lessonQuiz = (quizzes ?? []).find((q) => q.lesson_id === lesson.id);

  return (
    <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
      <LessonSidebar
        courseSlug={course.slug}
        courseTitle={course.title}
        modules={modules ?? []}
        lessons={ordered}
        completedIds={[...completedIds]}
        currentLessonId={lesson.id}
      />

      <article className="min-w-0">
        <nav className="mb-5 text-sm text-[var(--text-muted)]">
          <Link href={`/learn/${course.slug}`} className="hover:text-[var(--text)]">
            {course.title}
          </Link>
          <span className="mx-2">/</span>
          <span>Lesson {index + 1}</span>
        </nav>

        <header className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="info">{lesson.kind}</Badge>
            <Badge tone="neutral">{lesson.estimated_minutes} min</Badge>
            {completedIds.has(lesson.id) ? <Badge tone="success">Complete</Badge> : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {lesson.title}
          </h1>
        </header>

        {lesson.entitled === false ? (
          <Alert tone="warning" title="Not available">
            This lesson is part of the paid course content. Enrol to unlock it.
          </Alert>
        ) : (
          <>
            {lesson.video_url ? (
              <div className="mb-8 overflow-hidden rounded-xl border border-[var(--border)]">
                <video src={lesson.video_url} controls className="w-full">
                  <track kind="captions" />
                </video>
              </div>
            ) : null}

            {lesson.content_md ? <Markdown>{lesson.content_md}</Markdown> : null}

            {lesson.simulation_key ? (
              <div className="mt-10">
                <SandboxMount simulationKey={lesson.simulation_key} />
              </div>
            ) : null}

            {lesson.attachment_urls.length > 0 ? (
              <Card className="mt-10">
                <h2 className="text-sm font-semibold">Attachments</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {lesson.attachment_urls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        className="text-ion-300 hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {url.split('/').pop()}
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {lessonQuiz ? (
              <Card className="mt-10 border-ion-500/35 bg-ion-500/5">
                <h2 className="text-base font-semibold">{lessonQuiz.title}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Pass mark {lessonQuiz.pass_threshold}% · up to {lessonQuiz.max_attempts}{' '}
                  attempts
                  {lessonQuiz.time_limit_minutes
                    ? ` · ${lessonQuiz.time_limit_minutes} minutes`
                    : ''}
                </p>
                <Link
                  href={`/quiz/${lessonQuiz.id}`}
                  className="mt-4 inline-flex h-10 items-center rounded-lg bg-ion-600 px-4 text-sm font-medium text-white hover:bg-ion-500"
                >
                  Open assessment
                </Link>
              </Card>
            ) : null}

            <LessonFooter
              lessonId={lesson.id}
              completed={completedIds.has(lesson.id)}
              courseSlug={course.slug}
              previousSlug={previous?.slug ?? null}
              previousTitle={previous?.title ?? null}
              nextSlug={next?.slug ?? null}
              nextTitle={next?.title ?? null}
            />
          </>
        )}
      </article>
    </div>
  );
}
