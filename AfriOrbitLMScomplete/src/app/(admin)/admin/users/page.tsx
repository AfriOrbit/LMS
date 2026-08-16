import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/db';

import { UserRow } from './user-row';

export const metadata = { title: 'Users · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireAdmin();
  const { status, q } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase.from('profiles').select('*');
  if (status && ['pending', 'active', 'suspended', 'rejected'].includes(status)) {
    query = query.eq('status', status);
  }
  if (q) {
    const safe = q.replace(/[,()*]/g, ' ').slice(0, 80);
    query = query.or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`);
  }

  const { data: profiles } = await query
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<Profile[]>();

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Approve registrations, change roles, and recover accounts that have lost their second factor."
      />

      <form className="mb-6 flex flex-wrap gap-3" action="/admin/users">
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search name or email"
          className="min-w-56 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-ion-600 px-4 py-2 text-sm font-medium text-white hover:bg-ion-500"
        >
          Filter
        </button>
      </form>

      {(profiles ?? []).length === 0 ? (
        <EmptyState title="No users match" />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Organisation</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">2FA</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(profiles ?? []).map((profile) => (
                  <UserRow key={profile.id} profile={profile} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
