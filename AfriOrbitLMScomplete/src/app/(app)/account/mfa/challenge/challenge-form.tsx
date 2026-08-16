'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  useRecoveryCodeAction,
  verifyMfaChallengeAction,
  type ActionState,
} from '@/lib/actions/auth';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';

const INITIAL: ActionState = {};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Checking…' : label}
    </Button>
  );
}

export function ChallengeForm({ next }: { next: string }) {
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [state, action] = useActionState(verifyMfaChallengeAction, INITIAL);
  const [recoveryState, recoveryAction] = useActionState(useRecoveryCodeAction, INITIAL);

  if (mode === 'recovery') {
    return (
      <>
        <form action={recoveryAction} className="mt-6 space-y-4">
          {recoveryState.message ? (
            <Alert tone="danger">{recoveryState.message}</Alert>
          ) : null}

          <Alert tone="warning">
            Using a recovery code removes your current authenticator. You will be asked to
            enrol a new one immediately.
          </Alert>

          <Field
            label="Recovery code"
            htmlFor="recoveryCode"
            error={recoveryState.errors?.recoveryCode}
            required
          >
            <Input
              id="recoveryCode"
              name="recoveryCode"
              autoComplete="off"
              placeholder="XXXXX-XXXXX"
              required
              autoFocus
              className="text-center font-mono tracking-[0.2em] uppercase"
            />
          </Field>

          <Submit label="Use recovery code" />
        </form>

        <p className="mt-5 text-center text-sm">
          <button
            type="button"
            onClick={() => setMode('totp')}
            className="text-[var(--text-muted)] hover:underline"
          >
            Back to authenticator code
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <form action={action} className="mt-6 space-y-4">
        {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <input type="hidden" name="next" value={next} />

        <Field label="Authentication code" htmlFor="code" error={state.errors?.code} required>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            className="text-center font-mono text-xl tracking-[0.5em]"
          />
        </Field>

        <Submit label="Verify" />
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        <button
          type="button"
          onClick={() => setMode('recovery')}
          className="text-ion-300 hover:underline"
        >
          Lost your device? Use a recovery code
        </button>
        <p>
          <Link href="/logout" className="text-[var(--text-muted)] hover:underline">
            Sign out
          </Link>
        </p>
      </div>
    </>
  );
}
