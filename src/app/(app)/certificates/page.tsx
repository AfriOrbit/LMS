import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
} from '@/components/ui/primitives';
import { requireActiveMember } from '@/lib/auth';
import { publicEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import type { Certificate } from '@/types/db';

export const metadata = { title: 'Certificates' };
export const dynamic = 'force-dynamic';

export default async function CertificatesPage() {
  const ctx = await requireActiveMember();
  const supabase = await createSupabaseServerClient();

  const { data: certificates } = await supabase
    .from('certificates')
    .select('*')
    .eq('user_id', ctx.userId)
    .order('issued_at', { ascending: false })
    .returns<Certificate[]>();

  return (
    <>
      <PageHeader
        eyebrow="Achievements"
        title="Certificates"
        description="Each certificate carries a verification code anyone can check without an account."
      />

      {(certificates ?? []).length === 0 ? (
        <EmptyState
          title="No certificates yet"
          description="Complete every lesson in a course and pass its graded assessments, then claim your certificate from the course page."
          action={<ButtonLink href="/catalog">Browse courses</ButtonLink>}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {(certificates ?? []).map((cert) => (
            <Card key={cert.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold leading-snug">
                    {cert.course_title}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Issued to {cert.recipient_name} on {formatDate(cert.issued_at)}
                  </p>
                </div>
                <Badge tone={cert.revoked_at ? 'danger' : 'success'}>
                  {cert.revoked_at ? 'Revoked' : 'Valid'}
                </Badge>
              </div>

              <dl className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Verification code</dt>
                  <dd className="font-mono">{cert.code}</dd>
                </div>
                {cert.final_score_pct !== null ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">Assessment average</dt>
                    <dd>{Number(cert.final_score_pct).toFixed(0)}%</dd>
                  </div>
                ) : null}
                {cert.hours !== null ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-muted)]">Notional hours</dt>
                    <dd>{Number(cert.hours).toFixed(1)}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink href={`/api/certificates/${cert.code}/pdf`} size="sm">
                  Download PDF
                </ButtonLink>
                <ButtonLink
                  href={`/verify/${cert.code}`}
                  size="sm"
                  variant="secondary"
                >
                  Public verification page
                </ButtonLink>
              </div>

              <p className="mt-3 break-all text-xs text-[var(--text-muted)]">
                {publicEnv.siteUrl}/verify/{cert.code}
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
