import Link from 'next/link';

import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatMinutes, formatPrice, LEVEL_LABEL } from '@/lib/utils';
import type { Course, Track } from '@/types/db';

export const metadata = {
  title: 'Course catalogue',
  description:
    'CubeSat systems engineering, satellite-to-IoT link design, and flight software courses from AfriOrbit Space.',
};

export const revalidate = 300;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; q?: string }>;
}) {
  const { level, q } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase.from('courses').select('*').eq('status', 'published');
  if (level && ['foundation', 'intermediate', 'advanced'].includes(level)) {
    query = query.eq('level', level);
  }
  if (q) {
    // Escape PostgREST's `or` filter separators before interpolating.
    const safe = q.replace(/[,()*]/g, ' ').slice(0, 80);
    query = query.or(`title.ilike.%${safe}%,summary.ilike.%${safe}%`);
  }

  const [{ data: courses }, { data: tracks }] = await Promise.all([
    query.order('sort_order').returns<Course[]>(),
    supabase
      .from('tracks')
      .select('*')
      .eq('is_published', true)
      .order('sort_order')
      .returns<Track[]>(),
  ]);

  const track = tracks?.[0];

  return (
    <>
      <PageHeader
        eyebrow="Curriculum"
        title="Course catalogue"
        description={
          track
            ? track.summary
            : 'Applied training for engineers building and operating small satellites.'
        }
      />

      <div className="mb-8 flex flex-wrap gap-2">
        {[
          { value: '', label: 'All levels' },
          { value: 'foundation', label: 'Foundation' },
          { value: 'intermediate', label: 'Intermediate' },
          { value: 'advanced', label: 'Advanced' },
        ].map((option) => (
          <Link
            key={option.value || 'all'}
            href={option.value ? `/catalog?level=${option.value}` : '/catalog'}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              (level ?? '') === option.value
                ? 'border-ion-500 bg-ion-500/12 text-ion-200'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {(courses ?? []).length === 0 ? (
        <EmptyState
          title="No courses match"
          description="Try clearing the filter, or check back once more of the track is published."
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {(courses ?? []).map((course) => (
            <Card key={course.id} className="flex flex-col">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone={course.level === 'advanced' ? 'warning' : 'info'}>
                  {LEVEL_LABEL[course.level]}
                </Badge>
                {course.requires_hardware ? <Badge tone="neutral">Hardware</Badge> : null}
                {course.issues_certificate ? (
                  <Badge tone="success">Certificate</Badge>
                ) : null}
              </div>

              <h2 className="text-base font-semibold leading-snug">
                <Link href={`/catalog/${course.slug}`} className="hover:text-ion-300">
                  {course.title}
                </Link>
              </h2>
              {course.subtitle ? (
                <p className="mt-1 text-sm text-ion-300/80">{course.subtitle}</p>
              ) : null}

              <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
                {course.summary}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4 text-sm">
                <span className="text-[var(--text-muted)]">
                  {formatMinutes(course.estimated_minutes)}
                </span>
                <span className="font-medium">
                  {formatPrice(course.price_cents, course.currency)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
