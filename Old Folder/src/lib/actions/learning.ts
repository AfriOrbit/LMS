'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getSessionContext, requireActiveMember } from '@/lib/auth';
import { audit, rateLimit } from '@/lib/security';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  labReportSchema,
  lessonProgressSchema,
  quizSubmissionSchema,
  telemetryCaptureSchema,
  uuidSchema,
} from '@/lib/validation';
import type { LabReport, QuizAttempt } from '@/types/db';

export interface Result<T = undefined> {
  ok: boolean;
  message?: string;
  data?: T;
}

/* -------------------------------------------------------------------------- */
/* Enrollment                                                                  */
/* -------------------------------------------------------------------------- */

export async function enrollAction(courseId: string, courseSlug: string): Promise<Result> {
  const ctx = await requireActiveMember();

  if (!uuidSchema.safeParse(courseId).success) {
    return { ok: false, message: 'Invalid course.' };
  }

  const limit = await rateLimit('enroll', ctx.userId, 30, 3600);
  if (!limit.allowed) return { ok: false, message: 'Too many enrolments. Slow down.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema('app').rpc('enroll_self', { p_course: courseId });

  if (error) {
    const reasons: Record<string, string> = {
      payment_required: 'This course requires payment. Use the checkout button.',
      course_not_available: 'That course is not open for enrolment.',
      account_not_active: 'Your account is awaiting approval.',
    };
    return { ok: false, message: reasons[error.message] ?? 'Could not enrol.' };
  }

  await audit('course.enrolled', { entity: 'course', entityId: courseId });
  revalidatePath('/dashboard');
  redirect(`/learn/${courseSlug}`);
}

/* -------------------------------------------------------------------------- */
/* Lesson progress                                                             */
/* -------------------------------------------------------------------------- */

export async function setLessonProgressAction(input: {
  lessonId: string;
  completed: boolean;
  secondsSpent?: number;
}): Promise<Result<{ progressPct: number }>> {
  const ctx = await requireActiveMember();

  const parsed = lessonProgressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };

  const supabase = await createSupabaseServerClient();

  // Resolve the course from the lesson server-side; never trust a client-sent
  // course id, and let RLS decide whether this lesson is readable at all.
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, course_id')
    .eq('id', parsed.data.lessonId)
    .single<{ id: string; course_id: string }>();

  if (lessonError || !lesson) return { ok: false, message: 'Lesson not found.' };

  const { error } = await supabase.from('lesson_progress').upsert(
    {
      user_id: ctx.userId,
      lesson_id: lesson.id,
      course_id: lesson.course_id,
      completed: parsed.data.completed,
      completed_at: parsed.data.completed ? new Date().toISOString() : null,
      seconds_spent: parsed.data.secondsSpent ?? 0,
    },
    { onConflict: 'user_id,lesson_id' },
  );

  if (error) return { ok: false, message: error.message };

  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('progress_pct')
    .eq('user_id', ctx.userId)
    .eq('course_id', lesson.course_id)
    .single<{ progress_pct: number }>();

  revalidatePath('/dashboard');
  return { ok: true, data: { progressPct: enrollment?.progress_pct ?? 0 } };
}

/* -------------------------------------------------------------------------- */
/* Quizzes                                                                     */
/* -------------------------------------------------------------------------- */

