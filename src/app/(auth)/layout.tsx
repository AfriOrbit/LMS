import Link from 'next/link';

import { Logo } from '@/components/site-nav';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="starfield flex min-h-dvh flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <Link
            href="/catalog"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            Browse courses
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="border-t border-[var(--border)] px-4 py-5 text-center text-xs text-[var(--text-muted)]">
        Protected by two-factor authentication. Never share your codes with anyone,
        including AfriOrbit staff.
      </footer>
    </div>
  );
}
