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
 * No SECRET value is ever rendered — not even a masked one for the service role
 * key, because a length and a prefix are enough to narrow a brute force and
 * this page is unauthenticated by necessity: it has to work before anything
 * else does. The two `NEXT_PUBLIC_` URLs are shown verbatim, which is a
 * deliberate exception argued out at `showValue` below.
 */

type Check = {
  name: string;
  present: boolean;
  required: boolean;
  buildTime: boolean;
  note: string;
  problem?: string;
  /**
   * The value as the running code received it — set ONLY for variables that are
   * public by definition. See `showValue` below for why this exists and why the
   * keys will never have it.
   */
  received?: string;
};

/**
 * WHY A VALUE IS PRINTED HERE AT ALL, HAVING SAID IT NEVER WOULD BE.
 *
 * This page reported "not a valid URL" three times running and the variable
 * still did not get fixed, which is not a failure of attention. The value looks
 * perfect in the hosting dashboard, because the things that break it are
 * invisible there: a missing scheme reads fine to a human, and a trailing
 * newline, a smart quote or a zero-width character from a copy-paste cannot be
 * seen at all. Being told "wrong" repeatedly without being shown *what is
 * there* is a loop with no exit.
 *
 * It is only ever called for `NEXT_PUBLIC_*` variables. Those are compiled into
 * the JavaScript bundle every visitor downloads — they are already public, and
 * withholding them here protects nothing while costing the diagnosis. The anon
 * key is excluded anyway: technically public, but long, and printing it invites
 * someone to paste this screenshot into a chat thread.
 *
 * `JSON.stringify` does the real work. It renders a newline as \n, shows the
 * quotes as characters if quotes were pasted in, and makes trailing spaces
 * countable.
 */
function showValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return JSON.stringify(raw);
}

/**
 * Whitespace inside a value is invisible in every dashboard and catastrophic in
 * one specific place: a trailing newline on the Supabase URL made `Headers.set`
 * throw on the CSP, which 500'd every route while the build stayed green. The
 * code now trims and re-parses so it cannot happen again, but a value with
 * stray whitespace is still a paste error worth reporting, because the same
 * newline will be sitting on the key too.
 */