export async function startQuizAttemptAction(
  quizId: string,
): Promise<Result<QuizAttempt>> {
  await requireActiveMember();
  if (!uuidSchema.safeParse(quizId).success) {
    return { ok: false, message: 'Invalid quiz.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('app')
    .rpc('start_quiz_attempt', { p_quiz: quizId })
    .single<QuizAttempt>();

  if (error) {
    const reasons: Record<string, string> = {
      attempt_limit_reached: 'You have used all your attempts on this assessment.',
      not_enrolled: 'Enrol in the course first.',
      quiz_has_no_questions: 'This assessment has no questions yet.',
      account_not_active: 'Your account is awaiting approval.',
    };
    return { ok: false, message: reasons[error.message] ?? 'Could not start the attempt.' };
  }

  await audit('quiz.attempt_started', { entity: 'quiz', entityId: quizId });
  return { ok: true, data };
}

export async function submitQuizAttemptAction(input: {
  attemptId: string;
  responses: Record<string, string | string[]>;
}): Promise<Result<QuizAttempt>> {
  const ctx = await requireActiveMember();

  const parsed = quizSubmissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid submission.' };

  const limit = await rateLimit('quiz-submit', ctx.userId, 40, 3600);
  if (!limit.allowed) return { ok: false, message: 'Too many submissions. Slow down.' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('app')
    .rpc('grade_attempt', {
      p_attempt: parsed.data.attemptId,
      p_responses: parsed.data.responses,
    })
    .single<QuizAttempt>();

  if (error) {
    const reasons: Record<string, string> = {
      attempt_already_submitted: 'This attempt has already been submitted.',
      attempt_not_found: 'Attempt not found.',
    };
    return { ok: false, message: reasons[error.message] ?? 'Could not grade the attempt.' };
  }

  await audit('quiz.attempt_submitted', {
    entity: 'attempt',
    entityId: parsed.data.attemptId,
    metadata: { score_pct: data.score_pct, passed: data.passed },
  });

  revalidatePath('/dashboard');
  return { ok: true, data };
}

/* -------------------------------------------------------------------------- */
/* Certificates                                                                */
/* -------------------------------------------------------------------------- */

export async function issueCertificateAction(courseId: string): Promise<Result<{ code: string }>> {
  await requireActiveMember();
  if (!uuidSchema.safeParse(courseId).success) {
    return { ok: false, message: 'Invalid course.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('app')
    .rpc('issue_certificate', { p_course: courseId })
    .single<{ code: string }>();

  if (error) {
    const reasons: Record<string, string> = {
      course_incomplete: 'Finish every lesson before claiming a certificate.',
      assessments_outstanding: 'You still have a graded assessment to pass.',
      certificate_not_offered: 'This course does not issue a certificate.',
    };
    return { ok: false, message: reasons[error.message] ?? 'Could not issue a certificate.' };
  }

  await audit('certificate.issued', { entity: 'course', entityId: courseId });
  revalidatePath('/certificates');
  return { ok: true, data: { code: data.code } };
}

/* -------------------------------------------------------------------------- */
/* Lab sessions and reports                                                    */
/* -------------------------------------------------------------------------- */

export async function bookLabSessionAction(sessionId: string): Promise<Result> {
  await requireActiveMember();
  if (!uuidSchema.safeParse(sessionId).success) {
    return { ok: false, message: 'Invalid session.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema('app')
    .rpc('book_lab_session', { p_session: sessionId });

  if (error) {
    const reasons: Record<string, string> = {
      session_full: 'That session is full. Try another slot.',
      not_enrolled: 'Enrol in the course first.',
      session_already_started: 'That session has already started.',
      session_not_available: 'That session is not open for booking.',
    };
    return { ok: false, message: reasons[error.message] ?? 'Could not book that session.' };
  }

  await audit('lab.booked', { entity: 'lab_session', entityId: sessionId });
  revalidatePath('/labs');
  return { ok: true, message: 'Booked.' };
}

export async function cancelLabBookingAction(bookingId: string): Promise<Result> {
  const ctx = await requireActiveMember();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('lab_bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('user_id', ctx.userId);

  if (error) return { ok: false, message: error.message };
  await audit('lab.booking_cancelled', { entity: 'lab_booking', entityId: bookingId });
  revalidatePath('/labs');
  return { ok: true };
}

export async function saveLabReportAction(input: {
  assignmentId: string;
  narrative: string;
  data: Record<string, string | number>;
  kitId?: string | null;
  submit?: boolean;
}): Promise<Result<LabReport>> {
  const ctx = await requireActiveMember();

  const parsed = labReportSchema.safeParse({ ...input, submit: input.submit ?? false });
  if (!parsed.success) return { ok: false, message: 'Check the form and try again.' };

  const supabase = await createSupabaseServerClient();

  const { data: assignment, error: assignmentError } = await supabase
    .from('lab_assignments')
    .select('id, course_id')
    .eq('id', parsed.data.assignmentId)
    .single<{ id: string; course_id: string }>();

  if (assignmentError || !assignment) {
    return { ok: false, message: 'Assignment not found.' };
  }

  const { data: existing } = await supabase
    .from('lab_reports')
    .select('id, status')
    .eq('assignment_id', assignment.id)
    .eq('user_id', ctx.userId)
    .maybeSingle<{ id: string; status: string }>();

  if (existing && ['submitted', 'graded'].includes(existing.status)) {
    return { ok: false, message: 'This report has already been submitted.' };
  }

  const payload = {
    assignment_id: assignment.id,
    user_id: ctx.userId,
    course_id: assignment.course_id,
    kit_id: parsed.data.kitId ?? null,
    narrative_md: parsed.data.narrative,
    data: parsed.data.data,
    status: parsed.data.submit ? ('submitted' as const) : ('draft' as const),
    submitted_at: parsed.data.submit ? new Date().toISOString() : null,
  };

  const { data, error } = existing
    ? await supabase
        .from('lab_reports')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single<LabReport>()
    : await supabase.from('lab_reports').insert(payload).select().single<LabReport>();

  if (error) return { ok: false, message: error.message };

  await audit(parsed.data.submit ? 'lab.report_submitted' : 'lab.report_saved', {
    entity: 'lab_report',
    entityId: data.id,
  });

  revalidatePath('/labs');
  return { ok: true, data, message: parsed.data.submit ? 'Submitted for grading.' : 'Draft saved.' };
}

/* -------------------------------------------------------------------------- */
/* Telemetry sandbox captures                                                  */
/* -------------------------------------------------------------------------- */

export async function saveTelemetryCaptureAction(input: {
  rawHex: string;
  decoded: Record<string, unknown>;
  rssiDbm?: number;
  snrDb?: number;
  frameValid?: boolean;
  notes?: string;
}): Promise<Result> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, message: 'Sign in first.' };

  const parsed = telemetryCaptureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid capture.' };

  const limit = await rateLimit('telemetry-capture', ctx.userId, 200, 3600);
  if (!limit.allowed) return { ok: false, message: 'Capture limit reached for this hour.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('telemetry_captures').insert({
    user_id: ctx.userId,
    source: 'sandbox',
    raw_hex: parsed.data.rawHex,
    decoded: parsed.data.decoded,
    rssi_dbm: parsed.data.rssiDbm ?? null,
    snr_db: parsed.data.snrDb ?? null,
    frame_valid: parsed.data.frameValid ?? null,
    notes: parsed.data.notes ?? null,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Capture saved to your lab record.' };
}
