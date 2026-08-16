import Link from 'next/link';

import { Badge, Card, PageHeader, Stat } from '@/components/ui/primitives';
import { requireStaff } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import type { AuditEntry, Profile } from '@/types/db';

export const metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Head-only count. Each caller builds its own filter so types stay honest. */
function head(supabase: Client, table: string) {
  return supabase.from(table).select('*', { count: 'exact', head: true });
}

export default async function AdminOverviewPage() {
  const ctx = await requireStaff();
  const supabase = await createSupabaseServerClient();

  const [
    totalUsers,
    pendingUsers,
    mfaOff,
    publishedCourses,
    activeEnrollments,
    reportsToGrade,
    certificates,
  ] = await Promise.all([
    head(supabase, 'profiles'),
    head(supabase, 'profiles').eq('status', 'pending'),
    head(supabase, 'profiles').eq('mfa_enabled', false),
    head(supabase, 'courses').eq('status', 'published'),
    head(supabase, 'enrollments').eq('status', 'active'),
    head(supabase, 'lab_reports').eq('status', 'submitted'),
    head(supabase, 'certificates'),
  ]).then((results) => results.map((r) => r.count ?? 0));

  const isAdmin = ctx.profile.role === 'admin';

  const { data: pending } = isAdmin
    ? await supabase
        .from('profiles')
        .select('*')
        .eq('status', 'pending')
        .order('created_at')
        .limit(5)
        .returns<Profile[]>()
    : { data: [] };

  const { data: recentAudit } = isAdmin
    ? await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8)
        .returns<AuditEntry[]>()
    : { data: [] };

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Programme overview"
        description="Approvals, grading queue and platform health."
      />

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Accounts" value={totalUsers} hint={`${pendingUsers} awaiting approval`} />
        <Stat
          label="Without 2FA"
          value={mfaOff}
          hint={mfaOff > 0 ? 'Review policy compliance' : 'All accounts protected'}
        />
        <Stat label="Published courses" value={publishedCourses} />
        <Stat label="Active enrolments" value={activeEnrollments} />
        <Stat label="Reports to grade" value={reportsToGrade} />
        <Stat label="Certificates issued" value={certificates} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {isAdmin ? (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Awaiting approval</h2>
              <Link href="/admin/users" className="text-sm text-ion-300 hover:underline">
                All users →
              </Link>
            </div>
            {(pending ?? []).length === 0 ? (
              <Card>
                <p className="text-sm text-[var(--text-muted)]">
                  Nothing in the approval queue.
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {(pending ?? []).map((profile) => (
                  <Card key={profile.id} className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {profile.full_name || profile.email}
                        </p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {profile.organization ?? 'No organisation'} ·{' '}
                          {formatDate(profile.created_at)}
                        </p>
                      </div>
                      <Badge tone={profile.mfa_enabled ? 'success' : 'warning'}>
                        {profile.mfa_enabled ? '2FA on' : '2FA pending'}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Grading queue</h2>
            <Link href="/admin/grading" className="text-sm text-ion-300 hover:underline">
              Open queue →
            </Link>
          </div>
          <Card>
            <p className="text-sm text-[var(--text-muted)]">
              {reportsToGrade === 0
                ? 'No lab reports waiting.'
                : `${reportsToGrade} lab report${reportsToGrade === 1 ? '' : 's'} submitted and waiting for a grader.`}
            </p>
          </Card>
        </section>

        {isAdmin ? (
          <section className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
              <Link href="/admin/audit" className="text-sm text-ion-300 hover:underline">
                Full audit log →
              </Link>
            </div>
            <Card className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-4 py-2.5 font-medium">When</th>
                    <th className="px-4 py-2.5 font-medium">Actor</th>
                    <th className="px-4 py-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentAudit ?? []).map((entry) => (
                    <tr key={entry.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                        {new Date(entry.created_at).toLocaleString('en-GB')}
                      </td>
                      <td className="px-4 py-2.5 text-xs">{entry.actor_email ?? 'system'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{entry.action}</td>
                    </tr>
                  ))}
                  {(recentAudit ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                        No audit entries yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </Card>
          </section>
        ) : null}
      </div>
    </>
  );
}
