import Link from 'next/link';

import { Alert, Badge, ButtonLink, Card, PageHeader } from '@/components/ui/primitives';
import { clientIpHash, rateLimit } from '@/lib/security';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { formatDate } from '@/lib/utils';
import { certificateCodeSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

interface VerificationRow {
  code: string;
  recipient_name: string;
  course_title: string;
  final_score_pct: number | null;
  issued_at: string;
  expires_at: string | null;
  is_valid: boolean;
  integrity_hash: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return {
    title: `Verify ${code}`,
    robots: { index: false, follow: false },
  };
}

export default async function VerifyResultPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const parsed = certificateCodeSchema.safeParse(decodeURIComponent(code));

  if (!parsed.success) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Verification" />
        <Alert tone="danger" title="Not a valid code format">
          Certificate codes look like <code className="font-mono">AO-2026-7Q4KX2M9</code>.
        </Alert>
        <div className="mt-6">
          <ButtonLink href="/verify" variant="secondary">
            Try again
          </ButtonLink>
        </div>
      </div>
    );
  }

  // Public endpoint — rate limited by IP so the code space cannot be swept.
  const limit = await rateLimit('verify-cert', await clientIpHash(), 30, 600);
  if (!limit.allowed) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Verification" />
        <Alert tone="warning" title="Too many lookups">
          Wait a few minutes and try again.
        </Alert>
      </div>
    );
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('certificate_verification')
    .select('*')
    .eq('code', parsed.data)
    .maybeSingle<VerificationRow>();

  if (!data) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader eyebrow="Public" title="Certificate not found" />
        <Alert tone="danger" title="No certificate matches this code">
          Check for transcription errors — the alphabet excludes I, O, 0 and 1 precisely to
          avoid this. If the code is correct and this page still says no match, the
          certificate is not genuine.
        </Alert>
        <div className="mt-6">
          <ButtonLink href="/verify" variant="secondary">
            Check another code
          </ButtonLink>
        </div>
      </div>
    );
  }

  const expired = data.expires_at ? new Date(data.expires_at) < new Date() : false;
  const valid = data.is_valid && !expired;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Public verification" title="Certificate record" />

      <Card
        className={
          valid
            ? 'border-signal-500/40 bg-signal-500/5'
            : 'border-alert-500/40 bg-alert-500/5'
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Status
            </p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                valid ? 'text-signal-400' : 'text-alert-400'
              }`}
            >
              {valid ? 'Genuine and current' : expired ? 'Expired' : 'Revoked'}
            </p>
          </div>
          <Badge tone={valid ? 'success' : 'danger'}>{data.code}</Badge>
        </div>

        <dl className="mt-6 space-y-3 border-t border-[var(--border)] pt-5 text-sm">
          <div className="flex flex-wrap justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Issued to</dt>
            <dd className="font-medium">{data.recipient_name}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Course</dt>
            <dd className="text-right font-medium">{data.course_title}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Issued on</dt>
            <dd>{formatDate(data.issued_at)}</dd>
          </div>
          {data.final_score_pct !== null ? (
            <div className="flex flex-wrap justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Assessment average</dt>
              <dd>{Number(data.final_score_pct).toFixed(0)}%</dd>
            </div>
          ) : null}
          <div className="flex flex-col gap-1 border-t border-[var(--border)] pt-3">
            <dt className="text-[var(--text-muted)]">Integrity hash (SHA-256)</dt>
            <dd className="break-all font-mono text-xs">{data.integrity_hash}</dd>
          </div>
        </dl>
      </Card>

      <p className="mt-5 text-sm text-[var(--text-muted)]">
        Compare the hash above with the one printed on the certificate document. A mismatch
        means the document has been altered after issue, even if the code itself is
        genuine.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/verify" variant="secondary">
          Check another code
        </ButtonLink>
        <Link
          href="/catalog"
          className="inline-flex h-10 items-center text-sm text-ion-300 hover:underline"
        >
          See the courses behind this certificate →
        </Link>
      </div>
    </div>
  );
}
