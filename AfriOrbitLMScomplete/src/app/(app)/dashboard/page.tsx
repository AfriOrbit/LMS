import Link from 'next/link';

import { BarRow, CAT, Donut, Heatmap, Sparkline, STATUS } from '@/components/charts';
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  ProgressBar,
  Stat,
} from '@/components/ui/primitives';
import { requireActiveMember } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate, formatDateTime, formatMinutes, LEVEL_LABEL } from '@/lib/utils';
import type { Certificate, Course, Enrollment, LabSession } from '@/types/db';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

interface EnrollmentWithCourse extends Enrollment {
  courses: Course | null;
}

/** Per-day completion signal for the activity calendar. */
interface ProgressPulse {
  completed_at: string | null;
}

interface AttemptScore {
  course_id: string;
  score_pct: number | null;
  passed: boolean | null;
  submitted_at: string | null;
  quizzes: { title: string } | null;
}

const ACTIVITY_WEEKS = 12;
const DAY_MS = 86_400_000;
/** A course untouched for this long is a nudge, not a failure. */
const STALL_DAYS = 14;
/** Below three points a line has no shape worth drawing. */
const SPARKLINE_MIN_POINTS = 3;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

export default async function DashboardPage() {
  const ctx = await requireActiveMember();
  const supabase = await createSupabaseServerClient();

  /* ---------------------------------------------------------------------- */
  /* Activity window — 12 whole weeks in UTC, ending on the Sunday that      */
  /* closes the current week, so the query and the grid agree exactly.       */
  /* ---------------------------------------------------------------------- */

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const weekdayIndex = (today.getUTCDay() + 6) % 7; // Monday = 0
  const gridEnd = new Date(today.getTime() + (6 - weekdayIndex) * DAY_MS);
  const gridStart = new Date(gridEnd.getTime() - (ACTIVITY_WEEKS * 7 - 1) * DAY_MS);

  const [
    { data: enrollments },
    { data: certificates },
    { data: sessions },
    { data: pulses },
    { data: attempts },
    { count: lessonsCompletedCount },
  ] = await Promise.all([
    supabase
      .from('enrollments')
      .select('*, courses(*)')
      .eq('user_id', ctx.userId)
      .order('updated_at', { ascending: false })
      .returns<EnrollmentWithCourse[]>(),
    supabase
      .from('certificates')
      .select('*')
      .eq('user_id', ctx.userId)
      .order('issued_at', { ascending: false })
      .returns<Certificate[]>(),
    supabase
      .from('lab_sessions')
      .select('*')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(4)
      .returns<LabSession[]>(),
    supabase
      .from('lesson_progress')
      .select('completed_at')
      .eq('user_id', ctx.userId)
      .eq('completed', true)
      .gte('completed_at', gridStart.toISOString())
      .returns<ProgressPulse[]>(),
    supabase
      .from('quiz_attempts')
      .select('course_id, score_pct, passed, submitted_at, quizzes(title)')
      .eq('user_id', ctx.userId)
      .not('score_pct', 'is', null)
      .not('submitted_at', 'is', null)
      .order('submitted_at')
      .returns<AttemptScore[]>(),
    // Head-only count: lifetime lessons completed, unaffected by the row cap.
    supabase
      .from('lesson_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .eq('completed', true),
  ]);

  const allEnrollments = enrollments ?? [];
  const allCertificates = certificates ?? [];
  const active = allEnrollments.filter((e) => e.status === 'active');
  const completed = allEnrollments.filter((e) => e.status === 'completed');
  const firstName = (ctx.profile.full_name || 'there').split(' ')[0];

  /* ---------------------------------------------------------------------- */
  /* Derived series for the charts                                           */
  /* ---------------------------------------------------------------------- */

  const tracked = allEnrollments.filter((e) => e.status !== 'withdrawn');

  const lessonsDone = lessonsCompletedCount ?? 0;

  const overallPct =
    tracked.length === 0
      ? 0
      : tracked.reduce((sum, e) => sum + e.progress_pct, 0) / tracked.length;

  const progressByCourse = tracked
    .map((e) => ({
      label: e.courses?.title ?? 'Untitled course',
      value: e.progress_pct,
    }))
    .sort((a, b) => b.value - a.value);

  // One bucket per UTC day. lesson_progress.completed_at is the only real
  // per-day signal in the schema; if it is empty we show nothing rather than
  // synthesising activity from enrolment timestamps.
  const activityByDay = new Map<string, number>();
  for (const pulse of pulses ?? []) {
    if (!pulse.completed_at) continue;
    const day = pulse.completed_at.slice(0, 10);
    activityByDay.set(day, (activityByDay.get(day) ?? 0) + 1);
  }

  const activityCells: { x: number; y: number; value: number }[] = [];
  for (const [day, value] of activityByDay) {
    const offset = Math.round((Date.parse(`${day}T00:00:00.000Z`) - gridStart.getTime()) / DAY_MS);
    if (!Number.isFinite(offset) || offset < 0 || offset >= ACTIVITY_WEEKS * 7) continue;
    activityCells.push({ x: Math.floor(offset / 7), y: offset % 7, value });
  }
  const busiestDay = Math.max(1, ...activityCells.map((c) => c.value));

  // Label a column only where the month turns over — 12 abutting date labels
  // would be noise at this cell width.
  const weekLabels: string[] = [];
  for (let c = 0, previousMonth = -1; c < ACTIVITY_WEEKS; c += 1) {
    const first = new Date(gridStart.getTime() + c * 7 * DAY_MS);
    const month = first.getUTCMonth();
    weekLabels.push(month === previousMonth ? '' : MONTH_SHORT.format(first));
    previousMonth = month;
  }

  const scoredAttempts = (attempts ?? []).filter(
    (a): a is AttemptScore & { score_pct: number; submitted_at: string } =>
      a.score_pct !== null && a.submitted_at !== null,
  );
  const quizScores = scoredAttempts.map((a) => Number(a.score_pct));
  const quizLabels = scoredAttempts.map(
    (a) => `${a.quizzes?.title ?? 'Quiz'} · ${formatDate(a.submitted_at)}`,
  );
  const quizAverage =
    quizScores.length === 0
      ? null
      : quizScores.reduce((sum, v) => sum + v, 0) / quizScores.length;

  /* ---------------------------------------------------------------------- */
  /* Nudges — both conditions are read off real rows, never invented.        */
  /* ---------------------------------------------------------------------- */

  // `today` is already UTC midnight of the current day, which is the right
  // granularity for a fourteen-day threshold.
  const stallCutoff = today.getTime() - STALL_DAYS * DAY_MS;
  const stalled = tracked.filter(
    (e) =>
      e.status === 'active' &&
      e.progress_pct === 0 &&
      Date.parse(e.started_at) < stallCutoff,
  );

  const failedCourseIds = new Set(
    (attempts ?? []).filter((a) => a.passed === false).map((a) => a.course_id),
  );
  const failing = tracked.filter((e) => failedCourseIds.has(e.course_id));

  const showProgress = tracked.length > 0 || activityCells.length > 0 || quizScores.length > 0;
  const showSparkline = quizScores.length >= SPARKLINE_MIN_POINTS;

  return (
    <>
      <PageHeader
        eyebrow="EduSat programme"
        title={`Welcome back, ${firstName}`}
        description="Pick up where you left off, or add a course from the catalogue."
        actions={
          <ButtonLink href="/catalog" variant="secondary" size="sm">
            Browse catalogue
          </ButtonLink>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Courses in progress"
          value={active.length}
          hint={
            completed.length > 0
              ? `${completed.length} completed`
              : 'Nothing finished yet'
          }
        />
        <Stat
          label="Lessons completed"
          value={lessonsDone}
          hint="Across every enrolment"
        />
        <Stat
          label="Average quiz score"
          value={quizAverage === null ? '—' : `${Math.round(quizAverage)}%`}
          hint={
            quizScores.length === 0
              ? 'No graded attempts yet'
              : `${quizScores.length} graded ${quizScores.length === 1 ? 'attempt' : 'attempts'}`
          }
        />
        <Stat
          label="Certificates earned"
          value={allCertificates.length}
          hint={
            allCertificates.length === 0
              ? 'Finish a course to earn one'
              : 'Verifiable and downloadable'
          }
        />
      </div>

      {failing.length > 0 || stalled.length > 0 || !ctx.profile.mfa_enabled ? (
        <div className="mb-10 space-y-3">
          {failing.length > 0 ? (
            <Alert tone="warning" title="A quiz needs another run">
              You have a failed attempt in{' '}
              {failing.map((e, i) => (
                <span key={e.id}>
                  {i > 0 ? (i === failing.length - 1 ? ' and ' : ', ') : ''}
                  <Link
                    href={e.courses ? `/learn/${e.courses.slug}` : '/dashboard'}
                    className="font-medium underline underline-offset-2"
                  >
                    {e.courses?.title ?? 'a course'}
                  </Link>
                </span>
              ))}
              . Revisit the lesson before you spend another attempt &mdash; the explanations
              shown after a graded attempt point straight at what was missed.
            </Alert>
          ) : null}

          {stalled.length > 0 ? (
            <Alert tone="info" title="Not started yet">
              {stalled.map((e, i) => (
                <span key={e.id}>
                  {i > 0 ? (i === stalled.length - 1 ? ' and ' : ', ') : ''}
                  <Link
                    href={e.courses ? `/learn/${e.courses.slug}` : '/dashboard'}
                    className="font-medium underline underline-offset-2"
                  >
                    {e.courses?.title ?? 'A course'}
                  </Link>
                </span>
              ))}{' '}
              {stalled.length === 1 ? 'has' : 'have'} been open for more than {STALL_DAYS} days
              with no lessons completed. The first module is short &mdash; one sitting is
              usually enough to break the ice.
            </Alert>
          ) : null}

          {!ctx.profile.mfa_enabled ? (
            <Alert tone="info" title="Two-factor authentication is off">
              <Link href="/account/mfa" className="font-medium underline underline-offset-2">
                Enable 2FA
              </Link>{' '}
              to protect your certificates and lab bookings.
            </Alert>
          ) : null}
        </div>
      ) : null}

      {showProgress ? (
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Your progress</h2>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col items-center">
              <h3 className="mb-3 self-start text-sm font-semibold">Overall completion</h3>
              <Donut
                segments={[
                  { label: 'Complete', value: Math.round(overallPct), color: CAT[0] },
                  { label: 'Remaining', value: 100 - Math.round(overallPct), color: 'var(--border)' },
                ]}
                centerValue={`${Math.round(overallPct)}%`}
                centerLabel={`of ${tracked.length} ${tracked.length === 1 ? 'course' : 'courses'}`}
                format={(v) => `${Math.round(v)}%`}
                emptyMessage="Enrol in a course to start tracking completion."
              />
              <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
                Averaged across every course you are enrolled in.
              </p>
            </Card>

            <Card className="lg:col-span-2">
              <h3 className="mb-1 text-sm font-semibold">Progress by course</h3>
              <p className="mb-4 text-xs text-[var(--text-muted)]">
                Percentage of lessons completed, furthest along first.
              </p>
              <BarRow
                items={progressByCourse}
                max={100}
                color={CAT[0]}
                format={(v) => `${Math.round(v)}%`}
                label="Progress by course"
                emptyMessage="Enrol in a course and your progress will chart here."
              />
            </Card>
          </div>

          <div className={`mt-4 grid gap-4 ${showSparkline ? 'lg:grid-cols-2' : ''}`}>
            <Card>
              <h3 className="mb-1 text-sm font-semibold">Study activity</h3>
              <p className="mb-4 text-xs text-[var(--text-muted)]">
                Lessons completed per day over the last {ACTIVITY_WEEKS} weeks.
              </p>
              <Heatmap
                cells={activityCells}
                xLabels={weekLabels}
                yLabels={WEEKDAYS}
                max={busiestDay}
                label="Lessons completed per day"
                cellWidth={18}
                cellHeight={16}
                labelWidth={34}
                format={(v) =>
                  v === 0 ? 'no lessons' : `${v} ${v === 1 ? 'lesson' : 'lessons'}`
                }
                emptyMessage={`No completed lessons in the last ${ACTIVITY_WEEKS} weeks.`}
              />
            </Card>

            {showSparkline ? (
              <Card>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold">Quiz scores over time</h3>
                  {quizAverage !== null ? (
                    <span className="text-xs text-[var(--text-muted)]">
                      Average {Math.round(quizAverage)}%
                    </span>
                  ) : null}
                </div>
                <p className="mb-4 text-xs text-[var(--text-muted)]">
                  Every graded attempt, oldest to newest.
                </p>
                <Sparkline
                  values={quizScores}
                  pointLabels={quizLabels}
                  label="Quiz scores over time"
                  min={0}
                  max={100}
                  width={420}
                  height={72}
                  showEndLabel
                  color={
                    quizScores[quizScores.length - 1] >= quizScores[0]
                      ? STATUS.good
                      : STATUS.warning
                  }
                  format={(v) => `${Math.round(v)}%`}
                />
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Continue learning</h2>

        {active.length === 0 ? (
          <EmptyState
            title="Nothing in progress"
            description="Enrol in a course to see it here. The EduSat track is designed to be taken in order, starting with CubeSat Systems Engineering Fundamentals."
            action={<ButtonLink href="/catalog">Browse the catalogue</ButtonLink>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((enrollment) => {
              const course = enrollment.courses;
              if (!course) return null;
              return (
                <Card key={enrollment.id} className="flex flex-col">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={course.level === 'advanced' ? 'warning' : 'info'}>
                      {LEVEL_LABEL[course.level]}
                    </Badge>
                    {course.requires_hardware ? (
                      <Badge tone="neutral">Hardware</Badge>
                    ) : null}
                  </div>
                  <h3 className="text-base font-semibold leading-snug">
                    <Link href={`/learn/${course.slug}`} className="hover:text-ion-300">
                      {course.title}
                    </Link>
                  </h3>
                  <p className="mt-1.5 flex-1 text-sm text-[var(--text-muted)]">
                    {course.summary}
                  </p>
                  <ProgressBar
                    value={enrollment.progress_pct}
                    label="Progress"
                    className="mt-4"
                  />
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatMinutes(course.estimated_minutes)}
                    </span>
                    <ButtonLink href={`/learn/${course.slug}`} size="sm">
                      Continue
                    </ButtonLink>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Upcoming lab sessions</h2>
          {(sessions ?? []).length === 0 ? (
            <EmptyState
              title="No scheduled sessions"
              description="Lab sessions appear here once your cohort schedule is published."
            />
          ) : (
            <div className="space-y-3">
              {(sessions ?? []).map((session) => (
                <Card key={session.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{session.title}</h3>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {formatDateTime(session.starts_at)} ·{' '}
                        {session.location ?? 'Online'}
                      </p>
                      {session.ground_station ? (
                        <p className="mt-1 font-mono text-xs text-ion-300">
                          Ground station {session.ground_station}
                          {session.norad_id ? ` · NORAD ${session.norad_id}` : ''}
                        </p>
                      ) : null}
                    </div>
                    <ButtonLink href="/labs" size="sm" variant="secondary">
                      Details
                    </ButtonLink>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Recent certificates</h2>
          {allCertificates.length === 0 ? (
            <EmptyState
              title="No certificates yet"
              description="Complete every lesson and pass the graded assessments to earn one."
            />
          ) : (
            <div className="space-y-3">
              {allCertificates.slice(0, 4).map((cert) => (
                <Card key={cert.id} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{cert.course_title}</h3>
                      <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                        {cert.code} · {formatDate(cert.issued_at)}
                      </p>
                    </div>
                    <ButtonLink
                      href={`/api/certificates/${cert.code}/pdf`}
                      size="sm"
                      variant="secondary"
                    >
                      PDF
                    </ButtonLink>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
