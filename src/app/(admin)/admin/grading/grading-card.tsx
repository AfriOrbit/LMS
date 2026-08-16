'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Markdown } from '@/components/markdown';
import { gradeLabReportAction } from '@/lib/actions/admin';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Textarea,
} from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/utils';
import type { LabAssignment, LabReport } from '@/types/db';

export function GradingCard({
  report,
  assignment,
  learner,
}: {
  report: LabReport;
  assignment: LabAssignment;
  learner: { name: string; organization: string | null };
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(assignment.rubric.map((c) => [c.criterion, 0])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );
  const [expanded, setExpanded] = useState(false);

  // Weighted total: each criterion is scored 0–100 and weighted by its share.
  const points = useMemo(() => {
    const weighted = assignment.rubric.reduce(
      (sum, c) => sum + ((scores[c.criterion] ?? 0) * c.weight) / 100,
      0,
    );
    return Math.round((weighted / 100) * assignment.max_points * 100) / 100;
  }, [scores, assignment]);

  const percent = assignment.max_points > 0 ? (points / assignment.max_points) * 100 : 0;
  const passed = percent >= assignment.pass_threshold;

  function submit(returnForRevision: boolean) {
    startTransition(async () => {
      const res = await gradeLabReportAction({
        reportId: report.id,
        pointsAwarded: points,
        rubricScores: assignment.rubric.map((c) => ({
          criterion: c.criterion,
          score: scores[c.criterion] ?? 0,
          note: notes[c.criterion] || undefined,
        })),
        feedback,
        passed,
        returnForRevision,
      });
      setResult({
        tone: res.ok ? 'success' : 'danger',
        text: res.message ?? (res.ok ? 'Saved.' : 'Could not save.'),
      });
      if (res.ok) router.refresh();
    });
  }

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">{assignment.title}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {learner.name}
            {learner.organization ? ` · ${learner.organization}` : ''}
            {report.submitted_at
              ? ` · submitted ${formatDateTime(report.submitted_at)}`
              : ''}
          </p>
        </div>
        <Badge tone={report.status === 'returned' ? 'warning' : 'info'}>
          {report.status}
        </Badge>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold">Submitted data</h3>
          {assignment.data_schema.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {assignment.data_schema.map((field) => (
                  <tr key={field.key} className="border-b border-[var(--border)]">
                    <td className="py-1.5 pr-3 text-[var(--text-muted)]">{field.label}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {String(report.data?.[field.key] ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No structured fields.</p>
          )}

          <h3 className="mb-2 mt-5 text-sm font-semibold">Narrative</h3>
          <div
            className={
              expanded
                ? 'border border-[var(--border)] p-4'
                : 'max-h-64 overflow-hidden border border-[var(--border)] p-4'
            }
          >
            <Markdown variant="compact">
              {report.narrative_md || '_No narrative submitted._'}
            </Markdown>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs text-[var(--accent)] hover:underline"
          >
            {expanded ? 'Collapse' : 'Expand full narrative'}
          </button>
        </div>

        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-semibold">Rubric</h3>
          <div className="space-y-4">
            {assignment.rubric.map((criterion) => (
              <div key={criterion.criterion}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <label
                    htmlFor={`${report.id}-${criterion.criterion}`}
                    className="text-sm font-medium"
                  >
                    {criterion.criterion}
                  </label>
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    weight {criterion.weight}%
                  </span>
                </div>
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  {criterion.descriptor}
                </p>
                <div className="flex items-center gap-3">
                  <input
                    id={`${report.id}-${criterion.criterion}`}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={scores[criterion.criterion] ?? 0}
                    onChange={(e) =>
                      setScores((prev) => ({
                        ...prev,
                        [criterion.criterion]: Number(e.target.value),
                      }))
                    }
                    className="flex-1 accent-[var(--color-ion-500)]"
                  />
                  <span className="w-10 text-right font-mono text-sm tabular-nums">
                    {scores[criterion.criterion] ?? 0}
                  </span>
                </div>
                <Input
                  value={notes[criterion.criterion] ?? ''}
                  onChange={(e) =>
                    setNotes((prev) => ({
                      ...prev,
                      [criterion.criterion]: e.target.value,
                    }))
                  }
                  placeholder="Optional note shown to the learner"
                  className="mt-2 text-xs"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Weighted total</span>
              <span className="font-mono text-lg tabular-nums">
                {points} / {assignment.max_points}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">
                Pass at {assignment.pass_threshold}%
              </span>
              <Badge tone={passed ? 'success' : 'danger'}>
                {percent.toFixed(0)}% · {passed ? 'pass' : 'fail'}
              </Badge>
            </div>
          </div>

          <div className="mt-4">
            <Field label="Overall feedback" htmlFor={`${report.id}-feedback`}>
              <Textarea
                id={`${report.id}-feedback`}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={5}
                placeholder="Markdown supported."
              />
            </Field>
          </div>

          {result ? (
            <div className="mt-4">
              <Alert tone={result.tone}>{result.text}</Alert>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => submit(false)}>
              {pending ? 'Saving…' : 'Record grade'}
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => submit(true)}
              title="Send back to the learner for revision without finalising a grade"
            >
              Return for revision
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
