/**
 * build-combined-migration.mjs — one file to paste into the Supabase SQL editor.
 *
 * WHY THIS EXISTS
 *
 * There are twelve migrations and they must be applied in filename order.
 * Applying some of them is worse than applying none: the app half-works, and
 * the failures it produces (a 404 on a table that exists, an RLS denial on a
 * row you own) point everywhere except at the real cause.
 *
 * Twelve copy-pastes into a browser SQL editor, in order, without losing your
 * place, is a task that people fail at. So this concatenates them, and adds
 * the two things a concatenation needs to be safe:
 *
 *   1. RE-RUN GUARDS ON POLICIES. Every other statement in these migrations is
 *      already idempotent — `create table if not exists`, `create or replace
 *      function`, `do $$ ... exception when duplicate_object` around enums,
 *      seeds keyed `on conflict do update`. Policies are the exception:
 *      Postgres has no `create policy if not exists`, so a second run dies on
 *      `policy "profiles_self_select" for table "profiles" already exists`.
 *      A `drop policy if exists` is emitted before each one. Dropping and
 *      recreating a policy inside the same transaction is not a security gap —
 *      the table's RLS stays enabled throughout and nothing commits in between.
 *
 *   2. A VERIFICATION QUERY AT THE END. The Supabase editor shows the result of
 *      the LAST statement, so the last statement is made worth reading: a
 *      table-by-table census with a verdict column.
 *
 * Run:  node scripts/build-combined-migration.mjs
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/*
 * `--check` verifies the generated files match the migrations instead of
 * writing them, and runs in `verify`.
 *
 * A generated file committed alongside its source drifts the first time
 * someone edits the source and forgets to regenerate — and this particular
 * drift is invisible, because both files are valid SQL and the stale one still
 * applies cleanly. It just applies the OLD schema, which is the worst possible
 * outcome for a file whose entire purpose is "paste this and the database is
 * correct".
 */
const CHECK = process.argv.includes('--check');
const drift = [];

function emit(path, content) {
  if (!CHECK) {
    writeFileSync(path, content);
    return;
  }
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current !== content) drift.push(path.replace(root, ''));
}

const root = fileURLToPath(new URL('..', import.meta.url));
const migrationsDir = join(root, 'supabase', 'migrations');
const outDir = join(root, 'supabase', 'apply');
mkdirSync(outDir, { recursive: true });

const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

if (files.length === 0) throw new Error('no migrations found');

/**
 * Insert `drop policy if exists` ahead of every `create policy`.
 *
 * Deliberately conservative: the pattern requires the policy name and the
 * qualified table on the same line, which is how every one of these is
 * written. A `create policy` that does not match is left alone rather than
 * rewritten on a guess — a wrong DROP is far more dangerous than a missing one.
 */
