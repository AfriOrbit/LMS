'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { getSessionContext, requireAdmin, requireStaff } from '@/lib/auth';
import { audit } from '@/lib/security';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  gradeLabReportSchema,
  invitationSchema,
  uuidSchema,
} from '@/lib/validation';
import type { AppRole } from '@/types/db';

export interface AdminResult<T = undefined> {
  ok: boolean;
  message?: string;
  data?: T;
}

/* -------------------------------------------------------------------------- */
/* User administration                                                         */
/* -------------------------------------------------------------------------- */

export async function setAccountStatusAction(
  userId: string,
  status: 'active' | 'suspended' | 'rejected' | 'pending',
): Promise<AdminResult> {
  const ctx = await requireAdmin();
  if (!uuidSchema.safeParse(userId).success) return { ok: false, message: 'Invalid user.' };

  if (userId === ctx.userId && status !== 'active') {
    return { ok: false, message: 'You cannot deactivate your own account.' };
  }

  const supabase = await createSupabaseServerClient();
  // `status` is not writable through a plain UPDATE by any authenticated
  // session — see the column grants in migration 0006.
  const { error } = await supabase.schema('app').rpc('set_account_status', {
    target: userId,
    new_status: status,
  });

  if (error) return { ok: false, message: error.message };

  await audit('admin.account_status_changed', {
    entity: 'profile',
    entityId: userId,
    metadata: { status },
  });
  revalidatePath('/admin/users');
  return { ok: true, message: `Account set to ${status}.` };
}

export async function setUserRoleAction(
  userId: string,
  role: AppRole,
): Promise<AdminResult> {
  await requireAdmin();
  if (!uuidSchema.safeParse(userId).success) return { ok: false, message: 'Invalid user.' };

  const supabase = await createSupabaseServerClient();
  // Goes through the SECURITY DEFINER function, which re-checks admin status
  // and refuses self-demotion.
  const { error } = await supabase.schema('app').rpc('set_user_role', {
    target: userId,
    new_role: role,
  });

  if (error) return { ok: false, message: error.message };

  await audit('admin.role_changed', {
    entity: 'profile',
    entityId: userId,
    metadata: { role },
  });
  revalidatePath('/admin/users');
  return { ok: true, message: `Role set to ${role}.` };
}

/**
 * Clear a user's MFA enrolment. Used when someone loses both their
 * authenticator and their recovery codes. High-privilege, always audited.
 */
export async function resetUserMfaAction(userId: string): Promise<AdminResult> {
  const ctx = await requireAdmin();
  if (!ctx.aal2) {
    return { ok: false, message: 'Present your own second factor before doing this.' };
  }
  if (!uuidSchema.safeParse(userId).success) return { ok: false, message: 'Invalid user.' };

  const admin = createSupabaseAdminClient();

  const { data: factors, error: listError } =
    await admin.auth.admin.mfa.listFactors({ userId });
  if (listError) return { ok: false, message: listError.message };

  for (const factor of factors?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ userId, id: factor.id });
  }

  await admin
    .from('profiles')
    .update({ mfa_enabled: false, recovery_codes: [] })
    .eq('id', userId);

  await audit('admin.mfa_reset', { entity: 'profile', entityId: userId });
  revalidatePath('/admin/users');
  return {
    ok: true,
    message: 'MFA cleared. The user must enrol again at next sign-in.',
  };
}

/* -------------------------------------------------------------------------- */
/* Enrollment administration                                                   */
/* -------------------------------------------------------------------------- */

export async function adminEnrollAction(
  userId: string,
  courseId: string,
  cohortId?: string | null,
): Promise<AdminResult> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('enrollments').upsert(
    {
      user_id: userId,
      course_id: courseId,
      cohort_id: cohortId ?? null,
      source: 'admin',
      status: 'active',
    },
    { onConflict: 'user_id,course_id' },
  );

  if (error) return { ok: false, message: error.message };
  await audit('admin.enrolled_user', {
    entity: 'course',
    entityId: courseId,
    metadata: { user_id: userId },
  });
  revalidatePath('/admin/users');
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Course publishing                                                           */
/* -------------------------------------------------------------------------- */

export async function setCourseStatusAction(
  courseId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<AdminResult> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('courses')
    .update({
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
    })
    .eq('id', courseId);

  if (error) return { ok: false, message: error.message };
  await audit('admin.course_status_changed', {
    entity: 'course',
    entityId: courseId,
    metadata: { status },
  });
  revalidatePath('/admin/courses');
  revalidatePath('/catalog');
  return { ok: true, message: `Course ${status}.` };
}

/* -------------------------------------------------------------------------- */
/* Lab report grading                                                          */
/* -------------------------------------------------------------------------- */

