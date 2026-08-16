'use client';

import { useState, useTransition } from 'react';

import { enrollAction } from '@/lib/actions/learning';
import { Alert, Button, ButtonLink } from '@/components/ui/primitives';

export function EnrollPanel({
  courseId,
  courseSlug,
  priceCents,
  signedIn,
  accountActive,
  enrolled,
}: {
  courseId: string;
  courseSlug: string;
  priceCents: number;
  signedIn: boolean;
  accountActive: boolean;
  enrolled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (enrolled) {
    return (
      <ButtonLink href={`/learn/${courseSlug}`} size="lg" className="mt-5 w-full">
        Continue course
      </ButtonLink>
    );
  }

  if (!signedIn) {
    return (
      <div className="mt-5 space-y-2">
        <ButtonLink
          href={`/login?next=${encodeURIComponent(`/catalog/${courseSlug}`)}`}
          size="lg"
          className="w-full"
        >
          Sign in to enrol
        </ButtonLink>
        <ButtonLink href="/register" variant="secondary" size="lg" className="w-full">
          Create an account
        </ButtonLink>
      </div>
    );
  }

  if (!accountActive) {
    return (
      <div className="mt-5">
        <Alert tone="warning">
          Your account is awaiting approval. You will be able to enrol as soon as an
          administrator opens it.
        </Alert>
      </div>
    );
  }

  if (priceCents > 0) {
    return (
      <form action="/api/checkout" method="post" className="mt-5">
        <input type="hidden" name="courseId" value={courseId} />
        <Button type="submit" size="lg" className="w-full">
          Buy and enrol
        </Button>
        <p className="mt-2 text-center text-xs text-[var(--text-muted)]">
          Secure checkout via Stripe
        </p>
      </form>
    );
  }

  return (
    <div className="mt-5 space-y-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await enrollAction(courseId, courseSlug);
            if (result && !result.ok) setError(result.message ?? 'Could not enrol.');
          })
        }
      >
        {pending ? 'Enrolling…' : 'Enrol now'}
      </Button>
    </div>
  );
}
