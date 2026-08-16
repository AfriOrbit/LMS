'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { bookLabSessionAction } from '@/lib/actions/learning';
import { Badge, Button } from '@/components/ui/primitives';

export function BookSessionButton({
  sessionId,
  booked,
  meetingUrl,
}: {
  sessionId: string;
  booked: boolean;
  meetingUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (booked) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Badge tone="success">Booked</Badge>
        {meetingUrl ? (
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Join link
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await bookLabSessionAction(sessionId);
            if (result.ok) router.refresh();
            else setError(result.message ?? 'Could not book.');
          })
        }
      >
        {pending ? 'Booking…' : 'Book a seat'}
      </Button>
      {error ? <p className="text-xs text-[var(--bad)]">{error}</p> : null}
    </div>
  );
}
