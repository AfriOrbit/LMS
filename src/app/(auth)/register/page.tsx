import Link from 'next/link';

import { RegisterForm } from './register-form';

export const metadata = { title: 'Create an account' };

export default function RegisterPage() {
  const approvalRequired = process.env.REGISTRATION_MODE !== 'open';

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-card)] p-8">
      <h1 className="text-xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">
        {approvalRequired
          ? 'Registration has three steps: confirm your email, set up two-factor authentication, then wait for an AfriOrbit administrator to approve your account.'
          : 'Confirm your email and set up two-factor authentication to get started.'}
      </p>

      <RegisterForm />

      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        Already registered?{' '}
        <Link href="/login" className="text-[var(--accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
