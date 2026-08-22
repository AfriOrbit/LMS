import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  courseLessons,
  getCourse,
  lessonCount,
  type LessonKind,
} from '@/content/curriculum';
import {
  Badge,
  ButtonLink,
  Card,
  PageHeader,
  ProgressBar,
} from '@/components/ui/primitives';
import { EnrollPanel } from '@/components/learn/enroll-panel';
import { requireActiveMember } from '@/lib/auth';
import { allGradedQuizzesPassed, loadCourseState } from '@/lib/learning/course-state';
import { formatMinutes } from '@/lib/utils';

import { ClaimCertificate } from './claim-certificate';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<LessonKind, string> = {
  reading: 'Reading',
  video: 'Video',
  lab: 'Lab',
  quiz: 'Quiz',
  simulation: 'Sandbox',
};

export default async function CourseHomePage({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;
  const ctx = await requireActiveMember();

  // Structure comes from the content module and is always available.
  const course = getCourse(courseSlug);
  if (!course) notFound();

  // Per-learner state is an enhancement. A dead database yields the empty
  // state and the outline below still renders in full.
  const state = await loadCourseState(course.slug, ctx.userId);

  const completed = new Set(state.completedSlugs);
  const ordered = courseLessons(course);
  const total = lessonCount(course);
  const nextLesson =
    ordered.find(({ lesson }) => !completed.has(lesson.slug))?.lesson ??
    ordered[0]?.lesson;

  const gradedQuizzes = state.quizzes.filter((quiz) => quiz.isGraded);
  const contentQuiz = course.quiz;
  const contentQuizRow = contentQuiz
    ? (state.quizzes.find((quiz) => quiz.slug === contentQuiz.slug) ?? null)
    : null;

  const eligibleForCertificate =
    state.available &&
    state.enrolled &&
    state.issuesCertificate &&
    state.progressPct >= 100 &&
    allGradedQuizzesPassed(state) &&
    state.courseId !== null;

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
        eyebrow={course.subtitle}
        title={course.title}
        description={course.summary}
        actions={
          nextLesson ? (
            <ButtonLink href={`/learn/${course.slug}/${nextLesson.slug}`}>
              {completed.size === 0 ? 'Start course' : 'Continue'}
            </ButtonLink>
          ) : null
        }
      />

      <Card className="mb-8">
        <ProgressBar
          value={state.enrolled ? state.progressPct : (completed.size / total) * 100}
          label={`${completed.size} of ${total} lessons complete`}
        />
        {!state.enrolled ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            You are reading this course without an enrolment. Every lesson and simulator
            is open; enrol to have your progress saved and your certificate tracked.
          </p>
        ) : null}
      </Card>

      {!state.enrolled && state.available && state.courseId ? (
        <Card className="mb-8">
          <h2 className="text-base font-semibold">Track your progress</h2>
          <EnrollPanel
            courseId={state.courseId}
            courseSlug={course.slug}
            priceCents={state.priceCents}
            signedIn
            accountActive={ctx.profile.status === 'active'}
            enrolled={false}
          />
        </Card>
      ) : null}

      {eligibleForCertificate && state.courseId ? (
        <div className="mb-8">
          <ClaimCertificate courseId={state.courseId} />
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {course.modules.map((module, index) => {
            const done = module.lessons.filter((lesson) =>
              completed.has(lesson.slug),
            ).length;

            return (
              <Card key={module.slug} className="p-0">
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
                  <Badge tone={done === module.lessons.length ? 'success' : 'neutral'}>
                    {done}/{module.lessons.length}
                  </Badge>
                </div>

                <ul className="divide-y divide-[var(--border)]">
                  {module.lessons.map((lesson) => {
                    const isDone = completed.has(lesson.slug);
                    return (
                      <li key={lesson.slug}>
                        <Link
                          href={`/learn/${course.slug}/${lesson.slug}`}
                          className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-[var(--bg-hover)]"
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
 isDone
 ? 'border-[var(--good-line)] bg-[var(--good-bg)] text-[var(--good)]'
 : 'border-[var(--border)] text-transparent'
 }`}
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                          <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                          <span className="shrink-0 text-xs text-[var(--text-muted)]">
                            {KIND_LABEL[lesson.kind]} · {lesson.minutes} min
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
          {contentQuiz ? (
            <Card>
              <h2 className="text-sm font-semibold">Assessment</h2>
              <div className="mt-3 text-sm">
                {contentQuizRow ? (
                  <Link
                    href={`/quiz/${contentQuizRow.id}`}
                    className="font-medium hover:text-[var(--accent)]"
                  >
                    {contentQuiz.title}
                  </Link>
                ) : (
                  <p className="font-medium">{contentQuiz.title}</p>
                )}
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {contentQuiz.questions.length} question
                  {contentQuiz.questions.length === 1 ? '' : 's'}
                  {contentQuizRow
                    ? ` · pass ${contentQuizRow.passThreshold}% · ${contentQuizRow.attemptsUsed}/${contentQuizRow.maxAttempts} attempts`
                    : ' · opens once assessments are loaded for your account'}
                </p>
                {contentQuizRow?.passed ? (
                  <Badge tone="success" className="mt-2">
                    Passed
                  </Badge>
                ) : null}
              </div>
            </Card>
          ) : null}

          {gradedQuizzes.filter((quiz) => quiz.slug !== contentQuiz?.slug).length > 0 ? (
            <Card>
              <h2 className="text-sm font-semibold">Other assessments</h2>
              <ul className="mt-3 space-y-3">
                {gradedQuizzes
                  .filter((quiz) => quiz.slug !== contentQuiz?.slug)
                  .map((quiz) => (
                    <li key={quiz.id} className="text-sm">
                      <Link
                        href={`/quiz/${quiz.id}`}
                        className="font-medium hover:text-[var(--accent)]"
                      >
                        {quiz.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        Pass {quiz.passThreshold}% · {quiz.attemptsUsed}/{quiz.maxAttempts}{' '}
                        attempts
                        {quiz.bestScorePct !== null ? ` · best ${quiz.bestScorePct}%` : ''}
                      </p>
                    </li>
                  ))}
              </ul>
            </Card>
          ) : null}

          {state.assignments.length > 0 ? (
            <Card>
              <h2 className="text-sm font-semibold">Lab reports</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {state.assignments.map((assignment) => (
                  <li key={assignment.id}>
                    <Link href={`/labs/${assignment.slug}`} className="hover:text-[var(--accent)]">
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
                <dd>{formatMinutes(course.minutes)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Modules</dt>
                <dd>{course.modules.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Lessons</dt>
                <dd>{total}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Hardware</dt>
                <dd>{course.requiresHardware ? 'Required' : 'Not required'}</dd>
              </div>
            </dl>
            {course.requiresHardware && course.hardwareNotes ? (
              <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
                {course.hardwareNotes}
              </p>
            ) : null}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Source</h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              {course.source}
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
