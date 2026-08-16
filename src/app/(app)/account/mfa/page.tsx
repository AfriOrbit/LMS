import { redirect } from 'next/navigation';

import { getSessionContext } from '@/lib/auth';
import { serverEnv } from '@/lib/env';
import { Alert } from '@/components/ui/primitives';

import { MfaEnrollment } from './mfa-enrollment';

export const metadata = { title: 'Two-factor authentication' };

export default async function MfaSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; recovered?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const { next, recovered } = await searchParams;

  const mandatory =
    serverEnv.mfaPolicy === 'all' ||
    ctx.profile.role === 'admin' ||
    ctx.profile.role === 'instructor';

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
          Account security
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Two-factor authentication
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          {ctx.profile.mfa_enabled
            ? 'Your account is protected by an authenticator app.'
            : mandatory
              ? 'Every AfriOrbit learning account is protected by a second factor. Set it up now — it takes about a minute.'
              : 'Strongly recommended. Required for instructor and administrator accounts.'}
        </p>
      </header>

      {recovered ? (
        <div className="mb-6">
          <Alert tone="warning" title="Recovery code used">
            Your previous authenticator was removed. Enrol a new one now to restore
            two-factor protection on this account.
          </Alert>
        </div>
      ) : null}

      <MfaEnrollment
        alreadyEnrolled={ctx.profile.mfa_enabled}
        mandatory={mandatory}
        next={next ?? '/dashboard'}
      />
    </div>
  );
}
