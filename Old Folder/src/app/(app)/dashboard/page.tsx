import Link from 'next/link';

import {
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

export default async function DashboardPage() {
  const ctx = await requireActiveMember();
  const supabase = await createSupabaseServerClient();

  const [{ data: enrollments }, { data: certificates }, { data: sessions }] =
    await Promise.all([
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
    ]);

  const active = (enrollments ?? []).filter((e) => e.status === 'active');
  const completed = (enrollments ?? []).filter((e) => e.status === 'completed');
  const firstName = (ctx.profile.full_name || 'there').split(' ')[0];

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

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Courses in progress" value={active.length} />
        <Stat label="Completed" value={completed.length} />
        <Stat label="Certificates" value={(certificates ?? []).length} />
        <Stat
          label="Account"
          value={ctx.profile.mfa_enabled ? 'Secured' : 'Action needed'}
          hint={ctx.profile.mfa_enabled ? '2FA enabled' : 'Enable two-factor authentication'}
        />
      </div>

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
          {(certificates ?? []).length === 0 ? (
            <EmptyState
              title="No certificates yet"
              description="Complete every lesson and pass the graded assessments to earn one."
            />
          ) : (
            <div className="space-y-3">
              {(certificates ?? []).slice(0, 4).map((cert) => (
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
