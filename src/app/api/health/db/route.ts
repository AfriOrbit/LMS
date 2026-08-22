import { NextResponse } from 'next/server';

/**
 * Does the DATABASE work? — the question /api/health deliberately cannot answer.
 *
 * `/api/health` creates no clients and touches nothing, on purpose: a
 * diagnostic that shares a failure mode with the thing it diagnoses is
 * useless. The cost of that decision is that it reports `ok: true` about a
 * deployment whose every page 500s, because the configuration really is
 * correct and the schema really is absent. Both statements are true and
 * together they are maddening.
 *
 * So this one connects for real, runs the cheapest possible query against each
 * table the app cannot start without, and reports the Postgres error CODE. The
 * code is the whole diagnosis:
 *
 *   42P01  undefined_table         the migrations have never been applied
 *   42501  insufficient_privilege  RLS is on and no policy grants this read
 *   42883  undefined_function      the schema is half-applied
 *   PGRST  (any)                   PostgREST could not route the request —
 *                                  usually the URL is an endpoint, not the origin
 *   fetch failure                  the project is paused, or the URL is wrong
 *
 * That turns "open the Runtime Logs and search for a digest" — which requires
 * dashboard access, knowing which tab, and reloading the broken page while the
 * stream is live — into loading a URL.
 *
 * NOTHING FROM ANY ROW IS RETURNED. Only counts, error codes and the messages
 * Postgres itself produced, which describe schema rather than content.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Tables whose absence explains a specific broken page. */
const PROBES: readonly { table: string; why: string }[] = [
  { table: 'profiles', why: 'registration, sign-in and every authenticated page' },
  { table: 'courses', why: 'the catalog and the dashboard' },
  { table: 'lessons', why: 'course pages' },
  { table: 'enrollments', why: 'the dashboard and lesson access' },
  { table: 'audit_log', why: 'registration (it writes an audit row and fails if it cannot)' },
];

interface ProbeResult {
  table: string;
  ok: boolean;
  rows: number | null;
  code: string | null;
  message: string | null;
  why: string;
}

/**
 * Postgres and PostgREST codes translated into the thing to actually do.
 * A bare `42P01` is precise and tells a non-DBA nothing.
 */
function explain(code: string | null, message: string | null): string | null {
  if (!code) return null;
  if (code === '42P01')
    return 'THE SCHEMA HAS NEVER BEEN APPLIED. Supabase → SQL Editor → paste supabase/apply/RUN_ALL_MIGRATIONS.sql → Run.';
  if (code === '42883')
    return 'A function is missing while tables exist — the schema is half-applied. Re-run RUN_ALL_MIGRATIONS.sql in full; it is safe over a partial schema.';
  if (code === '42501' || code === 'PGRST301')
    return 'The table exists but this key may not read it. Expected for a service-role probe only if the key is wrong — check SUPABASE_SERVICE_ROLE_KEY is the secret key, not the publishable one.';
  if (code.startsWith('PGRST'))
    return `PostgREST rejected the request (${code}). If this is PGRST002 the schema cache is stale — Supabase → Settings → API → Restart. Otherwise check that NEXT_PUBLIC_SUPABASE_URL is the bare origin https://<ref>.supabase.co with no path.`;
  if (code === 'ENOTFOUND' || code === 'FETCH_FAILED')
    return 'Could not reach the project at all. Either the URL is wrong or the Supabase project is PAUSED — free projects pause after a week of inactivity and resume from the dashboard.';
  return message;
}

export async function GET() {
  const started = Date.now();

  /*
   * Imported inside the handler, not at module scope.
   *
   * These modules throw when configuration is absent, and a throw at module
   * scope is an unhandled 500 with no body — which would make this endpoint
   * fail exactly the way the pages it is diagnosing fail, and tell the reader
   * nothing. Inside the handler the throw is catchable and becomes a report.
   */
  let client: import('@supabase/supabase-js').SupabaseClient;
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin');
    client = createSupabaseAdminClient();
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'client-construction',
        detail: error instanceof Error ? error.message : String(error),
        nextStep:
          'The Supabase client could not even be created, which is configuration rather than schema. Load /api/health and act on its blocking list first.',
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const probes: ProbeResult[] = [];

  for (const { table, why } of PROBES) {
    try {
      /*
       * `head: true` with an exact count sends no rows over the wire at all —
       * the answer is a Content-Range header. So this stays cheap on a large
       * table and cannot leak a single field of anyone's data.
       */
      const { count, error } = await client
        .from(table)
        .select('*', { count: 'exact', head: true });

      probes.push({
        table,
        ok: !error,
        rows: count ?? null,
        code: error?.code ?? null,
        message: error?.message ?? null,
        why,
      });
    } catch (error) {
      // A thrown error rather than a returned one means the request never
      // completed — DNS, TLS, a paused project.
      probes.push({
        table,
        ok: false,
        rows: null,
        code: 'FETCH_FAILED',
        message: error instanceof Error ? error.message : String(error),
        why,
      });
    }
  }

  /*
   * The access-token hook is the one failure that looks like a permissions bug
   * and is not. Its absence is checkable: the function either exists or it does
   * not, and `custom_access_token_hook` lives in `public`.
   */
  let hookFunction: { present: boolean; detail: string | null } = {
    present: false,
    detail: 'not checked',
  };
  try {
    const { error } = await client.rpc('custom_access_token_hook', {
      event: { user_id: '00000000-0000-0000-0000-000000000000', claims: {} },
    });
    // Any response other than "function does not exist" means it is there.
    hookFunction = {
      present: error?.code !== '42883' && error?.code !== 'PGRST202',
      detail: error?.message ?? null,
    };
  } catch (error) {
    hookFunction = { present: false, detail: error instanceof Error ? error.message : String(error) };
  }

  const failed = probes.filter((p) => !p.ok);
  const firstCode = failed[0]?.code ?? null;
  const allMissing = failed.length === probes.length && firstCode === '42P01';

  return NextResponse.json(
    {
      ok: failed.length === 0,
      checkedIn: `${Date.now() - started}ms`,

      summary: allMissing
        ? 'EMPTY DATABASE — none of the application tables exist.'
        : failed.length === 0
          ? 'Every table the app needs is present and readable.'
          : `${failed.length} of ${probes.length} tables are unreadable — a partially applied schema.`,

      probes,

      accessTokenHookFunction: {
        ...hookFunction,
        note: hookFunction.present
          ? 'The function exists. Creating it is not the same as enabling it — Authentication → Hooks → Customize Access Token must also point at it, and there is no way to verify that from SQL.'
          : 'Missing. Sign-in will appear to work while every account reads as a roleless learner.',
      },

      nextStep:
        failed.length === 0
          ? hookFunction.present
            ? 'Database is fine. If a page still 500s, the cause is in the page — get the Error reference from the page and search the Runtime Logs for it.'
            : 'Tables are fine but the access-token hook function is missing. Re-run RUN_ALL_MIGRATIONS.sql in full.'
          : explain(firstCode, failed[0]?.message ?? null),
    },
    { status: failed.length === 0 ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
