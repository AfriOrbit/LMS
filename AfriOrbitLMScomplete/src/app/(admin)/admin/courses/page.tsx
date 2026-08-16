import Link from 'next/link';

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireStaff } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatMinutes, formatPrice, LEVEL_LABEL } from '@/lib/utils';
import type { Course } from '@/types/db';

import { CourseStatusControl } from './course-status-control';

export const metadata = { title: 'Courses · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminCoursesPage() {
  const ctx = await requireStaff();
  const supabase = await createSupabaseServerClient();

  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .order('sort_order')
    .returns<Course[]>();

  const counts = await Promise.all(
    (courses ?? []).map(async (course) => {
      const [{ count: lessons }, { count: enrolled }] = await Promise.all([
        supabase
          .from('lessons')
          .select('*', { count: 'exact', head: true })
          .eq('course_id', course.id),
        supabase
          .from('enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('course_id', course.id),
      ]);
      return { id: course.id, lessons: lessons ?? 0, enrolled: enrolled ?? 0 };
    }),
  );
  const byId = new Map(counts.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Courses"
        description="Publishing state and enrolment at a glance. Lesson content is authored in the database or through the Supabase table editor; see docs/CONTENT.md."
      />

      {(courses ?? []).length === 0 ? (
        <EmptyState
          title="No courses"
          description="Run the seed migration to load the EduSat curriculum, or create a course row directly."
        />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Lessons</th>
                  <th className="px-4 py-3 font-medium">Enrolled</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(courses ?? []).map((course) => (
                  <tr
                    key={course.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/catalog/${course.slug}`}
                        className="font-medium hover:text-ion-300"
                      >
                        {course.title}
                      </Link>
                      <p className="font-mono text-xs text-[var(--text-muted)]">
                        {course.slug} · {formatMinutes(course.estimated_minutes)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={course.level === 'advanced' ? 'warning' : 'info'}>
                        {LEVEL_LABEL[course.level]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {byId.get(course.id)?.lessons ?? 0}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {byId.get(course.id)?.enrolled ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      {formatPrice(course.price_cents, course.currency)}
                    </td>
                    <td className="px-4 py-3">
                      {ctx.profile.role === 'admin' ? (
                        <CourseStatusControl
                          courseId={course.id}
                          status={course.status}
                        />
                      ) : (
                        <Badge
                          tone={course.status === 'published' ? 'success' : 'neutral'}
                        >
                          {course.status}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
