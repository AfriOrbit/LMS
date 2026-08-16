import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Badge,
  ButtonLink,
  Card,
  PageHeader,
  ProgressBar,
} from '@/components/ui/primitives';
import { requireActiveMember } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatMinutes } from '@/lib/utils';
import type {
  Course,
  Enrollment,
  LabAssignment,
  Lesson,
  LessonProgress,
  Module,
  Quiz,
  QuizAttempt,
} from '@/types/db';

import { ClaimCertificate } from './claim-certificate';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  reading: 'Reading',
  video: 'Video',
  lab: 'Lab',
  quiz: 'Quiz',
  simulation: 'Sandbox',
  download: 'Download',
};

export default async function CourseHomePage({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;
  const ctx = await requireActiveMember();
  const supabase = await createSupabaseServerClient();

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', courseSlug)
    .maybeSingle<Course>();

  if (!course) notFound();

  const [
    { data: enrollment },
    { data: modules },
    { data: lessons },
    { data: progress },
    { data: quizzes },
    { data: assignments },
  ] = await Promise.all([
    supabase
      .from('enrollments')
      .select('*')
      .eq('user_id', ctx.userId)
      .eq('course_id', course.id)
      .maybeSingle<Enrollment>(),
    supabase
      .from('modules')
      .select('*')
      .eq('course_id', course.id)
      .order('sort_order')
      .returns<Module[]>(),
    supabase
      .from('lessons_readable')
      .select('*')
      .eq('course_id', course.id)
      .order('sort_order')
      .returns<Lesson[]>(),
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
    supabase
      .from('lab_assignments')
      .select('*')
      .eq('course_id', course.id)
      .returns<LabAssignment[]>(),
  ]);

  if (!enrollment) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <h1 className="text-lg font-semibold">You are not enrolled</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Enrol from the catalogue page to open this course.
        </p>
        <ButtonLink href={`/catalog/${course.slug}`} className="mt-5">
          Go to course page
        </ButtonLink>
      </Card>
    );
  }

  const completedIds = new Set(
    (progress ?? []).filter((p) => p.completed).map((p) => p.lesson_id),
  );
  const ordered = lessons ?? [];
  const nextLesson = ordered.find((l) => !completedIds.has(l.id)) ?? ordered[0];

  // Attempt state for the graded assessments.
  const gradedQuizzes = (quizzes ?? []).filter((q) => q.is_graded);
  const { data: attempts } = gradedQuizzes.length
    ? await supabase
        .from('quiz_attempts')
        .select('quiz_id, passed, score_pct, status')
        .eq('user_id', ctx.userId)
        .in(
          'quiz_id',
          gradedQuizzes.map((q) => q.id),
        )
        .returns<Pick<QuizAttempt, 'quiz_id' | 'passed' | 'score_pct' | 'status'>[]>()
    : { data: [] };

  const passedQuizIds = new Set(
    (attempts ?? []).filter((a) => a.passed).map((a) => a.quiz_id),
  );
  const allQuizzesPassed = gradedQuizzes.every((q) => passedQuizIds.has(q.id));
  const eligibleForCertificate =
    course.issues_certificate && enrollment.progress_pct >= 100 && allQuizzesPassed;

  return (
    <>
      <nav className="mb-6 text-sm text-[var(--text-muted)]">
        <Link href="/dashboard" className="hover:text-[var(--text)]">
          Dashboard
        </Link>
        <span className="mx-2">/</span>
        <span>{course.title}</span>
      </nav>

      <PageHeader
        eyebrow={course.subtitle || undefined}
        title={course.title}
        description={course.summary}
        actions={
          nextLesson ? (
            <ButtonLink href={`/learn/${course.slug}/${nextLesson.slug}`}>
              {completedIds.size === 0 ? 'Start course' : 'Continue'}
            </ButtonLink>
          ) : null
        }
      />

      <Card className="mb-8">
        <ProgressBar
          value={enrollment.progress_pct}
          label={`${completedIds.size} of ${ordered.length} lessons complete`}
        />
      </Card>

      {eligibleForCertificate ? (
        <div className="mb-8">
          <ClaimCertificate courseId={course.id} />
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {(modules ?? []).map((module, index) => {
            const moduleLessons = ordered.filter((l) => l.module_id === module.id);
            const done = moduleLessons.filter((l) => completedIds.has(l.id)).length;

            return (
              <Card key={module.id} className="p-0">
                <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
                  <div>
                    <p className="font-mono text-xs text-[var(--text-muted)]">
                      Module {index + 1}
                    </p>
                    <h2 className="mt-0.5 text-base font-semibold">{module.title}</h2>
                    {module.summary ? (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {module.summary}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={done === moduleLessons.length ? 'success' : 'neutral'}>
                    {done}/{moduleLessons.length}
                  </Badge>
                </div>

                <ul className="divide-y divide-[var(--border)]">
                  {moduleLessons.map((lesson) => {
                    const isDone = completedIds.has(lesson.id);
                    return (
                      <li key={lesson.id}>
                        <Link
                          href={`/learn/${course.slug}/${lesson.slug}`}
                          className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-void-800/60"
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                              isDone
                                ? 'border-signal-500 bg-signal-500/20 text-signal-400'
                                : 'border-[var(--border)] text-transparent'
                            }`}
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                          <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                          <span className="shrink-0 text-xs text-[var(--text-muted)]">
                            {KIND_LABEL[lesson.kind] ?? lesson.kind} ·{' '}
                            {lesson.estimated_minutes} min
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>

        <aside className="space-y-4">
          {gradedQuizzes.length > 0 ? (
            <Card>
              <h2 className="text-sm font-semibold">Assessments</h2>
              <ul className="mt-3 space-y-3">
                {gradedQuizzes.map((quiz) => {
                  const best = (attempts ?? [])
                    .filter((a) => a.quiz_id === quiz.id && a.score_pct !== null)
                    .reduce<number | null>(
                      (max, a) => Math.max(max ?? 0, Number(a.score_pct)),
                      null,
                    );
                  const used = (attempts ?? []).filter((a) => a.quiz_id === quiz.id).length;

                  return (
                    <li key={quiz.id} className="text-sm">
                      <Link
                        href={`/quiz/${quiz.id}`}
                        className="font-medium hover:text-ion-300"
                      >
                        {quiz.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        Pass {quiz.pass_threshold}% · {used}/{quiz.max_attempts} attempts
                        {best !== null ? ` · best ${best}%` : ''}
                      </p>
                      {passedQuizIds.has(quiz.id) ? (
                        <Badge tone="success" className="mt-1">
                          Passed
                        </Badge>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {(assignments ?? []).length > 0 ? (
            <Card>
              <h2 className="text-sm font-semibold">Lab reports</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {(assignments ?? []).map((assignment) => (
                  <li key={assignment.id}>
                    <Link
                      href={`/labs/${assignment.slug}`}
                      className="hover:text-ion-300"
                    >
                      {assignment.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-sm font-semibold">Course details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Effort</dt>
                <dd>{formatMinutes(course.estimated_minutes)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Pass mark</dt>
                <dd>{course.pass_threshold}%</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Certificate</dt>
                <dd>{course.issues_certificate ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}
