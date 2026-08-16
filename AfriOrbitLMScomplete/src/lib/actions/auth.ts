'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getSessionContext } from '@/lib/auth';
import { publicEnv, serverEnv } from '@/lib/env';
import {
  audit,
  auditAsSystem,
  clientIpHash,
  consumeRecoveryCode,
  issueRecoveryCodes,
  rateLimit,
} from '@/lib/security';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/utils';
import {
  fieldErrors,
  loginSchema,
  profileUpdateSchema,
  recoveryCodeSchema,
  registerSchema,
  totpCodeSchema,
} from '@/lib/validation';

export interface ActionState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Populated once, immediately after recovery codes are generated. */
  recoveryCodes?: string[];
}

/* -------------------------------------------------------------------------- */
/* Registration                                                                */
/* -------------------------------------------------------------------------- */

export async function registerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    organization: formData.get('organization') ?? '',
    country: formData.get('country') ?? '',
    jobTitle: formData.get('jobTitle') ?? '',
    technicalLevel: formData.get('technicalLevel') ?? 'intermediate',
    acceptTerms: formData.get('acceptTerms') === 'on',
    inviteCode: formData.get('inviteCode') ?? '',
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  const ipHash = await clientIpHash();
  const limit = await rateLimit('register', ipHash, 5, 3600);
  if (!limit.allowed) {
    return { message: 'Too many registration attempts. Try again in an hour.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/account/mfa`,
      // NOTE: role is intentionally absent. The database trigger ignores any
      // role supplied here; see app.handle_new_user().
      data: {
        full_name: parsed.data.fullName,
        organization: parsed.data.organization || null,
        country: parsed.data.country || null,
        job_title: parsed.data.jobTitle || null,
      },
    },
  });

  if (error) {
    // Do not reveal whether the address already exists.
    if (/already registered|already exists/i.test(error.message)) {
      return {
        ok: true,
        message:
          'Check your inbox. If an account can be created for this address, a confirmation link is on its way.',
      };
    }
    return { message: error.message };
  }

  if (data.user) {
    // Email confirmation is on, so signUp returns no session — there is no
    // authenticated client yet and an RLS-scoped update would be refused.
    // The subject is the user we just created, so the service-role client is
    // the correct tool here rather than a shortcut.
    const admin = createSupabaseAdminClient();
    await admin
      .from('profiles')
      .update({
        technical_level: parsed.data.technicalLevel,
        accepted_terms_at: new Date().toISOString(),
      })
      .eq('id', data.user.id);

    await auditAsSystem('auth.register', {
      actorId: data.user.id,
      actorEmail: parsed.data.email,
      metadata: {
        organization: parsed.data.organization || null,
        used_invite: Boolean(parsed.data.inviteCode),
      },
    });
  }

  if (parsed.data.inviteCode) {
    // Redemption needs an authenticated session, so it happens after the
    // learner confirms their email. Stash it for the callback.
    redirect(
      `/verify-email?invite=${encodeURIComponent(parsed.data.inviteCode.slice(0, 64))}`,
    );
  }

  redirect('/verify-email');
}

/* -------------------------------------------------------------------------- */
/* Login                                                                       */
/* -------------------------------------------------------------------------- */

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const ipHash = await clientIpHash();
  const email = parsed.data.email.toLowerCase();

  // Two buckets: one per IP (blunts spraying) and one per account (blunts
  // credential stuffing against a single target).
  const [byIp, byAccount] = await Promise.all([
    rateLimit('login:ip', ipHash, 20, 900),
    rateLimit('login:account', email, 8, 900),
  ]);

  if (!byIp.allowed || !byAccount.allowed) {
    await auditAsSystem('auth.login.rate_limited', { actorEmail: email });
    return { message: 'Too many sign-in attempts. Try again in 15 minutes.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    await auditAsSystem('auth.login.failed', { actorEmail: email });
    // Deliberately generic.
    return { message: 'Those credentials did not work.' };
  }

  await auditAsSystem('auth.login.success', {
    actorId: data.user.id,
    actorEmail: email,
  });

  await supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', data.user.id);

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const next = safeRedirectPath(parsed.data.next);

  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    redirect(`/account/mfa/challenge?next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await audit('auth.logout');
  await supabase.auth.signOut({ scope: 'global' });
  redirect('/login');
}

/* -------------------------------------------------------------------------- */
/* Password reset                                                              */
/* -------------------------------------------------------------------------- */

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();

  if (!email.includes('@')) return { errors: { email: 'Enter a valid email address' } };

  const limit = await rateLimit('password-reset', email, 3, 3600);
  if (limit.allowed) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/account/password`,
    });
    await auditAsSystem('auth.password_reset.requested', { actorEmail: email });
  }

  // Same response either way — never confirm whether an address is registered.
  return {
    ok: true,
    message: 'If that address has an account, a reset link is on its way.',
  };
}

