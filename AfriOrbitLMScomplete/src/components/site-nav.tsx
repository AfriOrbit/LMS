import Link from 'next/link';

import { getSessionContext } from '@/lib/auth';
import { publicEnv } from '@/lib/env';
import { ButtonLink } from '@/components/ui/primitives';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <circle cx="16" cy="16" r="6.5" fill="var(--color-ion-500)" />
        <ellipse
          cx="16"
          cy="16"
          rx="14"
          ry="5.5"
          fill="none"
          stroke="var(--color-ember-500)"
          strokeWidth="1.6"
          transform="rotate(-28 16 16)"
        />
        <circle cx="27" cy="10.2" r="2.1" fill="var(--color-ember-400)" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">
        AfriOrbit <span className="text-[var(--text-muted)] font-normal">Learning</span>
      </span>
    </Link>
  );
}

const PUBLIC_LINKS = [
  { href: '/catalog', label: 'Courses' },
  { href: '/cohorts', label: 'Cohorts' },
  { href: '/verify', label: 'Verify a certificate' },
];

export async function SiteNav() {
  const ctx = await getSessionContext();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <div className="hidden items-center gap-6 md:flex">
            {PUBLIC_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ctx ? (
            <>
              <span className="hidden text-sm text-[var(--text-muted)] sm:inline">
                {ctx.profile.full_name || ctx.email}
              </span>
              <ButtonLink href="/dashboard" size="sm" variant="secondary">
                Dashboard
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink href="/login" size="sm" variant="ghost">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                Create account
              </ButtonLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--border)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-[var(--text-muted)] sm:px-6">
        <p>
          © {new Date().getFullYear()} {publicEnv.brandName}. Training platform for the
          EduSat programme.
        </p>
        <div className="flex flex-wrap gap-5">
          <a
            href="https://www.afriorbit.space/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--text)]"
          >
            afriorbit.space
          </a>
          <Link href="/verify" className="hover:text-[var(--text)]">
            Verify a certificate
          </Link>
          <a href={`mailto:${publicEnv.supportEmail}`} className="hover:text-[var(--text)]">
            {publicEnv.supportEmail}
          </a>
        </div>
      </div>
    </footer>
  );
}
