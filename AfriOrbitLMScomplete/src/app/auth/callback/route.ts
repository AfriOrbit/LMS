import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/lib/env';
import { auditAsSystem } from '@/lib/security';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/utils';

/**
 * Handles the redirect from an emailed confirmation, magic link or recovery
 * link. Exchanges the one-time code for a session, then routes the user to
 * the next step in onboarding.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = safeRedirectPath(url.searchParams.get('next'), '/account/mfa');

  const supabase = await createSupabaseServerClient();
  let userId: string | undefined;
  let email: string | undefined;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/login?error=link_expired', request.url));
    }
    userId = data.user?.id;
    email = data.user?.email ?? undefined;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as 'signup' | 'recovery' | 'email_change' | 'magiclink' | 'invite',
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(new URL('/login?error=link_expired', request.url));
    }
    userId = data.user?.id;
    email = data.user?.email ?? undefined;
  } else {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (userId) {
    await auditAsSystem('auth.email_confirmed', { actorId: userId, actorEmail: email });

    // In open-registration mode, confirming the email activates the account.
    // In approval mode the account stays pending until an admin acts.
    if (serverEnv.registrationMode === 'open') {
      const admin = createSupabaseAdminClient();
      await admin
        .from('profiles')
        .update({ status: 'active', approved_at: new Date().toISOString() })
        .eq('id', userId)
        .eq('status', 'pending');
      await supabase.auth.refreshSession();
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
