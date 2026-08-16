import { NextResponse, type NextRequest } from 'next/server';

import { getSessionContext } from '@/lib/auth';
import { buildCertificatePdf } from '@/lib/certificate-pdf';
import { clientIpHash, rateLimit } from '@/lib/security';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { certificateCodeSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * Certificate PDF.
 *
 * Deliberately readable by anyone holding the code — a certificate that cannot
 * be shown to an employer is not much use. The code is high-entropy and not
 * enumerable, the endpoint is rate limited, and revoked certificates 410.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const parsed = certificateCodeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }

  const ctx = await getSessionContext();
  const key = ctx?.userId ?? (await clientIpHash());
  const limit = await rateLimit('certificate-pdf', key, 30, 600);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const admin = createSupabaseAdminClient();
  const { data: certificate, error } = await admin
    .from('certificates')
    .select('code, recipient_name, course_title, final_score_pct, hours, issued_at, revoked_at, integrity_hash, course_id')
    .eq('code', parsed.data)
    .maybeSingle<{
      code: string;
      recipient_name: string;
      course_title: string;
      final_score_pct: number | null;
      hours: number | null;
      issued_at: string;
      revoked_at: string | null;
      integrity_hash: string;
      course_id: string;
    }>();

  if (error || !certificate) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (certificate.revoked_at) {
    return NextResponse.json({ error: 'revoked' }, { status: 410 });
  }

  const { data: course } = await admin
    .from('courses')
    .select('subtitle')
    .eq('id', certificate.course_id)
    .maybeSingle<{ subtitle: string }>();

  const pdf = await buildCertificatePdf({
    code: certificate.code,
    recipientName: certificate.recipient_name,
    courseTitle: certificate.course_title,
    courseSubtitle: course?.subtitle ?? null,
    finalScorePct: certificate.final_score_pct,
    hours: certificate.hours,
    issuedAt: certificate.issued_at,
    integrityHash: certificate.integrity_hash,
  });

  return new NextResponse(pdf as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="afriorbit-${certificate.code}.pdf"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
