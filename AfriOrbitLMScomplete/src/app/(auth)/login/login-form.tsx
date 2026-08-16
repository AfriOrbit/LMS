'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { loginAction, type ActionState } from '@/lib/actions/auth';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';

const INITIAL: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, INITIAL);

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <input type="hidden" name="next" value={next ?? ''} />

      <Field label="Email" htmlFor="email" error={state.errors?.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="you@organisation.org"
        />
      </Field>

      <Field label="Password" htmlFor="password" error={state.errors?.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <SubmitButton />

      <p className="text-center text-sm">
        <Link href="/reset-password" className="text-[var(--text-muted)] hover:underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
