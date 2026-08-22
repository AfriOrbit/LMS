'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { saveLabReportAction } from '@/lib/actions/learning';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import type { DataField } from '@/types/db';

export function LabReportForm({
  assignmentId,
  dataSchema,
  kits,
  initial,
  locked,
  status,
}: {
  assignmentId: string;
  dataSchema: DataField[];
  kits: { id: string; assetTag: string }[];
  initial: {
    narrative: string;
    data: Record<string, string | number>;
    kitId: string | null;
  };
  locked: boolean;
  status: string;
}) {
  const router = useRouter();
  const [narrative, setNarrative] = useState(initial.narrative);
  const [data, setData] = useState<Record<string, string | number>>(initial.data);
  const [kitId, setKitId] = useState(initial.kitId ?? '');
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  function save(submit: boolean) {
    startTransition(async () => {
      const result = await saveLabReportAction({
        assignmentId,
        narrative,
        data,
        kitId: kitId || null,
        submit,
      });
      setFeedback({
        tone: result.ok ? 'success' : 'danger',
        text: result.message ?? (result.ok ? 'Saved.' : 'Could not save.'),
      });
      if (result.ok) router.refresh();
      setConfirmSubmit(false);
    });
  }

  if (locked) {
    return (
      <Card>
        <h2 className="text-base font-semibold">Your submission</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          This report is {status} and can no longer be edited.
        </p>

        {dataSchema.length > 0 ? (
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            {dataSchema.map((field) => (
              <div key={field.key} className="flex justify-between gap-3 text-sm">
                <dt className="text-[var(--text-muted)]">{field.label}</dt>
                <dd className="font-mono">{String(data[field.key] ?? '—')}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <pre className="mt-4 whitespace-pre-wrap border border-[var(--border)] bg-[var(--bg)] p-4 text-sm">
          {narrative || '(no narrative)'}
        </pre>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-base font-semibold">Your report</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Save a draft as often as you like. Submitting locks the report for grading.
      </p>

      {feedback ? (
        <div className="mt-4">
          <Alert tone={feedback.tone}>{feedback.text}</Alert>
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {kits.length > 0 ? (
          <Field label="Kit used" htmlFor="kit">
            <Select id="kit" value={kitId} onChange={(e) => setKitId(e.target.value)}>
              <option value="">Digital twin (no hardware)</option>
              {kits.map((kit) => (
                <option key={kit.id} value={kit.id}>
                  {kit.assetTag}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {dataSchema.length > 0 ? (
          <fieldset>
            <legend className="mb-3 text-sm font-semibold">Measured values</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {dataSchema.map((field) => (
                <Field key={field.key} label={field.label} htmlFor={`data-${field.key}`}>
                  <Input
                    id={`data-${field.key}`}
                    type={field.type === 'number' ? 'number' : 'text'}
                    step="any"
                    value={data[field.key] ?? ''}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        [field.key]:
                          field.type === 'number'
                            ? e.target.value === ''
                              ? ''
                              : Number(e.target.value)
                            : e.target.value,
                      }))
                    }
                    className="tabular-nums"
                  />
                </Field>
              ))}
            </div>
          </fieldset>
        ) : null}

        <Field
          label="Narrative"
          htmlFor="narrative"
          hint="Markdown supported. Tables and LaTeX maths render in the grader's view."
        >
          <Textarea
            id="narrative"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={16}
            className="font-mono text-sm"
          />
        </Field>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => save(false)}>
          {pending ? 'Saving…' : 'Save draft'}
        </Button>

        {confirmSubmit ? (
          <>
            <span className="text-sm text-[var(--text-muted)]">
              Submit for grading? You cannot edit afterwards.
            </span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmSubmit(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending} onClick={() => save(true)}>
              Yes, submit
            </Button>
          </>
        ) : (
          <Button disabled={pending} onClick={() => setConfirmSubmit(true)}>
            Submit for grading
          </Button>
        )}
      </div>
    </Card>
  );
}
