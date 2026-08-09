'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { updateProfileAction, type ActionState } from '@/lib/actions/auth';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';

const INITIAL: ActionState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}

export function ProfileForm({
  initial,
}: {
  initial: {
    fullName: string;
    organization: string;
    country: string;
    jobTitle: string;
    technicalLevel: string;
    bio: string;
  };
}) {
  const [state, action] = useActionState(updateProfileAction, INITIAL);

  return (
    <form action={action} className="mt-5 space-y-4">
      {state.message ? (
        <Alert tone={state.ok ? 'success' : 'danger'}>{state.message}</Alert>
      ) : null}

      <Field label="Full name" htmlFor="fullName" error={state.errors?.fullName} required>
        <Input id="fullName" name="fullName" defaultValue={initial.fullName} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organisation" htmlFor="organization">
          <Input id="organization" name="organization" defaultValue={initial.organization} />
        </Field>
        <Field label="Country" htmlFor="country">
          <Input id="country" name="country" defaultValue={initial.country} />
        </Field>
      </div>

      <Field label="Role or job title" htmlFor="jobTitle">
        <Input id="jobTitle" name="jobTitle" defaultValue={initial.jobTitle} />
      </Field>

      <Field label="Technical background" htmlFor="technicalLevel">
        <Select
          id="technicalLevel"
          name="technicalLevel"
          defaultValue={initial.technicalLevel}
        >
          <option value="foundation">Foundation</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </Select>
      </Field>

      <Field label="Short bio" htmlFor="bio" hint="Visible to instructors in your cohort.">
        <Textarea id="bio" name="bio" defaultValue={initial.bio} rows={4} />
      </Field>

      <SaveButton />
    </form>
  );
}
