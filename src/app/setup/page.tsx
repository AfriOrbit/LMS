import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Setup required',
  robots: { index: false, follow: false },
};

/**
 * Configuration diagnostic.
 *
 * The proxy redirects here when a required public variable is missing, instead
 * of letting the Supabase client constructor throw and return 500 on every
 * route. The single most valuable thing this page does is name the variables
 * that are absent *at runtime in the deployed bundle*, which is a different
 * question from whether they are present in the hosting dashboard.
 *
 * It reports presence and shape only. No value is ever rendered — not even a
 * masked one for the service role key, because a length and a prefix are
 * enough to narrow a brute force and this page is unauthenticated by
 * necessity: it has to work before anything else does.
 */

type Check = {
  name: string;
  present: boolean;
  required: boolean;
  buildTime: boolean;
  note: string;
  problem?: string;
};

function looksLikeSupabaseUrl(value: string): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Not a valid URL. It must start with https:// and have no trailing slash.';
  }
  if (url.protocol !== 'https:') return 'Must be https://.';
  if (!url.hostname.endsWith('.supabase.co') && !url.hostname.endsWith('.supabase.in')) {
    return 'Does not look like a Supabase project URL (expected …​.supabase.co).';
  }
  if (value.endsWith('/')) return 'Remove the trailing slash.';
  return undefined;
}

