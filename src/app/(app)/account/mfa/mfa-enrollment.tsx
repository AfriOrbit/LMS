'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';

import {
  beginMfaEnrollmentAction,
  completeMfaEnrollmentAction,
  disableMfaAction,
  regenerateRecoveryCodesAction,
  type ActionState,
  type EnrollState,
} from '@/lib/actions/auth';
import { Alert, Button, ButtonLink, Card, Field, Input } from '@/components/ui/primitives';

const INITIAL: ActionState = {};

function VerifyButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Verifying…' : 'Verify and enable'}
    </Button>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  const asText = codes.join('\n');

  return (
    <Card className="border-[var(--warn-line)] bg-[var(--warn-bg)]">
      <h2 className="text-base font-semibold text-[var(--warn)]">
        Save your recovery codes now
      </h2>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">
        Each code works once. They are the only way back in if you lose your authenticator.
        We store only hashes — if you lose these, an administrator has to reset your
        account manually.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((code) => (
          <li
            key={code}
            className="border border-[var(--border)] bg-[var(--bg)] px-3 py-2 tracking-wider"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(asText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'Copied' : 'Copy all'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            const blob = new Blob(
              [`AfriOrbit Learning — MFA recovery codes\n\n${asText}\n`],
              { type: 'text/plain' },
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'afriorbit-recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download
        </Button>
      </div>
    </Card>
  );
}

export function MfaEnrollment({
  alreadyEnrolled,
  mandatory,
  next,
}: {
  alreadyEnrolled: boolean;
  mandatory: boolean;
  next: string;
}) {
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, action] = useActionState(completeMfaEnrollmentAction, INITIAL);
  const [disableState, disableAction] = useActionState(disableMfaAction, INITIAL);
  const [regenState, setRegenState] = useState<ActionState | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (!alreadyEnrolled && !enroll && !state.ok) {
      startTransition(async () => {
        setEnroll(await beginMfaEnrollmentAction());
      });
    }
    // Intentionally runs once on mount for un-enrolled users.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Just finished enrolling ------------------------------------------- */
  if (state.ok && state.recoveryCodes) {
    return (
      <div className="space-y-6">
        <Alert tone="success" title="Two-factor authentication is on">
          From now on you will be asked for a 6-digit code after your password.
        </Alert>
        <RecoveryCodes codes={state.recoveryCodes} />
        <ButtonLink href={next} size="lg">
          I have saved my codes — continue
        </ButtonLink>
      </div>
    );
  }

  /* --- Already enrolled: management view --------------------------------- */
  if (alreadyEnrolled) {
    return (
      <div className="space-y-6">
        <Alert tone="success" title="Protected">
          An authenticator app is enrolled on this account.
        </Alert>

        <Card>
          <h2 className="text-base font-semibold">Recovery codes</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">
            Regenerating invalidates every code you were previously issued.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => startTransition(async () => setRegenState(await regenerateRecoveryCodesAction()))}
            disabled={starting}
          >
            {starting ? 'Working…' : 'Generate new recovery codes'}
          </Button>
          {regenState?.message && !regenState.recoveryCodes ? (
            <p className="mt-3 text-sm text-[var(--bad)]">{regenState.message}</p>
          ) : null}
        </Card>

        {regenState?.recoveryCodes ? (
          <RecoveryCodes codes={regenState.recoveryCodes} />
        ) : null}

        {!mandatory ? (
          <Card>
            <h2 className="text-base font-semibold">Turn off two-factor</h2>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              We do not recommend this. Confirm with a current code.
            </p>
            <form action={disableAction} className="mt-3 flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Field label="Current code" htmlFor="disable-code" error={disableState.errors?.code}>
                  <Input
                    id="disable-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="font-mono tracking-[0.3em]"
                  />
                </Field>
              </div>
              <Button type="submit" variant="danger" size="sm">
                Disable
              </Button>
            </form>
            {disableState.message ? (
              <p className="mt-3 text-sm text-[var(--text-muted)]">{disableState.message}</p>
            ) : null}
          </Card>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Two-factor authentication is mandatory for your role and cannot be turned off.
          </p>
        )}

        <ButtonLink href="/account" variant="ghost" size="sm">
          ← Back to account
        </ButtonLink>
      </div>
    );
  }

  /* --- Enrolment ---------------------------------------------------------- */
  return (
    <div className="space-y-6">
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <Card>
        <ol className="space-y-6">
          <li>
            <h2 className="text-sm font-semibold">
              1. Install an authenticator app
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Any TOTP app works — Aegis, 1Password, Bitwarden, Google Authenticator, Microsoft
              Authenticator. Prefer one that backs up, so a lost phone is an inconvenience
              rather than an incident.
            </p>
          </li>

          <li>
            <h2 className="text-sm font-semibold">2. Scan this code</h2>
            {starting || !enroll ? (
              <div className="mt-3 h-48 w-48 animate-pulse bg-[var(--bg-hover)]" />
            ) : enroll.qrCode ? (
              <>
                <div className="mt-3 inline-block bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={enroll.qrCode}
                    alt="Two-factor authentication QR code"
                    width={176}
                    height={176}
                  />
                </div>
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  Cannot scan?{' '}
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="text-[var(--accent)] underline"
                  >
                    {showSecret ? 'Hide' : 'Show'} the setup key
                  </button>
                </p>
                {showSecret ? (
                  <code className="mt-2 block break-all border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm">
                    {enroll.secret}
                  </code>
                ) : null}
              </>
            ) : (
              <Alert tone="danger">{enroll.message ?? 'Could not start enrolment.'}</Alert>
            )}
          </li>

          <li>
            <h2 className="text-sm font-semibold">3. Enter the code it shows</h2>
            <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="factorId" value={enroll?.factorId ?? ''} />
              <div className="w-44">
                <Field label="6-digit code" htmlFor="code" error={state.errors?.code}>
                  <Input
                    id="code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    className="text-center font-mono text-lg tracking-[0.4em]"
                  />
                </Field>
              </div>
              <VerifyButton />
            </form>
          </li>
        </ol>
      </Card>

      {!mandatory ? (
        <p className="text-center text-sm">
          <Link href={next} className="text-[var(--text-muted)] hover:underline">
            Skip for now
          </Link>
        </p>
      ) : null}
    </div>
  );
}
