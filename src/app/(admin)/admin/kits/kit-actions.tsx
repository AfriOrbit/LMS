'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { assignKitAction, returnKitAction } from '@/lib/actions/admin';
import { Button, Input, Select } from '@/components/ui/primitives';

export function KitActions({
  kitId,
  openAssignmentId,
  learners,
}: {
  kitId: string;
  openAssignmentId: string | null;
  learners: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [condition, setCondition] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  if (openAssignmentId) {
    return (
      <div className="space-y-1.5">
        <Input
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          placeholder="Return condition"
          className="w-44 py-1 text-xs"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await returnKitAction(openAssignmentId, condition);
              setMessage(result.message ?? null);
              if (result.ok) router.refresh();
            })
          }
        >
          {pending ? 'Working…' : 'Mark returned'}
        </Button>
        {message ? <p className="text-xs text-[var(--accent)]">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="w-44 py-1 text-xs"
        aria-label="Assign to"
      >
        <option value="">Assign to…</option>
        {learners.map((learner) => (
          <option key={learner.id} value={learner.id}>
            {learner.label}
          </option>
        ))}
      </Select>
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="w-44 py-1 text-xs"
        aria-label="Due back"
      />
      <Button
        size="sm"
        disabled={pending || !userId}
        onClick={() =>
          startTransition(async () => {
            const result = await assignKitAction(kitId, userId, dueDate || undefined);
            setMessage(result.message ?? null);
            if (result.ok) {
              setUserId('');
              router.refresh();
            }
          })
        }
      >
        {pending ? 'Working…' : 'Assign'}
      </Button>
      {message ? <p className="text-xs text-[var(--accent)]">{message}</p> : null}
    </div>
  );
}
