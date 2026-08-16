import { redirect } from 'next/navigation';

import { getSessionContext } from '@/lib/auth';
import { safeRedirectPath } from '@/lib/utils';

import { ChallengeForm } from './challenge-form';

export const metadata = { title: 'Two-factor verification' };

export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const { next } = await searchParams;
  const target = safeRedirectPath(next);

  if (ctx.aal2) redirect(target);
  if (!ctx.profile.mfa_enabled) redirect('/account/mfa');

  return (
    <div className="mx-auto max-w-md">
      <div className="border border-[var(--border)] bg-[var(--bg-card)] p-8">
        <h1 className="text-xl font-semibold tracking-tight">Verify it is you</h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          Enter the 6-digit code from your authenticator app.
        </p>
        <ChallengeForm next={target} />
      </div>
    </div>
  );
}
