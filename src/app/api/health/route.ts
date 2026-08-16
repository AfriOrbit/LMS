import { NextResponse } from 'next/server';

/**
 * Deployment probe. Answers two questions that are otherwise guesswork:
 *
 *   1. WHICH BUILD IS LIVE — the git SHA and commit message Vercel built from.
 *      Without this there is no way to distinguish "my fix does not work" from
 *      "my fix was never deployed", and those need completely different
 *      responses.
 *
 *   2. WHAT THAT BUILD CAN READ — whether each required variable is non-empty,
 *      separately for values inlined at build time and values read at runtime.
 *
 * It creates no clients, touches no database and imports nothing that can
 * throw, so it answers even when every other route is failing. That is the
 * entire point: a diagnostic that shares a failure mode with the thing it
 * diagnoses is useless.
 *
 * No value is ever returned — only booleans, lengths and a few shape checks.
 * `hasFix` is the specific marker for the build-time-inlining fix, so a glance
 * tells you whether the deployment predates it.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/*
 * Read through a const so the value is inlined at BUILD time, exactly like
 * every other NEXT_PUBLIC_ reference in the app. Reading process.env at
 * request time inside a Node function can see a runtime value that the rest
 * of the bundle never got — which would make this probe disagree with reality
 * in precisely the situation it exists to diagnose.
 */
const BUILD_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
/*
 * Both spellings, matching lib/env.ts. Supabase renamed anon -> publishable
 * and its Vercel integration writes the new name. Reading only the old one
 * here made this probe report "not configured" about an application that was
 * running perfectly — the exact opposite of what a health endpoint is for.
 */
const BUILD_SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const BUILD_ANON_VIA = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    : null;
const BUILD_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? '';

function shape(value: string) {
  if (!value) return { present: false as const };
  return {
    present: true as const,
    length: value.length,
    // Enough to tell a legacy JWT from a new-style key, or to catch a secret
    // key pasted into a public variable. Not enough to reconstruct anything.
    startsWith: value.slice(0, value.startsWith('sb_') ? 15 : 4),
  };
}

/**
 * Names — never values — of the environment variables this function can see.
 *
 * This is the diagnostic that ends the argument. `process.env` inside a Node
 * serverless function contains every variable the platform injected for this
 * environment, whether or not the bundle references it. So:
 *
 *   - name absent entirely  → not set for THIS environment (Production and
 *     Preview are separate; a deployment-specific URL is usually Preview)
 *   - name present but the build-time value is empty → set after the build,
 *     needs a rebuild without cache
 *   - a name that is nearly right → a typo, visible instantly
 *
 * A misspelled variable name is invisible in the Vercel UI, because the UI
 * shows you what you typed and has no idea what the code expects.
 */
function visibleEnvNames(): string[] {
  return Object.keys(process.env)
    .filter(
      (k) =>
        k.startsWith('NEXT_PUBLIC') ||
        k.includes('SUPABASE') ||
        k.startsWith('IP_HASH') ||
        k.startsWith('EMBED_') ||
        k.startsWith('MFA_') ||
        k.startsWith('REGISTRATION_') ||
        k.startsWith('STRIPE_'),
    )
    .sort();
}

/**
 * Each entry is a set of ACCEPTABLE names — any one of them satisfies it.
 * Supabase's newer key names and the legacy ones are interchangeable here.
 * NEXT_PUBLIC_SITE_URL is deliberately absent: it now defaults to the LMS
 * host, so its absence is normal and reporting it as missing would train
 * people to ignore this list.
 */
