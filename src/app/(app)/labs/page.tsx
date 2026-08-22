import Link from 'next/link';

import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
} from '@/components/ui/primitives';
import { requireActiveMember } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate, formatDateTime } from '@/lib/utils';
import type {
  HardwareKit,
  LabAssignment,
  LabBooking,
  LabReport,
  LabSession,
} from '@/types/db';

import { BookSessionButton } from './book-session-button';

export const metadata = { title: 'Labs' };
export const dynamic = 'force-dynamic';

interface KitAssignmentRow {
  id: string;
  assigned_at: string;
  due_back_on: string | null;
  returned_at: string | null;
  hardware_kits: HardwareKit | null;
}

const STATUS_TONE = {
  draft: 'neutral',
  submitted: 'info',
  returned: 'warning',
  graded: 'success',
} as const;

export default async function LabsPage() {
  const ctx = await requireActiveMember();
  const supabase = await createSupabaseServerClient();

  const [{ data: assignments }, { data: reports }, { data: sessions }, { data: bookings }, { data: kits }] =
    await Promise.all([
      supabase.from('lab_assignments').select('*').returns<LabAssignment[]>(),
      supabase
        .from('lab_reports')
        .select('*')
        .eq('user_id', ctx.userId)
        .returns<LabReport[]>(),
      supabase
        .from('lab_sessions')
        .select('*')
        .gte('ends_at', new Date().toISOString())
        .order('starts_at')
        .returns<LabSession[]>(),
      supabase
        .from('lab_bookings')
        .select('*')
        .eq('user_id', ctx.userId)
        .returns<LabBooking[]>(),
      supabase
        .from('kit_assignments')
        .select('id, assigned_at, due_back_on, returned_at, hardware_kits(*)')
        .eq('user_id', ctx.userId)
        .is('returned_at', null)
        .returns<KitAssignmentRow[]>(),
    ]);

  const reportByAssignment = new Map((reports ?? []).map((r) => [r.assignment_id, r]));
  const bookedSessionIds = new Set(
    (bookings ?? []).filter((b) => b.status !== 'cancelled').map((b) => b.session_id),
  );

  return (
    <>
      <PageHeader
        eyebrow="Hands-on"
        title="Labs"
        description="Hardware assigned to you, scheduled bench and ground-station sessions, and the reports you owe."
      />

      {(kits ?? []).length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Your hardware</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(kits ?? []).map((assignment) => {
              const kit = assignment.hardware_kits;
              if (!kit) return null;
              return (
                <Card key={assignment.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-sm font-semibold text-[var(--accent)]">
                        {kit.asset_tag}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {kit.kit_type.replace(/_/g, ' ')}
                        {kit.firmware_version ? ` · fw ${kit.firmware_version}` : ''}
                      </p>
                    </div>
                    <Badge tone={assignment.due_back_on ? 'warning' : 'neutral'}>
                      {assignment.due_back_on
                        ? `Due ${formatDate(assignment.due_back_on)}`
                        : 'On loan'}
                    </Badge>
                  </div>
                  {Object.keys(kit.spec ?? {}).length > 0 ? (
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--border)] pt-3 text-xs">
                      {Object.entries(kit.spec).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-2">
                          <dt className="text-[var(--text-muted)]">{key}</dt>
                          <dd className="truncate font-mono">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Lab reports</h2>
        {(assignments ?? []).length === 0 ? (
          <EmptyState
            title="No lab assignments"
            description="Lab assignments appear here once you enrol in a course that has them."
          />
        ) : (
          <div className="space-y-3">
            {(assignments ?? []).map((assignment) => {
              const report = reportByAssignment.get(assignment.id);
              return (
                <Card key={assignment.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">
                        <Link
                          href={`/labs/${assignment.slug}`}
                          className="hover:text-[var(--accent)]"
                        >
                          {assignment.title}
                        </Link>
                      </h3>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {assignment.max_points} points · pass at{' '}
                        {assignment.pass_threshold}%
                        {report?.graded_at
                          ? ` · graded ${formatDate(report.graded_at)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {report?.points_awarded !== null &&
                      report?.points_awarded !== undefined ? (
                        <span className="font-mono text-sm">
                          {report.points_awarded}/{assignment.max_points}
                        </span>
                      ) : null}
                      <Badge tone={report ? STATUS_TONE[report.status] : 'neutral'}>
                        {report ? report.status : 'not started'}
                      </Badge>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Scheduled sessions</h2>
        {(sessions ?? []).length === 0 ? (
          <EmptyState
            title="No sessions scheduled"
            description="Bench and ground-station sessions appear here once your cohort schedule is published."
          />
        ) : (
          <div className="space-y-3">
            {(sessions ?? []).map((session) => (
              <Card key={session.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">{session.title}</h3>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {formatDateTime(session.starts_at)} –{' '}
                      {formatDateTime(session.ends_at)} · {session.location ?? 'Online'} ·
                      capacity {session.capacity}
                    </p>
                    {session.objective ? (
                      <p className="mt-2 text-sm text-[var(--text-muted)]">
                        {session.objective}
                      </p>
                    ) : null}
                    {session.ground_station ? (
                      <p className="mt-2 font-mono text-xs text-[var(--accent)]">
                        {session.ground_station}
                        {session.norad_id ? ` · NORAD ${session.norad_id}` : ''}
                        {session.tle_line1 ? ' · TLE cached' : ''}
                      </p>
                    ) : null}
                  </div>
                  <BookSessionButton
                    sessionId={session.id}
                    booked={bookedSessionIds.has(session.id)}
                    meetingUrl={session.meeting_url}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
