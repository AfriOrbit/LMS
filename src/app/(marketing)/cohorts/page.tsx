import Link from 'next/link';

import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import type { Cohort, Course } from '@/types/db';

export const metadata = {
  title: 'Cohorts',
  description: 'Scheduled hands-on EduSat cohorts with hardware kits and live passes.',
};
export const revalidate = 300;

interface CohortWithCourse extends Cohort {
  courses: Pick<Course, 'slug' | 'title'> | null;
}

export default async function CohortsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: cohorts } = await supabase
    .from('cohorts')
    .select('*, courses(slug, title)')
    .eq('is_published', true)
    .gte('ends_on', new Date().toISOString().slice(0, 10))
    .order('starts_on')
    .returns<CohortWithCourse[]>();

  return (
    <>
      <PageHeader
        eyebrow="Scheduled delivery"
        title="Cohorts"
        description="Instructor-led runs with hardware kits issued for the duration and at least one live ground-station pass. Self-paced enrolment is always available from the catalogue."
      />

      {(cohorts ?? []).length === 0 ? (
        <EmptyState
          title="No cohorts scheduled"
          description="Nothing on the calendar right now. Every course in the catalogue can be taken self-paced in the meantime."
          action={<ButtonLink href="/catalog">Browse courses</ButtonLink>}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {(cohorts ?? []).map((cohort) => {
            const seatsLeft = Math.max(0, cohort.capacity - cohort.seats_taken);
            return (
              <Card key={cohort.id} className="flex flex-col">
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge tone="info">{cohort.delivery_mode.replace('_', ' ')}</Badge>
                  <Badge tone={seatsLeft > 0 ? 'success' : 'danger'}>
                    {seatsLeft > 0 ? `${seatsLeft} seats left` : 'Full'}
                  </Badge>
                </div>

                <h2 className="text-base font-semibold leading-snug">{cohort.name}</h2>
                {cohort.courses ? (
                  <p className="mt-1 text-sm text-[var(--accent)]">
                    <Link href={`/catalog/${cohort.courses.slug}`} className="hover:underline">
                      {cohort.courses.title}
                    </Link>
                  </p>
                ) : null}

                {cohort.notes ? (
                  <p className="mt-3 flex-1 text-sm text-[var(--text-muted)]">
                    {cohort.notes}
                  </p>
                ) : (
                  <div className="flex-1" />
                )}

                <dl className="mt-5 space-y-1.5 border-t border-[var(--border)] pt-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">Dates</dt>
                    <dd>
                      {formatDate(cohort.starts_on)} – {formatDate(cohort.ends_on)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">Location</dt>
                    <dd>{cohort.location ?? 'Online'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">Timezone</dt>
                    <dd>{cohort.timezone}</dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
