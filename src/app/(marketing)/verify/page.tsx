import { redirect } from 'next/navigation';

import { Card, PageHeader } from '@/components/ui/primitives';

export const metadata = {
  title: 'Verify a certificate',
  description:
    'Confirm the authenticity of an AfriOrbit Space training certificate using its verification code.',
};

async function verify(formData: FormData) {
  'use server';
  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  redirect(`/verify/${encodeURIComponent(code)}`);
}

export default function VerifyLandingPage() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow="Public"
        title="Verify a certificate"
        description="Enter the verification code printed on an AfriOrbit certificate. No account is required."
      />

      <Card>
        <form action={verify} className="space-y-4">
          <label htmlFor="code" className="block text-sm font-medium">
            Verification code
          </label>
          <input
            id="code"
            name="code"
            required
            autoFocus
            placeholder="AO-2026-7Q4KX2M9"
            className="w-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-center font-mono text-lg uppercase tracking-widest focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="submit"
            className="h-12 w-full bg-[var(--accent)] text-base font-medium text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]"
          >
            Verify
          </button>
        </form>

        <p className="mt-5 text-sm text-[var(--text-muted)]">
          Codes look like <code className="font-mono">AO-2026-7Q4KX2M9</code> and appear on
          the certificate PDF alongside a SHA-256 integrity hash. If the hash on the
          document does not match the one shown here, the document has been altered.
        </p>
      </Card>
    </div>
  );
}
