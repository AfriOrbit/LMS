import Link from 'next/link';

import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="border border-[var(--border)] bg-[var(--bg-card)] p-8">
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">
        Continue to the AfriOrbit learning platform.
      </p>

      <LoginForm next={next} />

      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        No account yet?{' '}
        <Link href="/register" className="text-[var(--accent)] hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}
