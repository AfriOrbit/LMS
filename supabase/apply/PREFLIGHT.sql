-- ============================================================================
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
-- `rls_enabled` false on a table that exists is worth noticing on its own —
-- that table's rows are readable by anyone holding the publishable key.
-- ============================================================================

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
