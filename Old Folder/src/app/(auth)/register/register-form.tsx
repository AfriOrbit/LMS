'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { registerAction, type ActionState } from '@/lib/actions/auth';
import { Alert, Button, Field, Input, Select } from '@/components/ui/primitives';

const INITIAL: ActionState = {};

const RULES = [
  { label: 'At least 12 characters', test: (v: string) => v.length >= 12 },
  { label: 'Upper and lower case', test: (v: string) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: 'A digit', test: (v: string) => /[0-9]/.test(v) },
  { label: 'A symbol', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Creating account…' : 'Create account'}
    </Button>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, INITIAL);
  const [password, setPassword] = useState('');

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.message ? (
        <Alert tone={state.ok ? 'success' : 'danger'}>{state.message}</Alert>
      ) : null}

      <Field label="Full name" htmlFor="fullName" error={state.errors?.fullName} required>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </Field>

      <Field label="Email" htmlFor="email" error={state.errors?.email} required>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={state.errors?.password}
        required
        hint={
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {RULES.map((rule) => (
              <span
                key={rule.label}
                className={rule.test(password) ? 'text-signal-400' : undefined}
              >
                {rule.test(password) ? '✓' : '•'} {rule.label}
              </span>
            ))}
          </span>
        }
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organisation" htmlFor="organization" error={state.errors?.organization}>
          <Input id="organization" name="organization" autoComplete="organization" />
        </Field>
        <Field label="Country" htmlFor="country" error={state.errors?.country}>
          <Input id="country" name="country" autoComplete="country-name" />
        </Field>
      </div>

      <Field label="Role or job title" htmlFor="jobTitle" error={state.errors?.jobTitle}>
        <Input id="jobTitle" name="jobTitle" placeholder="e.g. RF engineer, MSc student" />
      </Field>

      <Field
        label="Technical background"
        htmlFor="technicalLevel"
        hint="Used to recommend a starting point. It never restricts what you can enrol in."
      >
        <Select id="technicalLevel" name="technicalLevel" defaultValue="intermediate">
          <option value="foundation">Foundation — new to space systems</option>
          <option value="intermediate">Intermediate — engineering background</option>
          <option value="advanced">Advanced — have flown or built hardware</option>
        </Select>
      </Field>

      <Field
        label="Invitation code"
        htmlFor="inviteCode"
        hint="Optional. Partner and cohort codes skip the approval queue."
      >
        <Input id="inviteCode" name="inviteCode" placeholder="Optional" />
      </Field>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="acceptTerms"
          required
          className="mt-0.5 h-4 w-4 rounded border-[var(--border)] bg-[var(--bg-elevated)] accent-[var(--color-ion-500)]"
        />
        <span className="text-[var(--text-muted)]">
          I accept the{' '}
          <Link href="/terms" className="text-ion-300 hover:underline">
            terms of use
          </Link>{' '}
          and understand that hardware issued to me remains AfriOrbit property.
        </span>
      </label>
      {state.errors?.acceptTerms ? (
        <p className="text-xs text-alert-400">{state.errors.acceptTerms}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
