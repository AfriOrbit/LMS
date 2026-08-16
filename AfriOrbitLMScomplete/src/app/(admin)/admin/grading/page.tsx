import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireStaff } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LabAssignment, LabReport, Profile } from '@/types/db';

import { GradingCard } from './grading-card';

export const metadata = { title: 'Grading · Admin' };
export const dynamic = 'force-dynamic';

interface ReportRow extends LabReport {
  lab_assignments: LabAssignment | null;
  profiles: Pick<Profile, 'id' | 'full_name' | 'email' | 'organization'> | null;
}

export default async function GradingQueuePage() {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const { data: reports } = await supabase
    .from('lab_reports')
    .select('*, lab_assignments(*), profiles(id, full_name, email, organization)')
    .in('status', ['submitted', 'returned'])
    .order('submitted_at', { ascending: true })
    .returns<ReportRow[]>();

  return (
    <>
      <PageHeader
        eyebrow="Assessment"
        title="Grading queue"
        description="Lab reports submitted and waiting. Grade against the published rubric; the learner sees your criterion scores and notes."
      />

      {(reports ?? []).length === 0 ? (
        <EmptyState
          title="Queue is clear"
          description="No lab reports are waiting for a grader."
        />
      ) : (
        <div className="space-y-6">
          {(reports ?? []).map((report) =>
            report.lab_assignments ? (
              <GradingCard
                key={report.id}
                report={report}
                assignment={report.lab_assignments}
                learner={{
                  name: report.profiles?.full_name || report.profiles?.email || 'Unknown',
                  organization: report.profiles?.organization ?? null,
                }}
              />
            ) : (
              <Card key={report.id}>
                <p className="text-sm text-[var(--text-muted)]">
                  Report {report.id} references a missing assignment.
                </p>
              </Card>
            ),
          )}
        </div>
      )}
    </>
  );
}