export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { message: 'Your session expired. Sign in again.' };

  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (password !== confirm) {
    return { errors: { confirmPassword: 'Passwords do not match' } };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { message: error.message };

  await audit('auth.password.changed');
  return { ok: true, message: 'Password updated.' };
}

/* -------------------------------------------------------------------------- */
/* Multi-factor authentication                                                 */
/* -------------------------------------------------------------------------- */

export interface EnrollState extends ActionState {
  factorId?: string;
  qrCode?: string;
  secret?: string;
  uri?: string;
}

/** Step 1: create an unverified TOTP factor and return its provisioning data. */
export async function beginMfaEnrollmentAction(): Promise<EnrollState> {
  const ctx = await getSessionContext();
  if (!ctx) return { message: 'Sign in first.' };

  const supabase = await createSupabaseServerClient();

  // Clear out abandoned unverified factors so repeated visits do not hit the
  // enrolled-factor cap.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const stale = (factors?.all ?? []).filter((f) => f.status === 'unverified');
  for (const factor of stale) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `AfriOrbit ${new Date().toISOString().slice(0, 10)}`,
    issuer: 'AfriOrbit Learning',
  });

  if (error || !data) return { message: error?.message ?? 'Could not start enrolment.' };

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/** Step 2: verify the first code, activate the factor, and issue recovery codes. */
export async function completeMfaEnrollmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { message: 'Sign in first.' };

  const factorId = String(formData.get('factorId') ?? '');
  const parsedCode = totpCodeSchema.safeParse(formData.get('code'));
  if (!factorId) return { message: 'Enrolment expired. Start again.' };
  if (!parsedCode.success) return { errors: { code: parsedCode.error.issues[0].message } };

  const limit = await rateLimit('mfa-enroll', ctx.userId, 10, 900);
  if (!limit.allowed) return { message: 'Too many attempts. Try again in 15 minutes.' };

  const supabase = await createSupabaseServerClient();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (challengeError || !challenge) {
    return { message: challengeError?.message ?? 'Could not create a challenge.' };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: parsedCode.data,
  });

  if (verifyError) {
    await audit('auth.mfa.enroll_failed', { metadata: { reason: verifyError.message } });
    return { errors: { code: 'That code was not accepted. Check your device clock.' } };
  }

  const admin = createSupabaseAdminClient();
  await admin
    .from('profiles')
    .update({ mfa_enabled: true, mfa_enforced_at: new Date().toISOString() })
    .eq('id', ctx.userId);

  const codes = await issueRecoveryCodes(ctx.userId);

  // Pick up the refreshed `mfa_enabled` claim so the edge gate stops
  // redirecting the user back to enrolment.
  await supabase.auth.refreshSession();

  await audit('auth.mfa.enrolled', { entity: 'factor', entityId: factorId });
  revalidatePath('/account');

  return { ok: true, message: 'Two-factor authentication is on.', recoveryCodes: codes };
}

/** Present a TOTP code for an existing factor to raise the session to AAL2. */
export async function verifyMfaChallengeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { message: 'Sign in first.' };

  const parsedCode = totpCodeSchema.safeParse(formData.get('code'));
  if (!parsedCode.success) return { errors: { code: parsedCode.error.issues[0].message } };

  const limit = await rateLimit('mfa-challenge', ctx.userId, 10, 900);
  if (!limit.allowed) {
    await audit('auth.mfa.rate_limited');
    return { message: 'Too many attempts. Try again in 15 minutes.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) return { message: 'No authenticator is enrolled on this account.' };

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) return { message: 'Could not create a challenge.' };

  const { error } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: parsedCode.data,
  });

  if (error) {
    await audit('auth.mfa.challenge_failed');
    return { errors: { code: 'That code was not accepted.' } };
  }

  await audit('auth.mfa.challenge_passed');
  const next = safeRedirectPath(String(formData.get('next') ?? ''));
  redirect(next);
}

/**
 * Recovery path. Consumes a single-use code, then removes the TOTP factor so
 * the user is forced to re-enrol — a recovery code proves possession once, it
 * does not substitute for a second factor going forward.
 */