function guardPolicies(sql, file) {
  let guarded = 0;
  let unmatched = 0;

  /*
   * `[^]*?` rather than `.*?` because the preceding-line lookbehind has to be
   * able to see across the newline. The optional group captures a drop that the
   * migration already wrote for itself — several do — so the output does not
   * end up with the same DROP twice.
   */
  const out = sql.replace(
    /^([ \t]*)create policy[ \t]+("?[A-Za-z0-9_]+"?)[ \t]+on[ \t]+([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)/gm,
    (whole, indent, name, table, offset, whole_string) => {
      const before = whole_string.slice(0, offset).trimEnd();
      const previous = before.slice(before.lastIndexOf('\n') + 1).trim().toLowerCase();
      if (previous === `drop policy if exists ${name} on ${table};`.toLowerCase()) {
        return whole; // already guarded by the migration itself
      }
      guarded += 1;
      return `${indent}drop policy if exists ${name} on ${table};\n${whole}`;
    },
  );

  for (const line of sql.split('\n')) {
    /*
     * `create policy %I on public.%I` is a format() template inside a DO block,
     * not a statement. 0009 builds nine admin policies that way and emits its
     * own `drop policy if exists %I` immediately before, so it is already
     * re-runnable. Rewriting a format string would produce a SQL syntax error
     * rather than a guard.
     */
    if (line.includes('%I')) continue;
    if (
      /^[ \t]*create policy\b/.test(line) &&
      !/^[ \t]*create policy[ \t]+"?[A-Za-z0-9_]+"?[ \t]+on[ \t]+[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*/.test(
        line,
      )
    ) {
      unmatched += 1;
      console.warn(`  !  ${file}: create policy not on one line, left unguarded:\n     ${line.trim()}`);
    }
  }

  return { out, guarded, unmatched };
}

const banner = (n, total, file, bytes) => `
-- =============================================================================
-- =============================================================================
--
--   PART ${String(n).padStart(2, '0')} OF ${total}   ${file}   (${bytes.toLocaleString()} bytes)
--
-- =============================================================================
-- =============================================================================
`;

const HEAD = `-- ============================================================================
-- AfriOrbit LMS — COMPLETE DATABASE SCHEMA
--
-- GENERATED. Do not edit. Source: supabase/migrations/*.sql
-- Rebuild with: node scripts/build-combined-migration.mjs
--
-- ---------------------------------------------------------------------------
-- HOW TO RUN THIS
-- ---------------------------------------------------------------------------
--
--   1. Supabase dashboard → SQL Editor → New query
--   2. Paste this entire file
--   3. Run
--   4. Read the table that appears at the bottom. Every row should say OK.
--
-- It takes 10-30 seconds. The editor may look frozen while it works.
--
-- ---------------------------------------------------------------------------
-- SAFE TO RUN TWICE
-- ---------------------------------------------------------------------------
--
-- Every statement is guarded — tables with IF NOT EXISTS, functions with OR
-- REPLACE, enums inside an exception handler, policies with a DROP IF EXISTS
-- ahead of them, seed data keyed ON CONFLICT DO UPDATE. If the run fails
-- partway, fix the reported error and paste the whole thing again. You do not
-- need to work out where it stopped.
--
-- Seed content (courses, modules, lessons, quiz questions) is UPSERTED by
-- slug, so re-running restores the shipped curriculum to its original text.
-- Learner data — accounts, enrolments, progress, attempts, certificates — is
-- never touched by this file.
--
-- ---------------------------------------------------------------------------
-- ONE THING THIS FILE CANNOT DO
-- ---------------------------------------------------------------------------
--
-- Part 08 creates \`public.custom_access_token_hook\`, which puts the account's
-- role and status into the JWT. Creating it is not the same as enabling it,
-- and enabling it is a dashboard setting with no SQL equivalent:
--
--   Authentication → Hooks → Customize Access Token (JWT) → select
--   public.custom_access_token_hook → Enable
--
-- Skip that and sign-in appears to work while every page treats the account as
-- having no role — which reads like a permissions bug and is not one.
-- ============================================================================

`;

let body = '';
let totalGuarded = 0;
let totalUnmatched = 0;

files.forEach((file, i) => {
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  const { out, guarded, unmatched } = guardPolicies(sql, file);
  totalGuarded += guarded;
  totalUnmatched += unmatched;
  body += banner(i + 1, files.length, file, sql.length);
  body += '\n' + out.trimEnd() + '\n\n';
  console.log(`  +  ${file}  ${String(sql.length).padStart(7)} bytes  ${guarded} policies guarded`);
});

/**
 * The final statement, because the SQL editor shows only the last result.
 *
 * A bare "did it work?" is not answerable by eye across 40-odd tables, so this
 * checks the specific objects whose absence produces a confusing failure and
 * gives each one a verdict. `profiles` missing is why registration 500s;
 * `handle_new_user` missing is why an account exists in auth.users with no
 * profile row; the hook function missing is why roles never appear in the JWT.
 */
const VERIFY = `
-- =============================================================================
-- VERIFICATION — this is the result you should be looking at.
-- =============================================================================

with expected(kind, name) as (values
  ('table','profiles'), ('table','tracks'), ('table','courses'), ('table','modules'),
  ('table','lessons'), ('table','enrollments'), ('table','lesson_progress'),
  ('table','quizzes'), ('table','quiz_questions'), ('table','quiz_attempts'),
  ('table','certificates'), ('table','cohorts'), ('table','hardware_kits'),
  ('table','lab_sessions'), ('table','lab_reports'), ('table','lab_assignments'),
  ('table','orders'), ('table','invitations'), ('table','audit_log'),
  ('table','rate_limits'), ('table','email_domains'), ('table','hardware_products'),
  ('table','quote_requests'),
  ('function','handle_new_user'), ('function','custom_access_token_hook')
)
select
  e.kind,
  e.name,
  case
    when e.kind = 'table' then
      case when to_regclass('public.' || e.name) is not null then 'OK' else 'MISSING' end
    else
      case when exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.proname = e.name and n.nspname in ('public','app')
      ) then 'OK' else 'MISSING' end
  end as status,
  case
    when e.kind = 'table' and to_regclass('public.' || e.name) is not null then
      (select count(*) from pg_policy where polrelid = to_regclass('public.' || e.name))
    else null
  end as policies,
  case
    when e.kind = 'table' and to_regclass('public.' || e.name) is not null then
      (select relrowsecurity from pg_class where oid = to_regclass('public.' || e.name))
    else null
  end as rls_enabled
from expected e
order by
  case when e.kind = 'table' and to_regclass('public.' || e.name) is null then 0
       when e.kind = 'function' then 1 else 2 end,
  e.kind, e.name;
`;

const combined = HEAD + body + VERIFY;
emit(join(outDir, 'RUN_ALL_MIGRATIONS.sql'), combined);

/*
 * The same census, on its own, changing nothing. Run it first to see what the
 * database already has, and again afterwards to confirm. Being able to check
 * without applying is what makes "have the migrations run?" a question with an
 * answer rather than a guess.
 */
emit(
  join(outDir, 'PREFLIGHT.sql'),
  `-- ============================================================================
-- AfriOrbit LMS — what does this database already contain?
--
-- Read-only. Creates nothing, changes nothing. Paste into the Supabase SQL
-- editor and run.
--
-- Everything MISSING  → the schema has never been applied. Run
--                       RUN_ALL_MIGRATIONS.sql.
-- Everything OK       → the schema is in place. If the app still fails, the
--                       cause is elsewhere: the access-token hook is probably
--                       not enabled (Authentication → Hooks).
-- A mixture           → a half-applied database. Run RUN_ALL_MIGRATIONS.sql;
--                       it is written to be safe over a partial schema.
--
-- \`rls_enabled\` false on a table that exists is worth noticing on its own —
-- that table's rows are readable by anyone holding the publishable key.
-- ============================================================================
${VERIFY}`,
);

/*
 * Chunked fallback. A 300 kB paste is fine in principle and occasionally is not
 * in practice — browsers and the editor both have opinions. Three parts split
 * on natural seams: schema, then RLS and seeds, then the real curriculum.
 */
const SPLITS = [
  { upto: '0006', label: 'schema and row-level security' },
  { upto: '0010', label: 'seed curriculum, JWT hook, commerce catalogue' },
  { upto: '9999', label: 'the real AfriOrbit curriculum and the archive-access fix' },
];

let cursor = 0;
SPLITS.forEach((split, idx) => {
  const take = [];
  while (cursor < files.length && files[cursor].slice(0, 4) <= split.upto) {
    take.push(files[cursor]);
    cursor += 1;
  }
  if (take.length === 0) return;

  let part = `-- ============================================================================
-- AfriOrbit LMS — schema, part ${idx + 1} of ${SPLITS.length}: ${split.label}
--
-- Use these three files ONLY if RUN_ALL_MIGRATIONS.sql is too large to paste.
-- Run them in order, ${take[0]} first. Each is safe to re-run.
-- Contains: ${take.join(', ')}
-- ============================================================================

`;
  take.forEach((file, i) => {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    part += banner(i + 1, take.length, file, sql.length);
    part += '\n' + guardPolicies(sql, file).out.trimEnd() + '\n\n';
  });
  if (idx === SPLITS.length - 1) part += VERIFY;
  emit(join(outDir, `RUN_PART_${idx + 1}.sql`), part);
  console.log(`  =  RUN_PART_${idx + 1}.sql  ${take.length} migrations`);
});

if (totalUnmatched > 0) {
  console.error(`\n${totalUnmatched} create policy statement(s) could not be guarded — see warnings above.`);
  process.exit(1);
}

if (CHECK) {
  if (drift.length === 0) {
    console.log(
      `PASS  supabase/apply/ matches the ${files.length} migrations (${totalGuarded} policy guards)`,
    );
    process.exit(0);
  }
  console.error(`
STALE GENERATED SQL — supabase/apply/ no longer matches supabase/migrations/.

${drift.map((d) => `  ${d}`).join('\n')}

A migration changed and the pasteable bundle was not rebuilt. Both files are
valid SQL, so nothing would fail — the bundle would just install the OLD schema,
silently, on a database whose owner believes it is current.

FIX:

    npm run db:bundle
`);
  process.exit(1);
}

console.log(`
RUN_ALL_MIGRATIONS.sql  ${combined.length.toLocaleString()} bytes  ${files.length} migrations  ${totalGuarded} policy guards`);
