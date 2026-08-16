/**
 * Programme analytics.
 *
 * Everything here runs through the caller's own Supabase client, so RLS is the
 * access control: `enrollments_staff_select`, `quiz_attempts_staff_select`,
 * `quiz_questions_staff_all` and `certificates_staff_all` are what make these
 * reads legal. The page guard is `requireStaff()`, matching the rest of /admin
 * (the admin layout guards too; the page repeats it so the file is safe on its
 * own).
 *
 * Aggregation happens in TypeScript rather than in PostgREST. Row counts here
 * are modest and a readable reduce beats a clever `select` we cannot test. If
 * a future panel needs a genuine SQL aggregate that RLS will not serve, add a
 * `security definer` view in a migration and grant it to staff — do NOT reach
 * for the service-role client from a page, which would bypass row-level
 * security for every reader.
 *
 * Note `supabase/config.toml` sets `max_rows = 200`, so every full-table read
 * is paged. A single un-paged `select` would silently aggregate the first 200
 * rows and quietly report the wrong number.
 */
import {
  BarRow,
  CAT,
  Heatmap,
  StackedBar,
  STATUS,
  type Segment,
} from '@/components/charts';
import { Badge, Card, EmptyState, PageHeader, Stat } from '@/components/ui/primitives';
import { requireStaff } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AttemptBreakdownItem, EnrollmentStatus } from '@/types/db';

export const metadata = { title: 'Analytics · Admin' };
export const dynamic = 'force-dynamic';

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const PAGE = 200; // must match supabase/config.toml -> max_rows
const HARD_CAP = 20_000; // refuse to loop forever on a runaway table
const DAY_MS = 86_400_000;
const HEATMAP_WEEKS = 8;
const HEATMAP_ROWS = 12; // courses shown; more than this stops being scannable
const RANKED_COURSES = 12;

/** Head-only count. Exact, and unaffected by the row cap. */
function head(supabase: Client, table: string) {
  return supabase.from(table).select('*', { count: 'exact', head: true });
}

/**
 * Read a whole table through the row cap. `build` must apply a stable order,
 * otherwise pages can overlap or skip rows.
 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < HARD_CAP; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Row shapes — only the columns we are granted and actually use.              */
/* -------------------------------------------------------------------------- */

interface CourseRow {
  id: string;
  title: string;
}
interface EnrollmentRow {
  id: string;
  course_id: string;
  status: EnrollmentStatus;
  created_at: string;
}
interface AttemptRow {
  id: string;
  breakdown: AttemptBreakdownItem[] | null;
}
interface QuizRow {
  id: string;
  title: string;
  course_id: string;
}
/** `answer_key` and `explanation_md` are revoked at the column level, even for
 *  staff sessions — selecting them would fail the whole query. */
interface QuestionRow {
  id: string;
  quiz_id: string;
  prompt_md: string;
}

/** Flatten authored Markdown to something that fits in a table cell. */
function plainPrompt(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ENROLMENT_STATUS_ORDER: EnrollmentStatus[] = [
  'active',
  'completed',
  'withdrawn',
  'expired',
];

const ENROLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
};

/**
 * Enrolment status is a state, so it wears the status palette rather than the
 * categorical ramp. `active` is the one genuinely neutral in-flight state, so
 * it takes the identity blue; `expired` is a lapse, not a failure, so it takes
 * a text token rather than a hue.
 */
const ENROLMENT_STATUS_COLOR: Record<EnrollmentStatus, string> = {
  active: CAT[0],
  completed: STATUS.good,
  withdrawn: STATUS.critical,
  expired: 'var(--text-muted)',
};

