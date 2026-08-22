import Link from 'next/link';

import { Logo } from '@/components/site-nav';
import { requireStaff } from '@/lib/auth';
import { Badge } from '@/components/ui/primitives';

const ADMIN_NAV = [
  { href: '/admin', label: 'Overview', adminOnly: false },
  { href: '/admin/analytics', label: 'Analytics', adminOnly: false },
  { href: '/admin/users', label: 'Users', adminOnly: true },
  { href: '/admin/courses', label: 'Courses', adminOnly: false },
  { href: '/admin/grading', label: 'Grading', adminOnly: false },
  { href: '/admin/kits', label: 'Hardware', adminOnly: false },
  { href: '/admin/invitations', label: 'Invitations', adminOnly: true },
  { href: '/admin/audit', label: 'Audit log', adminOnly: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  const isAdmin = ctx.profile.role === 'admin';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--warn-line)] bg-[var(--bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Logo />
            <Badge tone="warning">{isAdmin ? 'Admin' : 'Instructor'}</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard" className="text-[var(--text-muted)] hover:text-[var(--text)]">
              Back to learning
            </Link>
            <Link href="/logout" className="text-[var(--text-muted)] hover:text-[var(--text)]">
              Sign out
            </Link>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto border-t border-[var(--border)] px-4 py-2 sm:px-6">
          {ADMIN_NAV.filter((item) => isAdmin || !item.adminOnly).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
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