export async function gradeLabReportAction(input: {
  reportId: string;
  pointsAwarded: number;
  rubricScores: { criterion: string; score: number; note?: string }[];
  feedback: string;
  passed: boolean;
  returnForRevision?: boolean;
}): Promise<AdminResult> {
  const ctx = await requireStaff();

  const parsed = gradeLabReportSchema.safeParse({
    ...input,
    returnForRevision: input.returnForRevision ?? false,
  });
  if (!parsed.success) return { ok: false, message: 'Check the grading form.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('lab_reports')
    .update({
      points_awarded: parsed.data.pointsAwarded,
      rubric_scores: parsed.data.rubricScores,
      feedback_md: parsed.data.feedback,
      passed: parsed.data.passed,
      status: parsed.data.returnForRevision ? 'returned' : 'graded',
      grader_id: ctx.userId,
      graded_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.reportId);

  if (error) return { ok: false, message: error.message };

  await audit('staff.lab_report_graded', {
    entity: 'lab_report',
    entityId: parsed.data.reportId,
    metadata: { points: parsed.data.pointsAwarded, passed: parsed.data.passed },
  });
  revalidatePath('/admin/grading');
  return { ok: true, message: 'Grade recorded.' };
}

/* -------------------------------------------------------------------------- */
/* Hardware kits                                                               */
/* -------------------------------------------------------------------------- */

export async function assignKitAction(
  kitId: string,
  userId: string,
  dueBackOn?: string,
): Promise<AdminResult> {
  const ctx = await requireStaff();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('kit_assignments').insert({
    kit_id: kitId,
    user_id: userId,
    due_back_on: dueBackOn || null,
    assigned_by: ctx.userId,
  });

  if (error) {
    if (error.code === '23505') {
      return { ok: false, message: 'That kit is already on loan.' };
    }
    return { ok: false, message: error.message };
  }

  await audit('staff.kit_assigned', {
    entity: 'hardware_kit',
    entityId: kitId,
    metadata: { user_id: userId },
  });
  revalidatePath('/admin/kits');
  return { ok: true, message: 'Kit assigned.' };
}

export async function returnKitAction(
  assignmentId: string,
  condition?: string,
): Promise<AdminResult> {
  await requireStaff();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('kit_assignments')
    .update({
      returned_at: new Date().toISOString(),
      return_condition: condition ?? null,
    })
    .eq('id', assignmentId);

  if (error) return { ok: false, message: error.message };
  await audit('staff.kit_returned', { entity: 'kit_assignment', entityId: assignmentId });
  revalidatePath('/admin/kits');
  return { ok: true, message: 'Kit returned to inventory.' };
}

/* -------------------------------------------------------------------------- */
/* Invitations                                                                 */
/* -------------------------------------------------------------------------- */

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

export async function createInvitationAction(input: {
  email?: string;
  courseId?: string | null;
  cohortId?: string | null;
  grantsRole?: 'learner' | 'instructor';
  autoApprove?: boolean;
  maxUses?: number;
  expiresInDays?: number;
}): Promise<AdminResult<{ code: string }>> {
  const ctx = await requireAdmin();

  const parsed = invitationSchema.safeParse({
    email: input.email ?? '',
    courseId: input.courseId ?? null,
    cohortId: input.cohortId ?? null,
    grantsRole: input.grantsRole ?? 'learner',
    autoApprove: input.autoApprove ?? true,
    maxUses: input.maxUses ?? 1,
    expiresInDays: input.expiresInDays ?? 30,
  });
  if (!parsed.success) return { ok: false, message: 'Check the invitation form.' };

  const code = generateInviteCode();
  const codeHash = createHash('sha256').update(code).digest('hex');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('invitations').insert({
    code_hash: codeHash,
    code_hint: code.slice(-4),
    email: parsed.data.email || null,
    course_id: parsed.data.courseId,
    cohort_id: parsed.data.cohortId,
    grants_role: parsed.data.grantsRole,
    auto_approve: parsed.data.autoApprove,
    max_uses: parsed.data.maxUses,
    expires_at: new Date(
      Date.now() + parsed.data.expiresInDays * 86_400_000,
    ).toISOString(),
    created_by: ctx.userId,
  });

  if (error) return { ok: false, message: error.message };

  await audit('admin.invitation_created', {
    entity: 'invitation',
    metadata: { hint: code.slice(-4), max_uses: parsed.data.maxUses },
  });
  revalidatePath('/admin/invitations');

  // The plaintext is returned exactly once — only the hash is stored.
  return { ok: true, data: { code } };
}

export async function revokeInvitationAction(invitationId: string): Promise<AdminResult> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('invitations').delete().eq('id', invitationId);

  if (error) return { ok: false, message: error.message };
  await audit('admin.invitation_revoked', {
    entity: 'invitation',
    entityId: invitationId,
  });
  revalidatePath('/admin/invitations');
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Certificates                                                                */
/* -------------------------------------------------------------------------- */

export async function revokeCertificateAction(
  certificateId: string,
  reason: string,
): Promise<AdminResult> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('certificates')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason.slice(0, 500),
    })
    .eq('id', certificateId);

  if (error) return { ok: false, message: error.message };
  await audit('admin.certificate_revoked', {
    entity: 'certificate',
    entityId: certificateId,
    metadata: { reason },
  });
  return { ok: true, message: 'Certificate revoked.' };
}

/* -------------------------------------------------------------------------- */
/* Announcements                                                               */
/* -------------------------------------------------------------------------- */

export async function postAnnouncementAction(input: {
  courseId?: string | null;
  cohortId?: string | null;
  title: string;
  body: string;
  pinned?: boolean;
}): Promise<AdminResult> {
  const ctx = await getSessionContext();
  if (!ctx || (ctx.profile.role !== 'admin' && ctx.profile.role !== 'instructor')) {
    return { ok: false, message: 'Not permitted.' };
  }

  const title = input.title.trim().slice(0, 200);
  if (!title) return { ok: false, message: 'A title is required.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('announcements').insert({
    course_id: input.courseId ?? null,
    cohort_id: input.cohortId ?? null,
    author_id: ctx.userId,
    title,
    body_md: input.body.slice(0, 20_000),
    pinned: input.pinned ?? false,
  });

  if (error) return { ok: false, message: error.message };
  await audit('staff.announcement_posted', { metadata: { title } });
  revalidatePath('/dashboard');
  return { ok: true, message: 'Announcement posted.' };
}
