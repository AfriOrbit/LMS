'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { startQuizAttemptAction } from '@/lib/actions/learning';
import { Alert, Button, Card } from '@/components/ui/primitives';

export function QuizIntro({
  quizId,
  attemptsUsed,
  maxAttempts,
  timeLimitMinutes,
}: {
  quizId: string;
  attemptsUsed: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <h2 className="text-base font-semibold">Before you start</h2>
      <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
        <li className="flex gap-2">
          <span className="text-[var(--accent)]">›</span>
          <span>
            This is attempt {attemptsUsed + 1} of {maxAttempts}. Starting it uses one
            attempt whether or not you submit.
          </span>
        </li>
        {timeLimitMinutes ? (
          <li className="flex gap-2">
            <span className="text-[var(--accent)]">›</span>
            <span>
              The clock is {timeLimitMinutes} minutes and runs on the server. Closing the
              tab does not pause it.
            </span>
          </li>
        ) : null}
        <li className="flex gap-2">
          <span className="text-[var(--accent)]">›</span>
          <span>
            Answers are graded in the database. Nothing on this page reveals a correct
            answer before you submit.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-[var(--accent)]">›</span>
          <span>Questions and options are shuffled per attempt.</span>
        </li>
      </ul>

      {error ? (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <Button
        size="lg"
        className="mt-5"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await startQuizAttemptAction(quizId);
            if (result.ok) router.refresh();
            else setError(result.message ?? 'Could not start the attempt.');
          })
        }
      >
        {pending ? 'Starting…' : 'Start attempt'}
      </Button>
    </Card>
  );
}
