'use client';

import { useState, useTransition } from 'react';

import { issueCertificateAction } from '@/lib/actions/learning';
import { Alert, Button, ButtonLink, Card } from '@/components/ui/primitives';

export function ClaimCertificate({ courseId }: { courseId: string }) {
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (code) {
    return (
      <Card className="border-signal-500/35 bg-signal-500/5">
        <h2 className="text-base font-semibold text-signal-400">Certificate issued</h2>
        <p className="mt-1.5 text-sm text-[var(--text-muted)]">
          Verification code <span className="font-mono text-[var(--text)]">{code}</span> —
          anyone can confirm it at /verify without an account.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href={`/api/certificates/${code}/pdf`} size="sm">
            Download PDF
          </ButtonLink>
          <ButtonLink href="/certificates" variant="secondary" size="sm">
            All certificates
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-signal-500/35 bg-signal-500/5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-signal-400">Course complete</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Every lesson is done and every graded assessment is passed.
          </p>
        </div>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await issueCertificateAction(courseId);
              if (result.ok && result.data) setCode(result.data.code);
              else setError(result.message ?? 'Could not issue a certificate.');
            })
          }
        >
          {pending ? 'Issuing…' : 'Claim your certificate'}
        </Button>
      </div>
      {error ? (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
    </Card>
  );
}
