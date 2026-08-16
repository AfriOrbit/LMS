'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  resetUserMfaAction,
  setAccountStatusAction,
  setUserRoleAction,
} from '@/lib/actions/admin';
import { Badge, Button, Select } from '@/components/ui/primitives';
import { formatDate } from '@/lib/utils';
import type { AppRole, Profile } from '@/types/db';

const STATUS_TONE = {
  active: 'success',
  pending: 'warning',
  suspended: 'danger',
  rejected: 'danger',
} as const;

export function UserRow({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await fn();
      setMessage(result.message ?? null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <tr className="border-b border-[var(--border)] align-top last:border-0">
      <td className="px-4 py-3">
        <p className="font-medium">{profile.full_name || '—'}</p>
        <p className="text-xs text-[var(--text-muted)]">{profile.email}</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Joined {formatDate(profile.created_at)}
        </p>
        {message ? <p className="mt-1 text-xs text-[var(--accent)]">{message}</p> : null}
      </td>

      <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
        {profile.organization ?? '—'}
        {profile.country ? <br /> : null}
        {profile.country ?? ''}
      </td>

      <td className="px-4 py-3">
        <Select
          value={profile.role}
          disabled={pending}
          onChange={(e) =>
            run(() => setUserRoleAction(profile.id, e.target.value as AppRole))
          }
          className="w-32 py-1 text-xs"
          aria-label={`Role for ${profile.email}`}
        >
          <option value="learner">learner</option>
          <option value="instructor">instructor</option>
          <option value="admin">admin</option>
        </Select>
      </td>

      <td className="px-4 py-3">
        <Badge tone={STATUS_TONE[profile.status]}>{profile.status}</Badge>
      </td>

      <td className="px-4 py-3">
        <Badge tone={profile.mfa_enabled ? 'success' : 'danger'}>
          {profile.mfa_enabled ? 'on' : 'off'}
        </Badge>
        {profile.mfa_enabled ? (
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            {profile.recovery_codes.length} codes left
          </p>
        ) : null}
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {profile.status !== 'active' ? (
            <Button
              size="sm"
              variant="success"
              disabled={pending}
              onClick={() => run(() => setAccountStatusAction(profile.id, 'active'))}
            >
              Approve
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => setAccountStatusAction(profile.id, 'suspended'))}
            >
              Suspend
            </Button>
          )}

          {profile.status === 'pending' ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => setAccountStatusAction(profile.id, 'rejected'))}
            >
              Reject
            </Button>
          ) : null}

          {profile.mfa_enabled ? (
            confirmingReset ? (
              <>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    setConfirmingReset(false);
                    run(() => resetUserMfaAction(profile.id));
                  }}
                >
                  Confirm reset
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmingReset(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirmingReset(true)}
                title="Clears the user's authenticator. Verify their identity out of band first."
              >
                Reset 2FA
              </Button>
            )
          ) : null}
        </div>
      </td>
    </tr>
  );
}
