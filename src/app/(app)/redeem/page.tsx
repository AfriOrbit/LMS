'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { redeemInvitationAction, type ActionState } from '@/lib/actions/auth';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Field,
  Input,
  PageHeader,
} from '@/components/ui/primitives';

const INITIAL: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Checking…' : 'Redeem code'}
    </Button>
  );
}

export default function RedeemPage() {
  const [state, action] = useActionState(redeemInvitationAction, INITIAL);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        eyebrow="Invitations"
        title="Redeem an invitation code"
        description="Partner institutions and cohort leads issue codes that approve your account and enrol you in one step."
      />

      <Card>
        <form action={action} className="space-y-4">
          {state.message ? (
            <Alert tone={state.ok ? 'success' : 'danger'}>{state.message}</Alert>
          ) : null}

          <Field label="Invitation code" htmlFor="code" error={state.errors?.code} required>
            <Input
              id="code"
              name="code"
              required
              autoFocus
              autoComplete="off"
              className="font-mono uppercase tracking-wider"
            />
          </Field>

          <div className="flex items-center gap-2">
            <SubmitButton />
            {state.ok ? (
              <ButtonLink href="/dashboard" variant="secondary">
                Go to dashboard
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </Card>
    </div>
  );
}
