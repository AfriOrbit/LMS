import Link from 'next/link';

import { Logo } from '@/components/site-nav';
import { requireUser } from '@/lib/auth';
import { Badge } from '@/components/ui/primitives';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/catalog', label: 'Catalogue' },
  { href: '/labs', label: 'Labs' },
  { href: '/certificates', label: 'Certificates' },
  { href: '/account', label: 'Account' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const isStaff = ctx.profile.role === 'admin' || ctx.profile.role === 'instructor';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-1 lg:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-void-800 hover:text-[var(--text)]"
                >
                  {item.label}
                </Link>
              ))}
              {isStaff ? (
                <Link
                  href="/admin"
                  className="rounded-lg px-3 py-1.5 text-sm text-ember-400 transition-colors hover:bg-void-800"
                >
                  Admin
                </Link>
              ) : null}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {ctx.profile.status !== 'active' ? (
              <Badge tone="warning">Pending approval</Badge>
            ) : null}
            {!ctx.profile.mfa_enabled ? (
              <Link href="/account/mfa">
                <Badge tone="danger">2FA off</Badge>
              </Link>
            ) : null}
            <span className="hidden text-sm text-[var(--text-muted)] sm:inline">
              {ctx.profile.full_name || ctx.email}
            </span>
            <Link
              href="/logout"
              className="rounded-lg px-2.5 py-1.5 text-sm text-[var(--text-muted)] hover:bg-void-800 hover:text-[var(--text)]"
            >
              Sign out
            </Link>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--border)] px-4 py-2 lg:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
        {children}
      </main>
    </div>
  );
}
