import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AuditEntry } from '@/types/db';

export const metadata = { title: 'Audit log · Admin' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  await requireAdmin();
  const { action, page } = await searchParams;
  const pageNumber = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
  const supabase = await createSupabaseServerClient();

  let query = supabase.from('audit_log').select('*');
  if (action) query = query.ilike('action', `${action.replace(/[%,*()]/g, '')}%`);

  const { data: entries } = await query
    .order('created_at', { ascending: false })
    .range((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE - 1)
    .returns<AuditEntry[]>();

  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="Audit log"
        description="Append-only. No role — including admin — can modify or delete an entry. IP addresses are stored as salted hashes, never in the clear."
      />

      <form className="mb-6 flex flex-wrap gap-3" action="/admin/audit">
        <input
          name="action"
          defaultValue={action ?? ''}
          placeholder="Filter by action prefix, e.g. auth.mfa"
          className="min-w-64 flex-1 border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
        >
          Filter
        </button>
      </form>

      {(entries ?? []).length === 0 ? (
        <EmptyState title="No entries" description="Nothing matches this filter." />
      ) : (
        <>
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Entity</th>
                    <th className="px-4 py-3 font-medium">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {(entries ?? []).map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-[var(--border)] align-top last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-[var(--text-muted)]">
                        {new Date(entry.created_at).toLocaleString('en-GB')}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {entry.actor_email ?? 'system'}
                      </td>
                      <td className="px-4 py-2.5">
                        <code className="font-mono text-xs text-[var(--accent)]">
                          {entry.action}
                        </code>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)]">
                        {entry.entity ? `${entry.entity}` : '—'}
                        {entry.entity_id ? (
                          <span className="block font-mono text-[10px]">
                            {entry.entity_id.slice(0, 8)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-[var(--text-muted)]">
                        {Object.keys(entry.metadata ?? {}).length > 0
                          ? JSON.stringify(entry.metadata)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="mt-4 flex justify-between text-sm">
            {pageNumber > 1 ? (
              <a
                href={`/admin/audit?page=${pageNumber - 1}${action ? `&action=${action}` : ''}`}
                className="text-[var(--accent)] hover:underline"
              >
                ← Newer
              </a>
            ) : (
              <span />
            )}
            {(entries ?? []).length === PAGE_SIZE ? (
              <a
                href={`/admin/audit?page=${pageNumber + 1}${action ? `&action=${action}` : ''}`}
                className="text-[var(--accent)] hover:underline"
              >
                Older →
              </a>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
