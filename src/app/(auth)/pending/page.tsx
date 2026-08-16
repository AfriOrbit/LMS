import Link from 'next/link';

import { getSessionContext } from '@/lib/auth';
import { publicEnv } from '@/lib/env';
import { Alert, ButtonLink } from '@/components/ui/primitives';

export const metadata = { title: 'Account pending approval' };

const COPY: Record<string, { title: string; body: string; tone: 'info' | 'danger' }> = {
  pending: {
    title: 'Waiting for approval',
    body: 'Your email is confirmed and two-factor authentication is set up. An AfriOrbit administrator now reviews your registration — usually within one working day. You will receive an email when your account is opened.',
    tone: 'info',
  },
  suspended: {
    title: 'Account suspended',
    body: 'Access to course content is paused on this account. Contact the programme team if you believe this is an error.',
    tone: 'danger',
  },
  rejected: {
    title: 'Registration not approved',
    body: 'This registration was not approved. If you registered with the wrong details or on behalf of a partner institution, get in touch and we will sort it out.',
    tone: 'danger',
  },
};

export default async function PendingPage() {
  const ctx = await getSessionContext();
  const status = ctx?.profile.status ?? 'pending';

  if (ctx?.profile.status === 'active') {
    return (
      <div className="border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
        <h1 className="text-xl font-semibold">You are all set</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Your account is active.
        </p>
        <ButtonLink href="/dashboard" className="mt-6">
          Go to dashboard
        </ButtonLink>
      </div>
    );
  }

  const copy = COPY[status] ?? COPY.pending;

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-card)] p-8">
      <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
      <div className="mt-4">
        <Alert tone={copy.tone}>{copy.body}</Alert>
      </div>

      <div className="mt-6 space-y-3 text-sm text-[var(--text-muted)]">
        <p>
          Have an invitation code from a partner institution or a cohort lead? Redeeming it
          approves your account immediately.
        </p>
        <ButtonLink href="/redeem" variant="secondary" size="sm">
          Redeem an invitation code
        </ButtonLink>
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-5 text-sm">
        <a href={`mailto:${publicEnv.supportEmail}`} className="text-[var(--accent)] hover:underline">
          Contact the programme team
        </a>
        <Link href="/logout" className="text-[var(--text-muted)] hover:underline">
          Sign out
        </Link>
      </div>
    </div>
  );
}
