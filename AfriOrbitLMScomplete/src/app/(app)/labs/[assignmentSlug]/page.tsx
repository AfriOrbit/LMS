import { notFound } from 'next/navigation';

import { Markdown } from '@/components/markdown';
import { Badge, Card, PageHeader } from '@/components/ui/primitives';
import { requireActiveMember } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import type { HardwareKit, LabAssignment, LabReport } from '@/types/db';

import { LabReportForm } from './lab-report-form';

export const dynamic = 'force-dynamic';

interface KitRow {
  hardware_kits: HardwareKit | null;
}

export default async function LabAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentSlug: string }>;
}) {
  const { assignmentSlug } = await params;
  const ctx = await requireActiveMember();
  const supabase = await createSupabaseServerClient();

  const { data: assignment } = await supabase
    .from('lab_assignments')
    .select('*')
    .eq('slug', assignmentSlug)
    .maybeSingle<LabAssignment>();

  if (!assignment) notFound();

  const [{ data: report }, { data: kitRows }] = await Promise.all([
    supabase
      .from('lab_reports')
      .select('*')
      .eq('assignment_id', assignment.id)
      .eq('user_id', ctx.userId)
      .maybeSingle<LabReport>(),
    supabase
      .from('kit_assignments')
      .select('hardware_kits(*)')
      .eq('user_id', ctx.userId)
      .is('returned_at', null)
      .returns<KitRow[]>(),
  ]);

  const kits = (kitRows ?? [])
    .map((row) => row.hardware_kits)
    .filter((k): k is HardwareKit => Boolean(k));

  const locked = report?.status === 'submitted' || report?.status === 'graded';

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Lab report"
        title={assignment.title}
        description={`${assignment.max_points} points · pass at ${assignment.pass_threshold}%`}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-8">
          <Card>
            <Markdown variant="compact">{assignment.brief_md}</Markdown>
          </Card>

          {report?.status === 'graded' ? (
            <Card
              className={
                report.passed
                  ? 'border-signal-500/35 bg-signal-500/5'
                  : 'border-alert-500/35 bg-alert-500/5'
              }
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold">
                  Graded: {report.points_awarded}/{assignment.max_points}
                </h2>
                <Badge tone={report.passed ? 'success' : 'danger'}>
                  {report.passed ? 'Passed' : 'Not passed'}
                </Badge>
              </div>

              {report.rubric_scores.length > 0 ? (
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="pb-2 font-medium">Criterion</th>
                      <th className="pb-2 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rubric_scores.map((row) => (
                      <tr key={row.criterion} className="border-b border-[var(--border)]">
                        <td className="py-2">
                          {row.criterion}
                          {row.note ? (
                            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                              {row.note}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {row.score}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {report.feedback_md ? (
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <h3 className="mb-2 text-sm font-semibold">Instructor feedback</h3>
                  <Markdown variant="compact">{report.feedback_md}</Markdown>
                </div>
              ) : null}
            </Card>
          ) : null}

          <LabReportForm
            assignmentId={assignment.id}
            dataSchema={assignment.data_schema}
            kits={kits.map((k) => ({ id: k.id, assetTag: k.asset_tag }))}
            initial={{
              narrative: report?.narrative_md ?? '',
              data: report?.data ?? {},
              kitId: report?.kit_id ?? null,
            }}
            locked={locked}
            status={report?.status ?? 'draft'}
          />
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="text-sm font-semibold">Rubric</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {assignment.rubric.map((criterion) => (
                <li key={criterion.criterion}>
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{criterion.criterion}</span>
                    <span className="shrink-0 font-mono text-[var(--text-muted)]">
                      {criterion.weight}%
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {criterion.descriptor}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          {report ? (
            <Card>
              <h2 className="text-sm font-semibold">Submission</h2>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Status</dt>
                  <dd>{report.status}</dd>
                </div>
                {report.submitted_at ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">Submitted</dt>
                    <dd>{formatDate(report.submitted_at)}</dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
