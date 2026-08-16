import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Enrollment, LessonProgress, Quiz, QuizAttempt } from '@/types/db';

/**
 * Best-effort per-learner state for a course.
 *
 * The curriculum itself comes from `src/content/curriculum.ts` and never
 * touches the database. Everything in here — enrolment, completion ticks, quiz
 * attempts, lab assignments — is an *enhancement*. If the database is
 * unreachable, unseeded, or the learner simply has no rows yet, every loader
 * below returns the empty state and the page still renders the whole course.
 *
 * That is the point: a missing row must never hide content.
 */

export interface CourseQuizState {
  id: string;
  slug: string;
  title: string;
  lessonId: string | null;
  isGraded: boolean;
  passThreshold: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  attemptsUsed: number;
  bestScorePct: number | null;
  passed: boolean;
}

export interface CourseAssignmentState {
  id: string;
  slug: string;
  title: string;
}

export interface CourseState {
  /** True when the database answered with a row for this course. */
  available: boolean;
  courseId: string | null;
  priceCents: number;
  issuesCertificate: boolean;
  enrolled: boolean;
  progressPct: number;
  /** Lesson slugs the learner has ticked off. */
  completedSlugs: string[];
  /** Lesson slug → database uuid, for progress writes. */
  lessonIdBySlug: Record<string, string>;
  quizzes: CourseQuizState[];
  assignments: CourseAssignmentState[];
}

export const EMPTY_COURSE_STATE: CourseState = {
  available: false,
  courseId: null,
  priceCents: 0,
  issuesCertificate: false,
  enrolled: false,
  progressPct: 0,
  completedSlugs: [],
  lessonIdBySlug: {},
  quizzes: [],
  assignments: [],
};

type CourseRow = {
  id: string;
  price_cents: number;
  issues_certificate: boolean;
};

type LessonRow = { id: string; slug: string };
type AssignmentRow = { id: string; slug: string; title: string };
type AttemptRow = Pick<QuizAttempt, 'quiz_id' | 'passed' | 'score_pct'>;

function warn(courseSlug: string, error: unknown): void {
  console.warn(
    `[course-state] progress unavailable for "${courseSlug}" — rendering content only:`,
    error instanceof Error ? error.message : error,
  );
}

/**
 * How long the page will wait for per-learner state before giving up on it.
 *
 * An unreachable host takes the better part of ten seconds to fail DNS and
 * connect. Waiting that out on every lesson makes a healthy page look broken,
 * and the thing we are waiting for is only a set of tick marks.
 */
const STATE_TIMEOUT_MS = 4_000;

/**
 * Load whatever the database can tell us about this learner and course.
 * Never throws, never rejects: failures degrade to `EMPTY_COURSE_STATE`.
 */
export async function loadCourseState(
  courseSlug: string,
  userId: string,
): Promise<CourseState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<CourseState>((resolve) => {
    timer = setTimeout(() => {
      warn(courseSlug, `no response within ${STATE_TIMEOUT_MS} ms`);
      resolve(EMPTY_COURSE_STATE);
    }, STATE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([queryCourseState(courseSlug, userId), budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function queryCourseState(
  courseSlug: string,
  userId: string,
): Promise<CourseState> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, price_cents, issues_certificate')
      .eq('slug', courseSlug)
      .maybeSingle<CourseRow>();

    if (courseError) {
      warn(courseSlug, courseError.message);
      return EMPTY_COURSE_STATE;
    }
    if (!course) return EMPTY_COURSE_STATE;

    const [enrollmentResult, lessonResult, progressResult, quizResult, assignmentResult] =
      await Promise.all([
        supabase
          .from('enrollments')
          .select('*')
          .eq('user_id', userId)
          .eq('course_id', course.id)
          .maybeSingle<Enrollment>(),
        supabase
          .from('lessons_readable')
          .select('id, slug')
          .eq('course_id', course.id)
          .returns<LessonRow[]>(),
        supabase
          .from('lesson_progress')
          .select('*')
          .eq('user_id', userId)
          .eq('course_id', course.id)
          .returns<LessonProgress[]>(),
        supabase.from('quizzes').select('*').eq('course_id', course.id).returns<Quiz[]>(),
        supabase
          .from('lab_assignments')
          .select('id, slug, title')
          .eq('course_id', course.id)
          .returns<AssignmentRow[]>(),
      ]);

    const lessonRows = lessonResult.data ?? [];
    const lessonIdBySlug: Record<string, string> = {};
    const slugByLessonId = new Map<string, string>();
    for (const row of lessonRows) {
      lessonIdBySlug[row.slug] = row.id;
      slugByLessonId.set(row.id, row.slug);
    }

    const completedSlugs = (progressResult.data ?? [])
      .filter((row) => row.completed)
      .map((row) => slugByLessonId.get(row.lesson_id))
      .filter((slug): slug is string => Boolean(slug));

    const quizRows = quizResult.data ?? [];
    let attempts: AttemptRow[] = [];
    if (quizRows.length > 0) {
      const { data } = await supabase
        .from('quiz_attempts')
        .select('quiz_id, passed, score_pct')
        .eq('user_id', userId)
        .in(
          'quiz_id',
          quizRows.map((quiz) => quiz.id),
        )
        .returns<AttemptRow[]>();
      attempts = data ?? [];
    }

    const quizzes: CourseQuizState[] = quizRows.map((quiz) => {
      const own = attempts.filter((attempt) => attempt.quiz_id === quiz.id);
      const scored = own
        .map((attempt) => attempt.score_pct)
        .filter((score): score is number => score !== null);

      return {
        id: quiz.id,
        slug: quiz.slug,
        title: quiz.title,
        lessonId: quiz.lesson_id,
        isGraded: quiz.is_graded,
        passThreshold: quiz.pass_threshold,
        maxAttempts: quiz.max_attempts,
        timeLimitMinutes: quiz.time_limit_minutes,
        attemptsUsed: own.length,
        bestScorePct: scored.length > 0 ? Math.max(...scored.map(Number)) : null,
        passed: own.some((attempt) => attempt.passed === true),
      };
    });

    const enrollment = enrollmentResult.data ?? null;

    return {
      available: true,
      courseId: course.id,
      priceCents: course.price_cents,
      issuesCertificate: course.issues_certificate,
      enrolled: Boolean(enrollment),
      progressPct: enrollment?.progress_pct ?? 0,
      completedSlugs,
      lessonIdBySlug,
      quizzes,
      assignments: assignmentResult.data ?? [],
    };
  } catch (error) {
    warn(courseSlug, error);
    return EMPTY_COURSE_STATE;
  }
}

/** True when every graded assessment on record has been passed. */
export function allGradedQuizzesPassed(state: CourseState): boolean {
  return state.quizzes.filter((quiz) => quiz.isGraded).every((quiz) => quiz.passed);
}
