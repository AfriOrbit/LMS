import { NextResponse, type NextRequest } from 'next/server';

import { audit } from '@/lib/security';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Sign out. Accepts GET so a plain link works, but scopes the sign-out
 * globally so every refresh token for this user is revoked, not just the one
 * in this browser.
 */
async function signOut(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await audit('auth.logout');
  await supabase.auth.signOut({ scope: 'global' });
  return NextResponse.redirect(new URL('/login', request.url));
}

export async function GET(request: NextRequest) {
  return signOut(request);
}

export async function POST(request: NextRequest) {
  return signOut(request);
}
