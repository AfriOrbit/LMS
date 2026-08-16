import { Badge, Card, PageHeader } from '@/components/ui/primitives';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import type { Cohort, Course } from '@/types/db';

import { InvitationCreator } from './invitation-creator';

export const metadata = { title: 'Invitations · Admin' };
export const dynamic = 'force-dynamic';

interface InvitationRow {
  id: string;
  code_hint: string;
  email: string | null;
  course_id: string | null;
  cohort_id: string | null;
  grants_role: string;
  auto_approve: boolean;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

export default async function InvitationsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: invitations }, { data: courses }, { data: cohorts }] = await Promise.all([
    supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<InvitationRow[]>(),
    supabase.from('courses').select('id, title, slug').order('sort_order').returns<
      Pick<Course, 'id' | 'title' | 'slug'>[]
    >(),
    supabase.from('cohorts').select('id, name, course_id').order('starts_on').returns<
      Pick<Cohort, 'id' | 'name' | 'course_id'>[]
    >(),
  ]);

  const courseTitle = new Map((courses ?? []).map((c) => [c.id, c.title]));

  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Invitations"
        description="Codes that approve an account and enrol it in one step. Only a hash is stored — the plaintext is shown once, at creation."
      />

      <div className="mb-10">
        <InvitationCreator
          courses={(courses ?? []).map((c) => ({ id: c.id, title: c.title }))}
          cohorts={(cohorts ?? []).map((c) => ({
            id: c.id,
            name: c.name,
            courseId: c.course_id,
          }))}
        />
      </div>

      <h2 className="mb-4 text-lg font-semibold tracking-tight">Issued codes</h2>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Bound to</th>
                <th className="px-4 py-3 font-medium">Grants</th>
                <th className="px-4 py-3 font-medium">Uses</th>
                <th className="px-4 py-3 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody>
              {(invitations ?? []).map((invitation) => {
                const expired =
                  invitation.expires_at && new Date(invitation.expires_at) < new Date();
                const exhausted = invitation.uses >= invitation.max_uses;
                return (
                  <tr
                    key={invitation.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      ••••-••••-{invitation.code_hint}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {invitation.email ?? 'anyone'}
                      {invitation.course_id ? (
                        <span className="block text-[var(--text-muted)]">
                          {courseTitle.get(invitation.course_id) ?? 'course'}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={invitation.grants_role === 'instructor' ? 'info' : 'neutral'}>
                        {invitation.grants_role}
                      </Badge>
                      {invitation.auto_approve ? (
                        <Badge tone="success" className="ml-1">
                          auto-approve
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {invitation.uses}/{invitation.max_uses}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {invitation.expires_at ? formatDate(invitation.expires_at) : 'never'}
                      {expired || exhausted ? (
                        <Badge tone="danger" className="ml-2">
                          {expired ? 'expired' : 'used up'}
                        </Badge>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {(invitations ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-[var(--text-muted)]"
                  >
                    No invitations issued yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