function looksLikeKey(value: string, kind: 'publishable' | 'secret'): string | undefined {
  if (!value) return undefined;
  const isLegacyJwt = value.startsWith('eyJ');
  const isNew = value.startsWith(kind === 'publishable' ? 'sb_publishable_' : 'sb_secret_');
  if (!isLegacyJwt && !isNew) {
    return kind === 'publishable'
      ? 'Expected a legacy anon key (starts "eyJ") or a new publishable key (starts "sb_publishable_").'
      : 'Expected a legacy service_role key (starts "eyJ") or a new secret key (starts "sb_secret_").';
  }
  if (kind === 'publishable' && value.startsWith('sb_secret_')) {
    return 'This is a SECRET key. It must never be in a NEXT_PUBLIC_ variable — rotate it now.';
  }
  if (kind === 'secret' && value.startsWith('sb_publishable_')) {
    return 'This is the publishable key, not the secret one. Server-side writes will fail.';
  }
  return undefined;
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ missing?: string }>;
}) {
  const { missing } = await searchParams;
  const reportedMissing = (missing ?? '').split(',').filter(Boolean);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const salt = process.env.IP_HASH_SALT ?? '';

  const checks: Check[] = [
    {
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      present: Boolean(url),
      required: true,
      buildTime: true,
      note: 'Supabase → Project Settings → Data API → Project URL',
      problem: looksLikeSupabaseUrl(url),
    },
    {
      name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      present: Boolean(anon),
      required: true,
      buildTime: true,
      note: 'The anon / publishable key. Public by design — RLS is what protects the data.',
      problem: looksLikeKey(anon, 'publishable'),
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      present: Boolean(service),
      required: true,
      buildTime: false,
      note: 'The service_role / secret key. Bypasses RLS entirely — server only, never NEXT_PUBLIC_.',
      problem: looksLikeKey(service, 'secret'),
    },
    {
      name: 'NEXT_PUBLIC_SITE_URL',
      present: Boolean(site),
      required: true,
      buildTime: true,
      note: 'This deployment’s own origin, with scheme and no trailing slash.',
      problem: site && !/^https?:\/\/[^/]+$/.test(site)
        ? 'Must be a bare origin like https://learn.afriorbit.space — no path, no trailing slash.'
        : undefined,
    },
    {
      name: 'IP_HASH_SALT',
      present: Boolean(salt),
      required: true,
      buildTime: false,
      note: 'Any long random string. Generate with: openssl rand -hex 32',
      problem: salt && salt.length < 16 ? 'Too short to be useful. Use at least 32 characters.' : undefined,
    },
    {
      name: 'EMBED_ALLOWED_ORIGINS',
      present: Boolean(process.env.EMBED_ALLOWED_ORIGINS),
      required: false,
      buildTime: false,
      note: 'Origins allowed to iframe /embed/*. Defaults to the afriorbit.space pair.',
    },
    {
      name: 'STRIPE_SECRET_KEY',
      present: Boolean(process.env.STRIPE_SECRET_KEY),
      required: false,
      buildTime: false,
      note: 'Optional. Without it, paid checkout returns 503 and everything else works.',
    },
  ];

  const blocking = checks.filter((c) => c.required && !c.present);
  const warnings = checks.filter((c) => c.present && c.problem);
  const missingAtBuild = blocking.filter((c) => c.buildTime);

  /*
   * The proxy and this page run in different bundles — middleware and the Node
   * server — and are built separately. If the proxy reported a variable
   * missing but this page can read it, that disagreement is not a bug in
   * either one: it is the build-time inlining problem made visible, and it is
   * the single most diagnostic thing this page can show.
   */
  const disagreements = reportedMissing.filter((name) =>
    checks.some((c) => c.name === name && c.present),
  );

  return (
    <main
      id="main"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        maxWidth: '52rem',
        margin: '0 auto',
        padding: '3rem 1.5rem 6rem',
        color: '#131720',
        lineHeight: 1.6,
      }}
    >
      <p style={{ color: '#0f5efc', fontSize: '.75rem', letterSpacing: '.1em', margin: 0 }}>
        AFRIORBIT LMS · CONFIGURATION
      </p>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 1rem', lineHeight: 1.2 }}>
        {blocking.length > 0 ? 'Not configured yet' : 'Configuration looks complete'}
      </h1>

      <p style={{ color: '#525866', margin: '0 0 2rem' }}>
        {blocking.length > 0
          ? 'The app is running, but it cannot reach Supabase. Nothing below reveals a secret value — only whether each variable arrived.'
          : 'Every required variable is present in this deployment. If pages still fail, the cause is downstream: migrations not applied, or the auth hook not enabled.'}
      </p>

      {disagreements.length > 0 && (
        <div
          style={{
            borderLeft: '3px solid #da1e28',
            background: '#fff1f1',
            padding: '1rem 1.15rem',
            margin: '0 0 2rem',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>
            This is a stale build. You do not need to change any values.
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            The request gate says {disagreements.join(' and ')}{' '}
            {disagreements.length > 1 ? 'are' : 'is'} missing, but this page can read{' '}
            {disagreements.length > 1 ? 'them' : 'it'} perfectly well. Those two run in
            separately-built bundles, so the only way they can disagree is that one of them was
            compiled before the variables existed.
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            <strong>Redeploy with the build cache disabled.</strong> Nothing else is wrong.
          </p>
        </div>
      )}

      {missingAtBuild.length > 0 && (
        <div
          style={{
            borderLeft: '3px solid #da1e28',
            background: '#fff1f1',
            padding: '1rem 1.15rem',
            margin: '0 0 2rem',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>Read this before changing anything.</p>
          <p style={{ margin: '.6rem 0 0' }}>
            {missingAtBuild.map((c) => c.name).join(' and ')}{' '}
            {missingAtBuild.length > 1 ? 'are' : 'is'} inlined at <strong>build</strong> time.
            If you have already set {missingAtBuild.length > 1 ? 'them' : 'it'} in your hosting
            dashboard, the value will not appear until you <strong>redeploy</strong> — and the
            redeploy must not reuse the build cache.
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            On Vercel: Deployments → the latest one → ⋯ → Redeploy, and{' '}
            <strong>untick &ldquo;Use existing Build Cache&rdquo;</strong>.
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            Also confirm the variable is enabled for the <strong>Production</strong> environment,
            not only Preview and Development. That is the second most common cause of this page.
          </p>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
        <thead>
          <tr>
            <th style={th}>Variable</th>
            <th style={th}>State</th>
            <th style={th}>When read</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.name}>
              <td style={td}>
                <strong>{c.name}</strong>
                <div style={{ color: '#6f7684', fontSize: '.9em', marginTop: '.2rem' }}>{c.note}</div>
                {c.problem && (
                  <div style={{ color: '#da1e28', marginTop: '.35rem' }}>⚠ {c.problem}</div>
                )}
              </td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                {c.present ? (
                  <span style={{ color: c.problem ? '#b28600' : '#198038' }}>
                    {c.problem ? 'present, suspect' : 'present'}
                  </span>
                ) : (
                  <span style={{ color: c.required ? '#da1e28' : '#6f7684' }}>
                    {c.required ? 'MISSING' : 'not set (optional)'}
                  </span>
                )}
              </td>
              <td style={{ ...td, whiteSpace: 'nowrap', color: '#6f7684' }}>
                {c.buildTime ? 'build' : 'runtime'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {warnings.length === 0 && blocking.length === 0 && (
        <div
          style={{
            borderLeft: '3px solid #198038',
            background: '#f2f9f4',
            padding: '1rem 1.15rem',
            margin: '2rem 0 0',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>Next two things to check, in order.</p>
          <p style={{ margin: '.6rem 0 0' }}>
            <strong>1. Migrations.</strong> Run every file in{' '}
            <code>supabase/migrations/</code> in numeric order, 0001 through 0010, in the Supabase
            SQL editor. Symptom if skipped: pages load but every query errors.
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            <strong>2. The auth hook.</strong> Supabase → Authentication → Hooks → Customize Access
            Token → enable it and select <code>public.custom_access_token_hook</code>. Symptom if
            skipped: you can sign in, but every account behaves as a pending learner and admin
            pages bounce you to the dashboard.
          </p>
        </div>
      )}

      <p style={{ color: '#6f7684', fontSize: '.8rem', marginTop: '2.5rem' }}>
        This page is noindex and reports presence only — no variable value is ever rendered.
        It stops appearing as soon as the required variables are readable at runtime.
      </p>
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '.5rem .6rem',
  borderBottom: '1px solid #d9dce2',
  fontWeight: 400,
  fontSize: '.7rem',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: '#6f7684',
};

const td: React.CSSProperties = {
  textAlign: 'left',
  padding: '.7rem .6rem',
  borderBottom: '1px solid #d9dce2',
  verticalAlign: 'top',
};
