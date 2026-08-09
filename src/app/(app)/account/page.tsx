import Link from 'next/link';

import { Badge, ButtonLink, Card, PageHeader } from '@/components/ui/primitives';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/utils';

import { ProfileForm } from './profile-form';

export const metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const ctx = await requireUser();
  const { profile } = ctx;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Your account"
        description="Profile details, security, and account status."
      />

      <Card className="mb-6">
        <h2 className="text-base font-semibold">Security</h2>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Two-factor authentication</dt>
            <dd className="flex items-center gap-3">
              <Badge tone={profile.mfa_enabled ? 'success' : 'danger'}>
                {profile.mfa_enabled ? 'Enabled' : 'Not enabled'}
              </Badge>
              <Link href="/account/mfa" className="text-ion-300 hover:underline">
                Manage
              </Link>
            </dd>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Recovery codes remaining</dt>
            <dd>
              {profile.mfa_enabled ? profile.recovery_codes.length : '—'}
              {profile.recovery_codes_generated_at
                ? ` · issued ${formatDate(profile.recovery_codes_generated_at)}`
                : ''}
            </dd>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">This session</dt>
            <dd>
              <Badge tone={ctx.aal2 ? 'success' : 'warning'}>
                {ctx.aal2 ? 'Second factor presented' : 'Password only'}
              </Badge>
            </dd>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Account status</dt>
            <dd>
              <Badge
                tone={
                  profile.status === 'active'
                    ? 'success'
                    : profile.status === 'pending'
                      ? 'warning'
                      : 'danger'
                }
              >
                {profile.status}
              </Badge>
            </dd>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Role</dt>
            <dd>
              <Badge tone={profile.role === 'learner' ? 'neutral' : 'info'}>
                {profile.role}
              </Badge>
            </dd>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Email</dt>
            <dd className="font-mono text-xs">{profile.email}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border)] pt-5">
          <ButtonLink href="/account/mfa" size="sm" variant="secondary">
            Two-factor settings
          </ButtonLink>
          <ButtonLink href="/reset-password" size="sm" variant="secondary">
            Change password
          </ButtonLink>
          <ButtonLink href="/redeem" size="sm" variant="secondary">
            Redeem an invitation
          </ButtonLink>
          <ButtonLink href="/logout" size="sm" variant="ghost">
            Sign out everywhere
          </ButtonLink>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Your name appears on any certificate you earn. Role and status can only be
          changed by an administrator.
        </p>
        <ProfileForm
          initial={{
            fullName: profile.full_name,
            organization: profile.organization ?? '',
            country: profile.country ?? '',
            jobTitle: profile.job_title ?? '',
            technicalLevel: profile.technical_level,
            bio: profile.bio ?? '',
          }}
        />
      </Card>
    </div>
  );
}