export async function useRecoveryCodeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { message: 'Sign in first.' };

  const parsed = recoveryCodeSchema.safeParse(formData.get('recoveryCode'));
  if (!parsed.success) return { errors: { recoveryCode: parsed.error.issues[0].message } };

  const limit = await rateLimit('mfa-recovery', ctx.userId, 5, 3600);
  if (!limit.allowed) {
    await audit('auth.mfa.recovery_rate_limited');
    return { message: 'Too many attempts. Contact support.' };
  }

  const accepted = await consumeRecoveryCode(ctx.userId, parsed.data);
  if (!accepted) {
    await audit('auth.mfa.recovery_failed');
    return { errors: { recoveryCode: 'That code was not accepted.' } };
  }

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const admin = createSupabaseAdminClient();
  await admin.from('profiles').update({ mfa_enabled: false }).eq('id', ctx.userId);
  await supabase.auth.refreshSession();

  await audit('auth.mfa.recovery_used');
  redirect('/account/mfa?recovered=1');
}

/** Turn MFA off. Only permitted when policy does not require it. */
export async function disableMfaAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { message: 'Sign in first.' };

  const policyRequires =
    serverEnv.mfaPolicy === 'all' ||
    ctx.profile.role === 'admin' ||
    ctx.profile.role === 'instructor';

  if (policyRequires) {
    return {
      message:
        'Two-factor authentication is mandatory for your role and cannot be turned off.',
    };
  }

  const parsedCode = totpCodeSchema.safeParse(formData.get('code'));
  if (!parsedCode.success) return { errors: { code: 'Enter a current code to confirm' } };

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) return { message: 'Nothing to disable.' };

  const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (!challenge) return { message: 'Could not create a challenge.' };

  const { error } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: parsedCode.data,
  });
  if (error) return { errors: { code: 'That code was not accepted.' } };

  await supabase.auth.mfa.unenroll({ factorId: factor.id });

  const admin = createSupabaseAdminClient();
  await admin
    .from('profiles')
    .update({ mfa_enabled: false, recovery_codes: [] })
    .eq('id', ctx.userId);
  await supabase.auth.refreshSession();

  await audit('auth.mfa.disabled');
  revalidatePath('/account');
  return { ok: true, message: 'Two-factor authentication is off.' };
}

export async function regenerateRecoveryCodesAction(): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { message: 'Sign in first.' };
  if (!ctx.aal2) return { message: 'Present your second factor first.' };

  const codes = await issueRecoveryCodes(ctx.userId);
  await audit('auth.mfa.recovery_codes_regenerated');
  return { ok: true, recoveryCodes: codes };
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                     */
/* -------------------------------------------------------------------------- */

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { message: 'Sign in first.' };

  const parsed = profileUpdateSchema.safeParse({
    fullName: formData.get('fullName'),
    organization: formData.get('organization') ?? '',
    country: formData.get('country') ?? '',
    jobTitle: formData.get('jobTitle') ?? '',
    technicalLevel: formData.get('technicalLevel') ?? 'intermediate',
    bio: formData.get('bio') ?? '',
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  // Note: role and status are absent from this update by construction, and the
  // profiles_guard trigger would reject them anyway.
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      organization: parsed.data.organization || null,
      country: parsed.data.country || null,
      job_title: parsed.data.jobTitle || null,
      technical_level: parsed.data.technicalLevel,
      bio: parsed.data.bio || null,
    })
    .eq('id', ctx.userId);

  if (error) return { message: error.message };

  await audit('profile.updated');
  revalidatePath('/account');
  return { ok: true, message: 'Profile saved.' };
}

/* -------------------------------------------------------------------------- */
/* Invitations                                                                 */
/* -------------------------------------------------------------------------- */

export async function redeemInvitationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { message: 'Sign in first.' };

  const code = String(formData.get('code') ?? '').trim();
  if (!code) return { errors: { code: 'Enter your invitation code' } };

  const limit = await rateLimit('invite-redeem', ctx.userId, 10, 3600);
  if (!limit.allowed) return { message: 'Too many attempts. Try again later.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema('app').rpc('redeem_invitation', {
    p_code: code,
  });

  if (error) {
    await audit('invitation.redeem_failed');
    const reasons: Record<string, string> = {
      invalid_code: 'That code was not recognised.',
      code_expired: 'That code has expired.',
      code_exhausted: 'That code has already been fully used.',
      code_not_for_this_account: 'That code was issued to a different email address.',
    };
    return { message: reasons[error.message] ?? 'That code could not be redeemed.' };
  }

  await audit('invitation.redeemed');
  await supabase.auth.refreshSession();
  revalidatePath('/dashboard');
  return { ok: true, message: 'Invitation accepted.' };
}
