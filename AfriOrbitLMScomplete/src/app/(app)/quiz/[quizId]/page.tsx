import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Markdown } from '@/components/markdown';
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  PageHeader,
} from '@/components/ui/primitives';
import { requireActiveMember } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/utils';
import type { Course, Quiz, QuizAttempt, QuizQuestionPublic } from '@/types/db';

import { QuizIntro } from './quiz-intro';
import { QuizRunner } from './quiz-runner';

export const dynamic = 'force-dynamic';

export default async function QuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  const ctx = await requireActiveMember();
  const supabase = await createSupabaseServerClient();

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .maybeSingle<Quiz>();

  if (!quiz) notFound();

  const [{ data: course }, { data: attempts }] = await Promise.all([
    supabase
      .from('courses')
      .select('*')
      .eq('id', quiz.course_id)
      .maybeSingle<Course>(),
    supabase
      .from('quiz_attempts')
      .select('*')
      .eq('quiz_id', quiz.id)
      .eq('user_id', ctx.userId)
      .order('attempt_no', { ascending: false })
      .returns<QuizAttempt[]>(),
  ]);

  const all = attempts ?? [];
  const inProgress = all.find(
    (a) =>
      a.status === 'in_progress' &&
      (!a.expires_at || new Date(a.expires_at) > new Date()),
  );
  const lastGraded = all.find((a) => a.status === 'graded');
  const bestScore = all.reduce<number | null>(
    (best, a) => (a.score_pct === null ? best : Math.max(best ?? 0, Number(a.score_pct))),
    null,
  );
  const hasPassed = all.some((a) => a.passed);

  let questions: QuizQuestionPublic[] = [];
  if (inProgress) {
    const { data } = await supabase
      .from('quiz_questions_public')
      .select('*')
      .in('id', inProgress.question_ids)
      .returns<QuizQuestionPublic[]>();

    // Restore the order the attempt was served in — the database shuffled it
    // once, and it must stay stable across reloads.
    const byId = new Map((data ?? []).map((q) => [q.id, q]));
    questions = inProgress.question_ids
      .map((id) => byId.get(id))
      .filter((q): q is QuizQuestionPublic => Boolean(q));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-6 text-sm text-[var(--text-muted)]">
        {course ? (
          <>
            <Link href={`/learn/${course.slug}`} className="hover:text-[var(--text)]">
              {course.title}
            </Link>
            <span className="mx-2">/</span>
          </>
        ) : null}
        <span>Assessment</span>
      </nav>

      <PageHeader
        eyebrow={quiz.is_graded ? 'Graded assessment' : 'Practice'}
        title={quiz.title}
        description={quiz.instructions || undefined}
      />

      <div className="mb-8 flex flex-wrap gap-2">
        <Badge tone="info">Pass mark {quiz.pass_threshold}%</Badge>
        <Badge tone="neutral">
          {all.length}/{quiz.max_attempts} attempts used
        </Badge>
        {quiz.time_limit_minutes ? (
          <Badge tone="warning">{quiz.time_limit_minutes} minute limit</Badge>
        ) : null}
        {hasPassed ? <Badge tone="success">Passed</Badge> : null}
        {bestScore !== null ? <Badge tone="neutral">Best {bestScore}%</Badge> : null}
      </div>

      {inProgress ? (
        <QuizRunner
          attemptId={inProgress.id}
          questions={questions}
          expiresAt={inProgress.expires_at}
          savedResponses={inProgress.responses as Record<string, string | string[]>}
          courseSlug={course?.slug ?? ''}
        />
      ) : (
        <>
          {lastGraded ? (
            <Card className="mb-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold">
                    Attempt {lastGraded.attempt_no}:{' '}
                    <span
                      className={lastGraded.passed ? 'text-signal-400' : 'text-alert-400'}
                    >
                      {Number(lastGraded.score_pct).toFixed(0)}%
                    </span>
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {lastGraded.points_earned} of {lastGraded.points_possible} points ·{' '}
                    {lastGraded.submitted_at
                      ? formatDateTime(lastGraded.submitted_at)
                      : ''}
                  </p>
                </div>
                <Badge tone={lastGraded.passed ? 'success' : 'danger'}>
                  {lastGraded.passed ? 'Passed' : 'Not passed'}
                </Badge>
              </div>

              {quiz.reveal_feedback && lastGraded.breakdown.length > 0 ? (
                <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-5">
                  <h3 className="text-sm font-semibold">Feedback</h3>
                  {lastGraded.breakdown.map((item, index) => (
                    <div
                      key={item.question_id}
                      className="rounded-lg border border-[var(--border)] p-3"
                    >
                      <p className="text-sm font-medium">
                        <span
                          className={item.correct ? 'text-signal-400' : 'text-alert-400'}
                        >
                          {item.correct ? '✓' : '✗'}
                        </span>{' '}
                        Question {index + 1}
                      </p>
                      {item.explanation_md ? (
                        <div className="mt-1.5">
                          <Markdown variant="compact">{item.explanation_md}</Markdown>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          {all.length >= quiz.max_attempts ? (
            <Alert tone="warning" title="No attempts remaining">
              You have used all {quiz.max_attempts} attempts. Contact your instructor if you
              need the attempt counter reset.
            </Alert>
          ) : (
            <QuizIntro
              quizId={quiz.id}
              attemptsUsed={all.length}
              maxAttempts={quiz.max_attempts}
              timeLimitMinutes={quiz.time_limit_minutes}
            />
          )}

          {course ? (
            <div className="mt-8">
              <ButtonLink href={`/learn/${course.slug}`} variant="ghost" size="sm">
                ← Back to course
              </ButtonLink>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
