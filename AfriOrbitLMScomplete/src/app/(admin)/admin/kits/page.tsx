import { Badge, Card, EmptyState, PageHeader, Stat } from '@/components/ui/primitives';
import { requireStaff } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import type { HardwareKit, Profile } from '@/types/db';

import { KitActions } from './kit-actions';

export const metadata = { title: 'Hardware · Admin' };
export const dynamic = 'force-dynamic';

interface AssignmentRow {
  id: string;
  kit_id: string;
  user_id: string;
  assigned_at: string;
  due_back_on: string | null;
  profiles: Pick<Profile, 'full_name' | 'email'> | null;
}

const STATUS_TONE = {
  available: 'success',
  assigned: 'info',
  maintenance: 'warning',
  retired: 'neutral',
} as const;

export default async function AdminKitsPage() {
  await requireStaff();
  const supabase = await createSupabaseServerClient();

  const [{ data: kits }, { data: assignments }, { data: learners }] = await Promise.all([
    supabase.from('hardware_kits').select('*').order('asset_tag').returns<HardwareKit[]>(),
    supabase
      .from('kit_assignments')
      .select('id, kit_id, user_id, assigned_at, due_back_on, profiles(full_name, email)')
      .is('returned_at', null)
      .returns<AssignmentRow[]>(),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('status', 'active')
      .order('full_name')
      .limit(500)
      .returns<Pick<Profile, 'id' | 'full_name' | 'email'>[]>(),
  ]);

  const openByKit = new Map((assignments ?? []).map((a) => [a.kit_id, a]));
  const all = kits ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Hardware kits"
        description="EduSat platforms and IoT edge devices. Assignments are exclusive — a kit can only be on loan to one person at a time."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Total kits" value={all.length} />
        <Stat
          label="Available"
          value={all.filter((k) => k.status === 'available').length}
        />
        <Stat label="On loan" value={all.filter((k) => k.status === 'assigned').length} />
        <Stat
          label="Maintenance"
          value={all.filter((k) => k.status === 'maintenance').length}
        />
      </div>

      {all.length === 0 ? (
        <EmptyState
          title="No kits registered"
          description="Insert rows into hardware_kits — asset_tag, kit_type and a spec JSON object — to start tracking inventory."
        />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-4 py-3 font-medium">Asset</th>
                  <th className="px-4 py-3 font-medium">Spec</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Holder</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {all.map((kit) => {
                  const open = openByKit.get(kit.id);
                  return (
                    <tr
                      key={kit.id}
                      className="border-b border-[var(--border)] align-top last:border-0"
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono font-medium text-ion-300">
                          {kit.asset_tag}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {kit.kit_type.replace(/_/g, ' ')}
                        </p>
                        {kit.firmware_version ? (
                          <p className="text-xs text-[var(--text-muted)]">
                            fw {kit.firmware_version}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                        {Object.entries(kit.spec ?? {})
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[kit.status]}>{kit.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {open ? (
                          <>
                            <p>{open.profiles?.full_name || open.profiles?.email}</p>
                            <p className="text-[var(--text-muted)]">
                              since {formatDate(open.assigned_at)}
                              {open.due_back_on
                                ? ` · due ${formatDate(open.due_back_on)}`
                                : ''}
                            </p>
                          </>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <KitActions
                          kitId={kit.id}
                          openAssignmentId={open?.id ?? null}
                          learners={(learners ?? []).map((l) => ({
                            id: l.id,
                            label: l.full_name || l.email,
                          }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