const WEEK_LABEL = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export default async function AdminAnalyticsPage() {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const [
    [learnerCount, activeEnrollments, totalEnrollments, completedEnrollments, certificateCount],
    courses,
    enrollments,
    attempts,
    quizzes,
    questions,
  ] = await Promise.all([
    Promise.all([
      head(supabase, 'profiles').eq('role', 'learner'),
      head(supabase, 'enrollments').eq('status', 'active'),
      head(supabase, 'enrollments'),
      head(supabase, 'enrollments').eq('status', 'completed'),
      head(supabase, 'certificates'),
    ]).then((rs) => rs.map((r) => r.count ?? 0)),
    fetchAll<CourseRow>((from, to) =>
      supabase.from('courses').select('id, title').order('id').range(from, to).returns<CourseRow[]>(),
    ),
    fetchAll<EnrollmentRow>((from, to) =>
      supabase
        .from('enrollments')
        .select('id, course_id, status, created_at')
        .order('id')
        .range(from, to)
        .returns<EnrollmentRow[]>(),
    ),
    fetchAll<AttemptRow>((from, to) =>
      supabase
        .from('quiz_attempts')
        .select('id, breakdown')
        .in('status', ['graded', 'submitted'])
        .order('id')
        .range(from, to)
        .returns<AttemptRow[]>(),
    ),
    fetchAll<QuizRow>((from, to) =>
      supabase.from('quizzes').select('id, title, course_id').order('id').range(from, to).returns<QuizRow[]>(),
    ),
    fetchAll<QuestionRow>((from, to) =>
      supabase
        .from('quiz_questions')
        .select('id, quiz_id, prompt_md')
        .order('id')
        .range(from, to)
        .returns<QuestionRow[]>(),
    ),
  ]);

  const courseTitle = new Map(courses.map((c) => [c.id, c.title]));
  const completionRate =
    totalEnrollments === 0 ? 0 : (completedEnrollments / totalEnrollments) * 100;

  /* ---------------------------------------------------------------------- */
  /* Panel 2 — enrolments per course                                         */
  /* ---------------------------------------------------------------------- */

  const enrolCount = new Map<string, number>();
  for (const e of enrollments) enrolCount.set(e.course_id, (enrolCount.get(e.course_id) ?? 0) + 1);

  const enrolmentsPerCourse = [...enrolCount.entries()]
    .map(([id, value]) => ({ label: courseTitle.get(id) ?? 'Unknown course', value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, RANKED_COURSES);

  /* ---------------------------------------------------------------------- */
  /* Panel 3 — enrolment status breakdown                                    */
  /* ---------------------------------------------------------------------- */

  const statusCount = new Map<EnrollmentStatus, number>();
  for (const e of enrollments) statusCount.set(e.status, (statusCount.get(e.status) ?? 0) + 1);

  const statusSegments: Segment[] = ENROLMENT_STATUS_ORDER.map((s) => ({
    label: ENROLMENT_STATUS_LABEL[s],
    value: statusCount.get(s) ?? 0,
    color: ENROLMENT_STATUS_COLOR[s],
  })).filter((s) => s.value > 0);

  /* ---------------------------------------------------------------------- */
  /* Panel 4 — quiz item analysis                                            */
  /*                                                                         */
  /* The per-question record lives in quiz_attempts.breakdown, written only   */
  /* by app.grade_attempt(). A question that was never served simply has no   */
  /* entries, which is why it reports no percentage rather than zero.         */
  /* ---------------------------------------------------------------------- */

  const itemTally = new Map<string, { correct: number; seen: number }>();
  for (const a of attempts) {
    if (!Array.isArray(a.breakdown)) continue;
    for (const item of a.breakdown) {
      if (!item?.question_id) continue;
      const t = itemTally.get(item.question_id) ?? { correct: 0, seen: 0 };
      t.seen += 1;
      if (item.correct) t.correct += 1;
      itemTally.set(item.question_id, t);
    }
  }

  const quizById = new Map(quizzes.map((q) => [q.id, q]));

  const itemAnalysis = questions
    .map((question) => {
      const tally = itemTally.get(question.id) ?? { correct: 0, seen: 0 };
      const quiz = quizById.get(question.quiz_id);
      return {
        id: question.id,
        prompt: plainPrompt(question.prompt_md),
        quiz: quiz?.title ?? 'Unknown quiz',
        course: quiz ? (courseTitle.get(quiz.course_id) ?? 'Unknown course') : 'Unknown course',
        seen: tally.seen,
        correctPct: tally.seen === 0 ? null : (tally.correct / tally.seen) * 100,
      };
    })
    // Worst first. Never-answered items carry no signal, so they sink to the
    // bottom rather than dominating the top with a fake 0%.
    .sort((a, b) => {
      if (a.correctPct === null && b.correctPct === null) return a.prompt.localeCompare(b.prompt);
      if (a.correctPct === null) return 1;
      if (b.correctPct === null) return -1;
      return a.correctPct - b.correctPct || b.seen - a.seen;
    });

  const answeredItems = itemAnalysis.filter((i) => i.correctPct !== null);
  const criticalItems = answeredItems.filter(
    (i) => i.correctPct !== null && i.correctPct < 30,
  ).length;
  const warningItems = answeredItems.filter(
    (i) => i.correctPct !== null && i.correctPct >= 30 && i.correctPct < 50,
  ).length;

  /* ---------------------------------------------------------------------- */
  /* Panel 5 — course × week-of-enrolment activity, last 8 weeks             */
  /* ---------------------------------------------------------------------- */

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const weekdayIndex = (today.getUTCDay() + 6) % 7; // Monday = 0
  const windowEnd = new Date(today.getTime() + (6 - weekdayIndex) * DAY_MS);
  const windowStart = new Date(windowEnd.getTime() - (HEATMAP_WEEKS * 7 - 1) * DAY_MS);

  const weekLabels = Array.from({ length: HEATMAP_WEEKS }, (_, c) =>
    WEEK_LABEL.format(new Date(windowStart.getTime() + c * 7 * DAY_MS)),
  );

  const recent = enrollments.filter((e) => {
    const t = Date.parse(e.created_at);
    return Number.isFinite(t) && t >= windowStart.getTime() && t <= windowEnd.getTime() + DAY_MS;
  });

  const recentPerCourse = new Map<string, number>();
  for (const e of recent) recentPerCourse.set(e.course_id, (recentPerCourse.get(e.course_id) ?? 0) + 1);

  const heatmapCourseIds = [...recentPerCourse.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, HEATMAP_ROWS)
    .map(([id]) => id);
  const heatmapRowIndex = new Map(heatmapCourseIds.map((id, i) => [id, i]));

  const activityCells: { x: number; y: number; value: number }[] = [];
  for (const e of recent) {
    const y = heatmapRowIndex.get(e.course_id);
    if (y === undefined) continue;
    const offset = Math.floor((Date.parse(e.created_at) - windowStart.getTime()) / DAY_MS);
    const x = Math.floor(offset / 7);
    if (x < 0 || x >= HEATMAP_WEEKS) continue;
    activityCells.push({ x, y, value: 1 });
  }

  const busiestCell = Math.max(
    1,
    ...activityCells
      .reduce((acc, c) => {
        const key = `${c.y}:${c.x}`;
        acc.set(key, (acc.get(key) ?? 0) + c.value);
        return acc;
      }, new Map<string, number>())
      .values(),
  );

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Programme analytics"
        description="Where learners are, how the assessments are behaving, and which questions are teaching signals rather than learner failures."
      />

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total learners" value={learnerCount} hint="Accounts with the learner role" />
        <Stat
          label="Active enrolments"
          value={activeEnrollments}
          hint={`${totalEnrollments} of all time`}
        />
        <Stat
          label="Completion rate"
          value={`${Math.round(completionRate)}%`}
          hint={`${completedEnrollments} of ${totalEnrollments} enrolments`}
        />
        <Stat label="Certificates issued" value={certificateCount} />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-sm font-semibold">Enrolments per course</h2>
          <p className="mb-4 text-xs text-[var(--text-muted)]">
            Every enrolment state, busiest first. Top {RANKED_COURSES} courses.
          </p>
          <BarRow
            items={enrolmentsPerCourse}
            color={CAT[0]}
            label="Enrolments per course"
            emptyMessage="No enrolments recorded yet."
          />
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold">Enrolment status</h2>
          <p className="mb-4 text-xs text-[var(--text-muted)]">
            The whole enrolment book, split by state.
          </p>
          <StackedBar
            segments={statusSegments}
            label="Enrolment status breakdown"
            emptyMessage="No enrolments recorded yet."
          />
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Withdrawn and expired enrolments stay in the denominator of the completion rate
            above &mdash; a learner who left is a result, not a rounding error.
          </p>
        </Card>
      </div>

      <section className="mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Quiz item analysis &mdash; where the teaching is not landing
          </h2>
          <p className="mt-1.5 max-w-3xl text-sm text-[var(--text-muted)]">
            <strong className="font-semibold text-[var(--text)]">
              A question almost everyone gets wrong is usually a teaching gap or an ambiguous
              question, not a weak cohort.
            </strong>{' '}
            Read the top of this list as a queue of lessons to rewrite, or of items that are
            mis-keyed, ambiguous, or testing something never taught. Questions with only a
            handful of attempts are noise &mdash; check the attempt count before acting.
          </p>
          {answeredItems.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {criticalItems} {criticalItems === 1 ? 'question is' : 'questions are'} under 30%
              correct and {warningItems} more {warningItems === 1 ? 'is' : 'are'} under 50%,
              out of {answeredItems.length} answered{' '}
              {answeredItems.length === 1 ? 'question' : 'questions'}.
            </p>
          ) : null}
        </div>

        {itemAnalysis.length === 0 ? (
          <EmptyState
            title="No questions in the bank yet"
            description="Item analysis appears once a quiz has questions and learners have submitted graded attempts. It is derived from the per-question breakdown written by the grading function."
          />
        ) : (
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Quiz questions ranked by the percentage of attempts answered correctly, worst
                  first
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Question
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Quiz
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Course
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Answered
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Correct
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itemAnalysis.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--border)] align-top last:border-0"
                    >
                      <td className="max-w-md px-4 py-2.5">{item.prompt}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">{item.quiz}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                        {item.course}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{item.seen}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        {item.correctPct === null ? (
                          <span className="text-xs text-[var(--text-muted)]">Never served</span>
                        ) : item.correctPct < 30 ? (
                          <Badge tone="danger">{Math.round(item.correctPct)}% correct</Badge>
                        ) : item.correctPct < 50 ? (
                          <Badge tone="warning">{Math.round(item.correctPct)}% correct</Badge>
                        ) : (
                          <span className="tabular-nums">{Math.round(item.correctPct)}%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Enrolment activity</h2>
        <Card>
          <h3 className="mb-1 text-sm font-semibold">
            New enrolments by course and week
          </h3>
          <p className="mb-4 text-xs text-[var(--text-muted)]">
            Last {HEATMAP_WEEKS} weeks, from <code>enrollments.created_at</code>. Weeks start on
            Monday, UTC. Top {HEATMAP_ROWS} courses by enrolments in this window.
          </p>
          <Heatmap
            cells={activityCells}
            xLabels={weekLabels}
            yLabels={heatmapCourseIds.map((id) => courseTitle.get(id) ?? 'Unknown course')}
            max={busiestCell}
            label="New enrolments by course and week"
            format={(v) => `${v} ${v === 1 ? 'enrolment' : 'enrolments'}`}
            emptyMessage={`No enrolments in the last ${HEATMAP_WEEKS} weeks.`}
          />
        </Card>
      </section>
    </>
  );
}
