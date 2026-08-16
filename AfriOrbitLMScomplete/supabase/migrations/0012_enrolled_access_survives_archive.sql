-- =============================================================================
-- 0012_enrolled_access_survives_archive.sql
-- -----------------------------------------------------------------------------
-- Fixes a real access bug that migration 0011 exposed.
--
-- THE BUG
--   `can_read_lesson()` was written correctly: an active or completed
--   enrolment entitles you to the lesson body, with no reference to the
--   course's publication status. That is the right rule.
--
--   But the row-level policy underneath it disagreed:
--
--     create policy lessons_select on public.lessons
--       using (app.is_staff()
--              or exists (select 1 from public.courses c
--                          where c.id = course_id and c.status = 'published'));
--
--   The view is `security_invoker`, so the row policy runs first. The moment an
--   admin archives a course, every enrolled learner stops seeing the rows at
--   all — the entitlement function never gets a chance to say yes.
--
--   The practical consequence: archive a course and anyone halfway through it
--   silently loses the material they are partway through, and in the paid case,
--   material they have bought. They keep the enrolment row and the progress
--   record, so the dashboard cheerfully reports "43% complete" against a course
--   whose lessons have vanished.
--
--   This surfaced because 0011 archived the placeholder curriculum from 0007
--   while a test learner was enrolled in it. It would otherwise have surfaced
--   in production, on the first course anyone retired.
--
-- THE FIX
--   Add enrolment as an alternative route to visibility, for both `courses` and
--   `lessons`. Publication status governs DISCOVERY; enrolment governs ACCESS.
--   Those are different questions and were being answered by the same clause.
--
--   Archiving now means "no longer offered", not "confiscated".
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so that reading `enrollments` from inside a policy on
-- `courses`/`lessons` does not re-enter RLS and recurse. It is deliberately
-- narrow: it answers one boolean about the CALLER, takes no role argument, and
-- cannot be used to ask about anybody else.
create or replace function app.is_enrolled(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.enrollments e
     where e.course_id = p_course
       and e.user_id = auth.uid()
       and e.status in ('active', 'completed')
       and (e.expires_at is null or e.expires_at > now())
  );
$$;

comment on function app.is_enrolled(uuid) is
  'True when the CALLER holds a live enrolment in the course. Used by RLS so '
  'that archiving a course stops it being offered without revoking access for '
  'learners already partway through it.';

revoke all on function app.is_enrolled(uuid) from public, anon;
grant execute on function app.is_enrolled(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Courses: published is for discovery, enrolment is for access
-- ---------------------------------------------------------------------------
drop policy if exists courses_public_select on public.courses;
create policy courses_public_select on public.courses
  for select to anon, authenticated
  using (
    status = 'published'
    or app.is_staff()
    or app.is_enrolled(id)
  );

-- ---------------------------------------------------------------------------
-- Lessons: same rule, so the view's entitlement check can actually run
-- ---------------------------------------------------------------------------
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons
  for select to anon, authenticated
  using (
    app.is_staff()
    or exists (
      select 1 from public.courses c
       where c.id = course_id
         and (c.status = 'published' or app.is_enrolled(c.id))
    )
  );

-- Modules travel with their course, or a learner sees lessons with no
-- structure around them.
drop policy if exists modules_select on public.modules;
create policy modules_select on public.modules
  for select to anon, authenticated
  using (
    app.is_staff()
    or exists (
      select 1 from public.courses c
       where c.id = course_id
         and (c.status = 'published' or app.is_enrolled(c.id))
    )
  );

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
do $verify$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = 'is_enrolled'
  ) then
    raise exception 'app.is_enrolled was not created';
  end if;

  -- anon must not be able to call it: it reads enrollments as definer.
  if has_function_privilege('anon', 'app.is_enrolled(uuid)', 'execute') then
    raise exception 'anon can execute app.is_enrolled, which reads enrollments as definer';
  end if;

  raise notice 'Enrolled access now survives archiving.';
end $verify$;
