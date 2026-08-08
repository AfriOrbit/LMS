'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { Markdown } from '@/components/markdown';
import { submitQuizAttemptAction } from '@/lib/actions/learning';
import { Alert, Badge, Button, Card, Input } from '@/components/ui/primitives';
import type { QuizQuestionPublic } from '@/types/db';

type Responses = Record<string, string | string[]>;

/** Deterministic shuffle so option order is stable across re-renders. */
function shuffleStable<T>(items: T[], seed: string): T[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return items
    .map((item, index) => {
      hash = (hash * 1103515245 + 12345) & 0x7fffffff;
      return { item, key: hash + index };
    })
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.item);
}

function Timer({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );

  useEffect(() => {
    const id = setInterval(() => {
      const next = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(next);
      if (next === 0) onExpire();
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const critical = remaining < 120_000;

  return (
    <div
      className={`sticky top-16 z-20 mb-6 rounded-lg border px-4 py-2.5 text-sm ${
        critical
          ? 'border-alert-500/40 bg-alert-500/10 text-alert-400'
          : 'border-[var(--border)] bg-[var(--bg-card)]'
      }`}
      role="timer"
      aria-live={critical ? 'assertive' : 'off'}
    >
      Time remaining:{' '}
      <span className="font-mono tabular-nums">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      {critical ? ' — submit now' : null}
    </div>
  );
}

export function QuizRunner({
  attemptId,
  questions,
  expiresAt,
  savedResponses,
  courseSlug,
}: {
  attemptId: string;
  questions: QuizQuestionPublic[];
  expiresAt: string | null;
  savedResponses: Responses;
  courseSlug: string;
}) {
  const router = useRouter();
  const [responses, setResponses] = useState<Responses>(savedResponses ?? {});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const answered = useMemo(
    () =>
      questions.filter((q) => {
        const value = responses[q.id];
        if (Array.isArray(value)) return value.length > 0;
        return typeof value === 'string' && value.trim().length > 0;
      }).length,
    [questions, responses],
  );

  const submit = useCallback(() => {
    startTransition(async () => {
      const result = await submitQuizAttemptAction({ attemptId, responses });
      if (result.ok) router.refresh();
      else setError(result.message ?? 'Could not submit.');
    });
  }, [attemptId, responses, router]);

  function setSingle(questionId: string, optionId: string) {
    setResponses((prev) => ({ ...prev, [questionId]: optionId }));
  }

  function toggleMulti(questionId: string, optionId: string) {
    setResponses((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      return {
        ...prev,
        [questionId]: current.includes(optionId)
          ? current.filter((v) => v !== optionId)
          : [...current, optionId],
      };
    });
  }

  return (
    <div>
      {expiresAt ? <Timer expiresAt={expiresAt} onExpire={submit} /> : null}

      {error ? (
        <div className="mb-6">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div className="space-y-5">
        {questions.map((question, index) => {
          const value = responses[question.id];
          const options = shuffleStable(question.options ?? [], `${attemptId}:${question.id}`);

          return (
            <Card key={question.id}>
              <div className="mb-3 flex items-start justify-between gap-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Question {index + 1} of {questions.length}
                </span>
                <Badge tone="neutral">
                  {question.points} {Number(question.points) === 1 ? 'point' : 'points'}
                </Badge>
              </div>

              <Markdown variant="compact">{question.prompt_md}</Markdown>

              <div className="mt-4 space-y-2">
                {question.kind === 'single_choice' || question.kind === 'true_false' ? (
                  options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                        value === option.id
                          ? 'border-ion-500 bg-ion-500/8'
                          : 'border-[var(--border)] hover:border-[var(--color-void-500)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        value={option.id}
                        checked={value === option.id}
                        onChange={() => setSingle(question.id, option.id)}
                        className="mt-0.5 accent-[var(--color-ion-500)]"
                      />
                      <span>{option.text}</span>
                    </label>
                  ))
                ) : question.kind === 'multi_choice' ? (
                  <>
                    <p className="text-xs text-[var(--text-muted)]">
                      Select all that apply. Partial credit is not awarded.
                    </p>
                    {options.map((option) => {
                      const checked =
                        Array.isArray(value) && (value as string[]).includes(option.id);
                      return (
                        <label
                          key={option.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                            checked
                              ? 'border-ion-500 bg-ion-500/8'
                              : 'border-[var(--border)] hover:border-[var(--color-void-500)]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMulti(question.id, option.id)}
                            className="mt-0.5 accent-[var(--color-ion-500)]"
                          />
                          <span>{option.text}</span>
                        </label>
                      );
                    })}
                  </>
                ) : (
                  <Input
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) =>
                      setResponses((prev) => ({ ...prev, [question.id]: e.target.value }))
                    }
                    inputMode={question.kind === 'numeric' ? 'decimal' : 'text'}
                    placeholder={
                      question.kind === 'numeric'
                        ? 'Numeric answer'
                        : 'Your answer'
                    }
                    className="max-w-xs"
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-0 mt-8 border-t border-[var(--border)] bg-[var(--bg)]/95 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-[var(--text-muted)]">
            {answered} of {questions.length} answered
          </p>

          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">
                Submit for grading? You cannot change answers afterwards.
              </span>
              <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending} onClick={submit}>
                {pending ? 'Grading…' : 'Yes, submit'}
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              disabled={pending}
              onClick={() => setConfirming(true)}
              title={
                answered < questions.length
                  ? 'Unanswered questions score zero'
                  : undefined
              }
            >
              Submit attempt
            </Button>
          )}
        </div>
        {courseSlug ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Leaving this page does not pause a timed attempt.
          </p>
        ) : null}
      </div>
    </div>
  );
}
