import Link from 'next/link';

import { publicEnv } from '@/lib/env';

export const metadata = { title: 'Confirm your email' };

export default function VerifyEmailPage() {
  return (
    <div className="border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-bg)] text-2xl">
        ✉
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Check your inbox</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
        We have sent a confirmation link. Open it to activate your sign-in, then you will be
        taken straight to two-factor setup.
      </p>
      <p className="mt-4 text-sm text-[var(--text-muted)]">
        Nothing after a few minutes? Check spam, and confirm your organisation&rsquo;s mail
        filter allows messages from us. Still stuck —{' '}
        <a href={`mailto:${publicEnv.supportEmail}`} className="text-[var(--accent)] hover:underline">
          {publicEnv.supportEmail}
        </a>
        .
      </p>
      <Link
        href="/login"
        className="mt-7 inline-block text-sm text-[var(--accent)] hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}
