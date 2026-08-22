'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { requestPasswordResetAction, type ActionState } from '@/lib/actions/auth';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';

const INITIAL: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Sending…' : 'Send reset link'}
    </Button>
  );
}

export default function ResetPasswordPage() {
  const [state, action] = useActionState(requestPasswordResetAction, INITIAL);

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-card)] p-8">
      <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">
        Enter your email and we will send a link. Two-factor authentication still applies
        after you reset.
      </p>

      <form action={action} className="mt-6 space-y-4">
        {state.message ? (
          <Alert tone={state.ok ? 'success' : 'danger'}>{state.message}</Alert>
        ) : null}

        <Field label="Email" htmlFor="email" error={state.errors?.email} required>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </Field>

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-[var(--text-muted)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