const EXPECTED: readonly (readonly string[])[] = [
  ['NEXT_PUBLIC_SUPABASE_URL'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'],
  ['IP_HASH_SALT'],
];

export async function GET() {
  const url = BUILD_SUPABASE_URL;

  let urlValid: boolean | string = false;
  if (url) {
    try {
      const parsed = new URL(url);
      urlValid =
        parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co')
          ? true
          : `parsed, but host is "${parsed.hostname}" and protocol "${parsed.protocol}"`;
    } catch {
      urlValid = 'not a parseable URL';
    }
  }

  const buildTime = {
    NEXT_PUBLIC_SUPABASE_URL: { ...shape(url), valid: urlValid, trailingSlash: url.endsWith('/') },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: { ...shape(BUILD_SUPABASE_ANON), resolvedVia: BUILD_ANON_VIA },
    NEXT_PUBLIC_SITE_URL: shape(BUILD_SITE_URL),
  };

  const runtimeOnly = {
    SUPABASE_SERVICE_ROLE_KEY: {
      ...shape(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''),
      resolvedVia: process.env.SUPABASE_SERVICE_ROLE_KEY
        ? 'SUPABASE_SERVICE_ROLE_KEY'
        : process.env.SUPABASE_SECRET_KEY
          ? 'SUPABASE_SECRET_KEY'
          : null,
    },
    IP_HASH_SALT: shape(process.env.IP_HASH_SALT ?? ''),
    EMBED_ALLOWED_ORIGINS: shape(process.env.EMBED_ALLOWED_ORIGINS ?? ''),
  };

  // NEXT_PUBLIC_SITE_URL is optional — it falls back to the LMS host — so its
  // absence must not make the probe report an unhealthy deployment.
  const OPTIONAL_BUILD_KEYS = new Set(['NEXT_PUBLIC_SITE_URL']);
  const blocking = Object.entries(buildTime)
    .filter(([k, v]) => !v.present && !OPTIONAL_BUILD_KEYS.has(k))
    .map(([k]) => k)
    .concat(runtimeOnly.SUPABASE_SERVICE_ROLE_KEY.present ? [] : ['SUPABASE_SERVICE_ROLE_KEY'])
    .concat(runtimeOnly.IP_HASH_SALT.present ? [] : ['IP_HASH_SALT'])
    /*
     * A present-but-unparseable Supabase URL is BLOCKING, not a warning.
     *
     * It was a warning, and the consequence of that was this probe answering
     * 200 while every page of the site returned 500 — because the Supabase
     * client constructor rejects the same value this endpoint was merely
     * tutting about. A health check that says 200 during a total outage is
     * worse than no health check: it sends you looking somewhere else.
     */
    .concat(url && urlValid !== true ? ['NEXT_PUBLIC_SUPABASE_URL (present but invalid)'] : []);

  const anonLooksSecret = BUILD_SUPABASE_ANON.startsWith('sb_secret_');

  const seen = visibleEnvNames();
  const notInjected = EXPECTED.filter((names) => !names.some((n) => seen.includes(n))).map((names) =>
    names.join(' or '),
  );

  /*
   * Set at runtime but empty at build time is the signature of the inlining
   * problem, and it is the one case where changing values is pointless.
   */
  const injectedButNotInlined = (
    [
      ['NEXT_PUBLIC_SUPABASE_URL', BUILD_SUPABASE_URL],
      ['NEXT_PUBLIC_SUPABASE_ANON_KEY', BUILD_SUPABASE_ANON],
      ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', BUILD_SUPABASE_ANON],
      ['NEXT_PUBLIC_SITE_URL', BUILD_SITE_URL],
    ] as const
  )
    .filter(([name, built]) => seen.includes(name) && !built)
    .map(([name]) => name);

  return NextResponse.json(
    {
      ok: blocking.length === 0 && urlValid === true && !anonLooksSecret,

      // Marker for the build-time-inlining fix. If this is false, the running
      // deployment predates it and no amount of changing values will help —
      // it needs a redeploy from the current commit.
      hasFix: true,
      fixName: 'setup-page-and-proxy-guard',

      deployment: {
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
        message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? 'unknown',
        branch: process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown',
        environment: process.env.VERCEL_ENV ?? 'not-vercel',
        region: process.env.VERCEL_REGION ?? 'unknown',
      },

      buildTime,
      runtimeOnly,

      // Names only. Compare `notInjectedForThisEnvironment` against what your
      // dashboard shows — a name here that is not in your dashboard, or in the
      // dashboard but not here, is the whole answer.
      environmentVariableNamesVisible: seen,
      notInjectedForThisEnvironment: notInjected,
      injectedButNotInlined,

      diagnosis:
        notInjected.length > 0
          ? `NOT SET for this environment: ${notInjected.join(', ')}. This deployment's environment is "${process.env.VERCEL_ENV ?? 'unknown'}". In Vercel, Production and Preview are separate scopes — a variable ticked only for Production is genuinely absent from a Preview deployment, and a deployment-specific URL (the one with a random suffix) is usually Preview. Tick all three environments.`
          : injectedButNotInlined.length > 0
            ? `Set, but compiled in as empty: ${injectedButNotInlined.join(', ')}. Do not change the values — they are correct. Redeploy with "Use existing Build Cache" UNTICKED.`
            : 'All expected variables are both injected and inlined.',

      blocking,
      warnings: [
        anonLooksSecret
          ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY holds a SECRET key (sb_secret_…). It is exposed to every visitor. Rotate it immediately.'
          : null,
        urlValid !== true && url ? `NEXT_PUBLIC_SUPABASE_URL: ${urlValid}` : null,
        url.endsWith('/') ? 'NEXT_PUBLIC_SUPABASE_URL has a trailing slash. Remove it.' : null,
      ].filter(Boolean),

      nextStep:
        url && urlValid !== true
          ? `NEXT_PUBLIC_SUPABASE_URL is set but is not a usable URL (${urlValid}). It must be the full origin including the scheme — https://<project-ref>.supabase.co — not the bare hostname, not the dashboard link. Fix it, then redeploy with "Use existing Build Cache" UNTICKED.`
          : blocking.length > 0
          ? 'Set the listed variables for the Production environment, then redeploy with "Use existing Build Cache" UNTICKED. Build-time variables do not change without a rebuild.'
          : 'Config looks complete. Next: apply migrations 0001-0010 in the Supabase SQL editor, then enable Authentication → Hooks → Customize Access Token → public.custom_access_token_hook.',
    },
    {
      status: blocking.length === 0 ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  );
}