function whitespaceProblem(raw: string | undefined, label: string): string | undefined {
  if (!raw) return undefined;
  if (raw !== raw.trim()) {
    const kind = /[\r\n]/.test(raw) ? 'a line break' : 'leading or trailing spaces';
    return `This value has ${kind} around it. Re-copy it — select the text precisely, or use the copy button in the ${label} dashboard rather than dragging to select.`;
  }
  if (/[\r\n]/.test(raw)) return 'This value contains a line break in the middle. It has been pasted wrong.';
  return undefined;
}

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
  // Both spellings. Supabase renamed anon -> publishable and service_role ->
  // secret, and its Vercel integration writes the new names. Reporting only
  // the old ones would tell someone a variable is missing while it is sitting
  // right there in their dashboard under a different name.
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  const anonVia = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
      : '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '';
  const serviceVia = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? 'SUPABASE_SERVICE_ROLE_KEY'
    : process.env.SUPABASE_SECRET_KEY
      ? 'SUPABASE_SECRET_KEY'
      : '';
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const salt = process.env.IP_HASH_SALT ?? '';

  const checks: Check[] = [
    {
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      present: Boolean(url),
      required: true,
      buildTime: true,
      note: 'Supabase → Project Settings → Data API → Project URL',
      problem: whitespaceProblem(process.env.NEXT_PUBLIC_SUPABASE_URL, 'Supabase') ?? looksLikeSupabaseUrl(url),
      received: showValue(process.env.NEXT_PUBLIC_SUPABASE_URL),
    },
    {
      name: anonVia || 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      present: Boolean(anon),
      required: true,
      buildTime: true,
      note:
        'The anon / publishable key. Public by design — RLS is what protects the data. ' +
        'Either NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        '(the name the Supabase Vercel integration writes) will do.',
      problem:
        whitespaceProblem(
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          'Supabase',
        ) ?? looksLikeKey(anon, 'publishable'),
    },
    {
      name: serviceVia || 'SUPABASE_SERVICE_ROLE_KEY',
      present: Boolean(service),
      required: true,
      buildTime: false,
      note:
        'The service_role / secret key. Bypasses RLS entirely — server only, never NEXT_PUBLIC_. ' +
        'Either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY (the newer name, written ' +
        'by the Supabase Vercel integration) will do.',
      problem:
        whitespaceProblem(
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
          'Supabase',
        ) ?? looksLikeKey(service, 'secret'),
    },
    {
      name: 'NEXT_PUBLIC_SITE_URL',
      present: Boolean(site),
      required: false,
      buildTime: true,
      note:
        'Optional — defaults to https:// + NEXT_PUBLIC_LMS_HOST. This means THIS app’s ' +
        'origin (the learning platform), not the marketing site’s.',
      problem: site && !/^https?:\/\/[^/]+$/.test(site)
        ? 'Must be a bare origin like https://learn.afriorbit.space — no path, no trailing slash. ' +
          'It is optional: the simplest fix is to DELETE this variable entirely and let it derive ' +
          'itself from NEXT_PUBLIC_LMS_HOST.'
        : undefined,
      received: showValue(process.env.NEXT_PUBLIC_SITE_URL),
    },
    {
      name: 'IP_HASH_SALT',
      present: Boolean(salt),
      required: true,
      buildTime: false,
      note:
        'Any long random string. Generate with: openssl rand -hex 32. ' +
        'NOT a Supabase variable — the Supabase Vercel integration will never ' +
        'create it, so if you delete it while re-syncing, you must add it back by hand.',
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

  /*
   * A REQUIRED VARIABLE THAT IS PRESENT BUT UNUSABLE IS BLOCKING.
   *
   * This read `c.required && !c.present`, and the omission had teeth. With
   * NEXT_PUBLIC_SUPABASE_URL set to a bare hostname, this page printed the
   * headline "Configuration looks complete", the paragraph "Every required
   * variable is present", and — because the proxy had redirected here — the
   * stale-build panel saying in bold "You do not need to change any values …
   * Nothing else is wrong." Every word of that was false, and it pointed at
   * the wrong fix. The correct diagnosis was in the table lower down, in small
   * red text, under a headline telling the reader to ignore it.
   *
   * `problem` for a required variable now counts as blocking, so the summary
   * and the detail cannot contradict each other.
   */
  const blocking = checks.filter((c) => c.required && (!c.present || Boolean(c.problem)));
  const unusable = checks.filter((c) => c.required && c.present && c.problem);
  const warnings = checks.filter((c) => c.present && c.problem && !c.required);
  const missingAtBuild = blocking.filter((c) => c.buildTime && !c.present);

  /*
   * The proxy and this page run in different bundles — middleware and the Node
   * server — and are built separately. If the proxy reported a variable
   * missing but this page can read it, that disagreement is not a bug in
   * either one: it is the build-time inlining problem made visible, and it is
   * the single most diagnostic thing this page can show.
   */
  // `&& !c.problem` matters: the proxy also redirects here when a value is
  // present but unusable, and without that clause this page would read the
  // redirect as a bundle disagreement and confidently diagnose a stale build.
  const disagreements = reportedMissing.filter((name) =>
    checks.some((c) => c.name === name && c.present && !c.problem),
  );

  /*
   * Names — never values — that the platform actually injected. A variable
   * whose name is absent here is not set for THIS environment, which is a
   * different problem from one that is set but compiled in empty, and the two
   * have opposite fixes. The Vercel UI cannot show this distinction because it
   * displays what you typed, not what the running code received.
   */
  const injectedNames = Object.keys(process.env)
    .filter(
      (k) =>
        k.startsWith('NEXT_PUBLIC') ||
        k.includes('SUPABASE') ||
        k.startsWith('POSTGRES_') ||
        k.startsWith('IP_HASH') ||
        k.startsWith('EMBED_'),
    )
    .sort();

  /*
   * Which deployment is this, actually?
   *
   * When the list above comes back empty the natural next question is whether
   * the variables are on a DIFFERENT Vercel project from the one being looked
   * at — easy to do the moment a second project exists for the same repo, and
   * impossible to tell from a *.vercel.app URL. Vercel injects these on every
   * deployment it builds, so they identify the project without revealing
   * anything, and their ABSENCE says something too: it means this is not a
   * Vercel deployment at all.
   */
  const deployment = {
    project: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '',
    env: process.env.VERCEL_ENV ?? '',
    repo: [process.env.VERCEL_GIT_REPO_OWNER, process.env.VERCEL_GIT_REPO_SLUG]
      .filter(Boolean)
      .join('/'),
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? '',
    sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
  };
  const onVercel = Boolean(process.env.VERCEL);

  // POSTGRES_* and SUPABASE_JWT_SECRET are written only by the Supabase Vercel
  // integration, never by hand. Seeing them proves the integration reached
  // this project; not seeing them, when someone believes they connected it,
  // means it is wired to a different project.
  const integrationLinked = injectedNames.some(
    (k) => k.startsWith('POSTGRES_') || k === 'SUPABASE_JWT_SECRET',
  );

  const requiredNames = checks.filter((c) => c.required).map((c) => c.name);
  const neverInjected = requiredNames.filter((n) => !injectedNames.includes(n));
  const injectedButEmpty = requiredNames.filter(
    (n) => injectedNames.includes(n) && !checks.find((c) => c.name === n)?.present,
  );
  const vercelEnv = process.env.VERCEL_ENV ?? null;

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

      {unusable.length > 0 && (
        <div
          style={{
            borderLeft: '3px solid #da1e28',
            background: '#fff1f1',
            padding: '1rem 1.15rem',
            margin: '0 0 2rem',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>
            {unusable.length > 1 ? 'These variables are' : 'This variable is'} set, but the value
            cannot be used.
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            <strong>{unusable.map((c) => c.name).join(', ')}</strong>
          </p>
          {unusable.map((c) => (
            <p key={c.name} style={{ margin: '.6rem 0 0' }}>
              {c.problem}
            </p>
          ))}
          <p style={{ margin: '.6rem 0 0' }}>
            This is <em>not</em> a stale build and not a missing variable — the value itself is
            wrong. Correct it in your hosting dashboard and redeploy with the build cache
            disabled, because <code>NEXT_PUBLIC_</code> values are compiled in.
          </p>
          <p style={{ margin: '.6rem 0 0', color: '#525866' }}>
            The Supabase project URL is the <strong>Project URL</strong> field under Project
            Settings → Data API. It looks like{' '}
            <code>https://abcdefghijklmnop.supabase.co</code> — with the scheme, no trailing
            slash. It is not the address of the Supabase dashboard, and not the database
            connection string.
          </p>
        </div>
      )}

      {neverInjected.length > 0 && (
        <div
          style={{
            borderLeft: '3px solid #da1e28',
            background: '#fff1f1',
            padding: '1rem 1.15rem',
            margin: '0 0 2rem',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>
            These variables were never handed to this deployment at all.
          </p>
          <p style={{ margin: '.6rem 0 0', fontFamily: 'inherit' }}>
            <strong>{neverInjected.join(', ')}</strong>
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            Not empty — <em>absent</em>. The platform never set them, so a rebuild alone will not
            help.
            {vercelEnv ? (
              <>
                {' '}
                This deployment&rsquo;s environment is <strong>{vercelEnv}</strong>.
              </>
            ) : null}
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            On Vercel, <strong>Production and Preview are separate scopes</strong>. A variable
            ticked only for Production is genuinely missing from a Preview deployment — and the
            URL with a random suffix in it, like the one you are probably reading this on, is a
            Preview deployment. Open Settings → Environment Variables and make sure all three
            boxes (Production, Preview, Development) are ticked for every variable, then redeploy.
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            If the boxes are already ticked, compare the spelling below against your dashboard. A
            typo in a variable <em>name</em> is invisible in the Vercel UI, because the UI shows
            what you typed and cannot know what the code expects.
          </p>
          <p style={{ margin: '.9rem 0 0', fontSize: '.8rem', color: '#525866' }}>
            Names this deployment can see (values never shown):
          </p>
          <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', wordBreak: 'break-all' }}>
            {injectedNames.length > 0 ? injectedNames.join(' · ') : '(none at all)'}
          </p>

          <p style={{ margin: '.9rem 0 0', fontSize: '.8rem', color: '#525866' }}>
            Which deployment this is:
          </p>
          <p style={{ margin: '.25rem 0 0', fontSize: '.8rem', wordBreak: 'break-all' }}>
            {onVercel
              ? [
                  deployment.project && `project ${deployment.project}`,
                  deployment.env && `environment ${deployment.env}`,
                  deployment.repo && `repo ${deployment.repo}`,
                  deployment.branch && `branch ${deployment.branch}`,
                  deployment.sha && `commit ${deployment.sha}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'on Vercel, but it published no project metadata'
              : 'not a Vercel deployment — no VERCEL environment variables present'}
          </p>
          {onVercel && !integrationLinked && (
            <p style={{ margin: '.9rem 0 0', fontSize: '.8rem', color: '#8a5a00' }}>
              No <code>POSTGRES_*</code> or <code>SUPABASE_JWT_SECRET</code> here, which
              means the Supabase Vercel integration is <strong>not</strong> connected to
              this project. If you believe you connected it, it is attached to a different
              Vercel project — check the project name above against the one in Supabase →
              Integrations.
            </p>
          )}
        </div>
      )}

      {injectedButEmpty.length > 0 && neverInjected.length === 0 && (
        <div
          style={{
            borderLeft: '3px solid #b28600',
            background: '#fffbf0',
            padding: '1rem 1.15rem',
            margin: '0 0 2rem',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>
            Set correctly, but compiled in as empty. Do not change the values.
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            <strong>{injectedButEmpty.join(', ')}</strong> reached this deployment, so the values
            themselves are fine. They were simply not present when this bundle was built.
          </p>
          <p style={{ margin: '.6rem 0 0' }}>
            Redeploy with <strong>&ldquo;Use existing Build Cache&rdquo; unticked</strong>. Nothing
            else needs to change.
          </p>
        </div>
      )}

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
                {c.received && (
                  <div style={{ marginTop: '.35rem' }}>
                    <span style={{ color: '#6f7684' }}>Value received: </span>
                    <code
                      style={{
                        background: '#f2f4f8',
                        padding: '.1rem .3rem',
                        wordBreak: 'break-all',
                      }}
                    >
                      {c.received}
                    </code>
                    <div style={{ color: '#6f7684', fontSize: '.85em', marginTop: '.2rem' }}>
                      Shown inside quotes and with escapes, so a stray space, a line break
                      (<code>\n</code>) or a quote character that was pasted in is visible. This is
                      a NEXT_PUBLIC_ value — already public in the browser bundle.
                    </div>
                  </div>
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
