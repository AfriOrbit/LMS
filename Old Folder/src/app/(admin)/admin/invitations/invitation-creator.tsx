'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createInvitationAction } from '@/lib/actions/admin';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
} from '@/components/ui/primitives';

export function InvitationCreator({
  courses,
  cohorts,
}: {
  courses: { id: string; title: string }[];
  cohorts: { id: string; name: string; courseId: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [courseId, setCourseId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [email, setEmail] = useState('');
  const [grantsRole, setGrantsRole] = useState<'learner' | 'instructor'>('learner');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const relevantCohorts = courseId
    ? cohorts.filter((c) => c.courseId === courseId)
    : cohorts;

  return (
    <Card>
      <h2 className="text-base font-semibold">Create an invitation</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Use a bound email for a single named recipient, or leave it blank and set a
        higher use count for a partner institution.
      </p>

      {issued ? (
        <div className="mt-4">
          <Alert tone="success" title="Code created — copy it now">
            <p className="mt-1 font-mono text-lg tracking-wider">{issued}</p>
            <p className="mt-2 text-xs">
              This is the only time it will be shown. Only a SHA-256 hash is stored, so it
              cannot be recovered from the database.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(issued)}
              >
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
                Create another
              </Button>
            </div>
          </Alert>
        </div>
      ) : (
        <>
          {error ? (
            <div className="mt-4">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Bind to email"
              htmlFor="invite-email"
              hint="Optional. The code then only works for that address."
            >
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="engineer@partner.org"
              />
            </Field>

            <Field label="Enrol in course" htmlFor="invite-course">
              <Select
                id="invite-course"
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setCohortId('');
                }}
              >
                <option value="">No course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Cohort" htmlFor="invite-cohort">
              <Select
                id="invite-cohort"
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                disabled={relevantCohorts.length === 0}
              >
                <option value="">No cohort</option>
                {relevantCohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {cohort.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Grants role"
              htmlFor="invite-role"
              hint="An invitation can never grant admin."
            >
              <Select
                id="invite-role"
                value={grantsRole}
                onChange={(e) => setGrantsRole(e.target.value as 'learner' | 'instructor')}
              >
                <option value="learner">learner</option>
                <option value="instructor">instructor</option>
              </Select>
            </Field>

            <Field label="Maximum uses" htmlFor="invite-uses">
              <Input
                id="invite-uses"
                type="number"
                min={1}
                max={500}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
              />
            </Field>

            <Field label="Expires in (days)" htmlFor="invite-expiry">
              <Input
                id="invite-expiry"
                type="number"
                min={1}
                max={365}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value) || 30)}
              />
            </Field>
          </div>

          <Button
            className="mt-5"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await createInvitationAction({
                  email: email || undefined,
                  courseId: courseId || null,
                  cohortId: cohortId || null,
                  grantsRole,
                  maxUses,
                  expiresInDays,
                });
                if (result.ok && result.data) {
                  setIssued(result.data.code);
                  router.refresh();
                } else {
                  setError(result.message ?? 'Could not create the invitation.');
                }
              })
            }
          >
            {pending ? 'Creating…' : 'Create invitation'}
          </Button>
        </>
      )}
    </Card>
  );
}
