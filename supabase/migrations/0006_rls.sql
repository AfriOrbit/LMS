-- =============================================================================
-- AfriOrbit LMS — 0006 Row Level Security
--
-- Rules of the house:
--  1. RLS is enabled AND FORCED on every table in `public`.
--  2. Default posture is deny. A policy must exist for access to happen.
--  3. `service_role` bypasses RLS by design — it is only ever used from
--     server-side route handlers that have already authenticated the caller.
--  4. Learners can never see: answer keys, other learners' attempts, other
--     learners' PII, kit inventory, orders they don't own, or the audit log.
-- =============================================================================

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public'
       and tablename not in ('rate_limits')   -- service_role only, still RLS'd below
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;

-- ---------------------------------------------------------------------------
-- Table-level grants.
--
-- Supabase applies these by default; we state them explicitly so the schema is
-- self-contained and so a future table cannot silently miss them. These grants
-- are NOT the security boundary — RLS is. Without a matching policy a grant
-- returns nothing.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- rate_limits is service-role only; the SECURITY DEFINER function is the sole
-- sanctioned writer.
revoke all on public.rate_limits from anon, authenticated;

-- Remove any prior policies so this migration is idempotent.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_self_select on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_staff_select on public.profiles
  for select to authenticated
  using (app.is_staff());

-- A user may edit their own profile. Which COLUMNS they may edit is enforced
-- with column-level UPDATE privileges below, not with a trigger — a trigger
-- that has to distinguish trusted callers is fragile, and column privileges
-- are checked by the planner before any policy runs.
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (app.is_admin())
  with check (app.is_admin());

-- Trusted server-side connections. Triggers fire regardless of RLS, so a
-- service-role call (the Stripe webhook, the email-confirmation callback, an
-- admin recovery action) would otherwise be blocked by the guards below even
-- though it has already authenticated the caller in application code.
--
-- IMPORTANT: this must not test `current_user`. The guards that call it are
-- SECURITY DEFINER, so inside them `current_user` is already the function
-- owner — a check on it would return true for every caller and silently
-- disable the guard. We test the request's JWT role claim instead, which
-- SECURITY DEFINER does not touch, and fall back to `session_user` for direct
-- database sessions that carry no request context at all.
create or replace function app.is_privileged_connection()
returns boolean
language sql
stable
as $$
  select
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    ) = 'service_role'
    or (
      nullif(current_setting('request.jwt.claims', true), '') is null
      and exists (
        select 1 from pg_roles where rolname = session_user and rolsuper
      )
    );
$$;

grant execute on function app.is_privileged_connection() to authenticated, anon, service_role;

-- Column-level UPDATE privileges on profiles.
--
-- `role`, `status`, `approved_by`, `approved_at`, `email`, `mfa_enabled` and
-- `recovery_codes` are absent from this grant, so no request holding an
-- `authenticated` JWT can write them — including an administrator's own
-- session. Those transitions go through SECURITY DEFINER functions
-- (app.set_user_role, app.set_account_status, app.redeem_invitation) which run
-- as the table owner and re-check authorisation themselves, or through the
-- service-role client after the application has authenticated the caller.
--
-- This replaces an earlier BEFORE UPDATE trigger. A trigger has to work out
-- whether its caller is trusted, and inside SECURITY DEFINER context that is
-- genuinely hard to do correctly; column privileges have no such ambiguity.
drop trigger if exists profiles_guard on public.profiles;
drop function if exists app.guard_profile_privileges();

revoke update on public.profiles from anon, authenticated;
grant update (
  full_name,
  organization,
  country,
  job_title,
  technical_level,
  bio,
  avatar_url,
  accepted_terms_at,
  last_seen_at
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- tracks / courses / modules / lessons
-- Published content is readable by anyone (drives the public catalog and the
-- embeddable widget). Lesson BODIES are gated on enrollment.
-- ---------------------------------------------------------------------------
create policy tracks_public_select on public.tracks
  for select to anon, authenticated
  using (is_published or app.is_staff());

create policy tracks_staff_write on public.tracks
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy courses_public_select on public.courses
  for select to anon, authenticated
  using (status = 'published' or app.is_staff());

create policy courses_admin_write on public.courses
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Instructors may edit courses they are assigned to.
create policy courses_instructor_update on public.courses
  for update to authenticated
  using (
    exists (select 1 from public.course_instructors ci
             where ci.course_id = id and ci.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.course_instructors ci
             where ci.course_id = id and ci.user_id = auth.uid())
  );

create policy course_instructors_select on public.course_instructors
  for select to anon, authenticated using (true);

create policy course_instructors_admin_write on public.course_instructors
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy modules_select on public.modules
  for select to anon, authenticated
  using (
    app.is_staff()
    or exists (select 1 from public.courses c
                where c.id = course_id and c.status = 'published')
  );

create policy modules_staff_write on public.modules
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- Lesson rows are visible for published courses so the syllabus can be shown,
-- but content_md is redacted for non-entitled users by the view below.
create policy lessons_select on public.lessons
  for select to anon, authenticated
  using (
    app.is_staff()
    or exists (select 1 from public.courses c
                where c.id = course_id and c.status = 'published')
  );

create policy lessons_staff_write on public.lessons
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- Entitlement check used by the redacting view and the app.
create or replace function app.can_read_lesson(p_lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.lessons l
     where l.id = p_lesson
       and (
         l.is_preview
         or app.is_staff()
         or exists (
           select 1 from public.enrollments e
            where e.user_id = auth.uid()
              and e.course_id = l.course_id
              and e.status in ('active', 'completed')
              and (e.expires_at is null or e.expires_at > now())
         )
       )
  );
$$;

grant execute on function app.can_read_lesson(uuid) to authenticated, anon;

-- Read lessons through this view in the app: it returns the syllabus to
-- everyone and the body only to entitled users.
create or replace view public.lessons_readable
with (security_invoker = true) as
  select l.id, l.module_id, l.course_id, l.slug, l.title, l.kind,
         l.is_preview, l.estimated_minutes, l.sort_order, l.simulation_key,
         app.can_read_lesson(l.id) as entitled,
         case when app.can_read_lesson(l.id) then l.content_md else null end as content_md,
         case when app.can_read_lesson(l.id) then l.video_url else null end as video_url,
         case when app.can_read_lesson(l.id) then l.attachment_urls else '{}'::text[] end
           as attachment_urls
    from public.lessons l;

-- ---------------------------------------------------------------------------
-- enrollments / progress
-- ---------------------------------------------------------------------------
create policy enrollments_self_select on public.enrollments
  for select to authenticated using (user_id = auth.uid());

create policy enrollments_staff_select on public.enrollments
  for select to authenticated using (app.is_staff());

create policy enrollments_admin_write on public.enrollments
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Note: no self-INSERT policy. Learners enroll via app.enroll_self(), which
-- validates price and publication state. Direct inserts are denied.

create policy lesson_progress_self_all on public.lesson_progress
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and app.can_read_lesson(lesson_id)   -- cannot mark unentitled lessons done
  );

create policy lesson_progress_staff_select on public.lesson_progress
  for select to authenticated using (app.is_staff());

-- ---------------------------------------------------------------------------
-- quizzes — questions table itself is staff-only; learners use the view.
-- ---------------------------------------------------------------------------
create policy quizzes_select on public.quizzes
  for select to authenticated
  using (
    app.is_staff()
    or exists (select 1 from public.enrollments e
                where e.user_id = auth.uid() and e.course_id = quizzes.course_id
                  and e.status in ('active', 'completed'))
  );

create policy quizzes_staff_write on public.quizzes
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- Answer keys: staff only. The learner-facing `quiz_questions_public` view is
-- security_invoker, so it inherits this policy — which would block learners.
-- We therefore add a second policy that exposes rows but the view's column
-- list omits answer_key, so no key ever leaves the database.
create policy quiz_questions_staff_all on public.quiz_questions
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

create policy quiz_questions_enrolled_select on public.quiz_questions
  for select to authenticated
  using (
    exists (
      select 1 from public.quizzes q
      join public.enrollments e on e.course_id = q.course_id
       where q.id = quiz_questions.quiz_id
         and e.user_id = auth.uid()
         and e.status in ('active', 'completed')
    )
  );

revoke select on public.quiz_questions from authenticated, anon;
grant select (id, quiz_id, kind, prompt_md, options, points, sort_order)
  on public.quiz_questions to authenticated;
grant select on public.quiz_questions_public to authenticated;

create policy quiz_attempts_self_select on public.quiz_attempts
  for select to authenticated using (user_id = auth.uid());

create policy quiz_attempts_staff_select on public.quiz_attempts
  for select to authenticated using (app.is_staff());

-- Attempts are created and graded exclusively through SECURITY DEFINER
-- functions, so there is deliberately no INSERT/UPDATE policy for learners.
create policy quiz_attempts_staff_update on public.quiz_attempts
  for update to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- ---------------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------------
create policy certificates_self_select on public.certificates
  for select to authenticated using (user_id = auth.uid());

create policy certificates_staff_all on public.certificates
  for all to authenticated
  using (app.is_staff()) with check (app.is_admin());

-- Public verification: exposed through a view queried with the service role
-- in a rate-limited route handler, never directly by anon.
revoke all on public.certificate_verification from anon, authenticated;
grant select on public.certificate_verification to service_role;

-- ---------------------------------------------------------------------------
-- cohorts / kits / lab sessions / bookings / reports
-- ---------------------------------------------------------------------------
create policy cohorts_select on public.cohorts
  for select to anon, authenticated
  using (is_published or app.is_staff());

create policy cohorts_staff_write on public.cohorts
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- Inventory is staff-only; a learner sees their own assignment, not the fleet.
create policy hardware_kits_staff_all on public.hardware_kits
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

create policy kit_assignments_self_select on public.kit_assignments
  for select to authenticated using (user_id = auth.uid());

create policy kit_assignments_staff_all on public.kit_assignments
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

create policy lab_sessions_select on public.lab_sessions
  for select to authenticated
  using (
    app.is_staff()
    or (is_published and exists (
      select 1 from public.enrollments e
       where e.user_id = auth.uid() and e.course_id = lab_sessions.course_id
         and e.status in ('active', 'completed')))
  );

create policy lab_sessions_staff_write on public.lab_sessions
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

create policy lab_bookings_self_select on public.lab_bookings
  for select to authenticated using (user_id = auth.uid());

-- Learners may cancel their own booking; creation goes through
-- app.book_lab_session() so capacity is enforced under a row lock.
create policy lab_bookings_self_update on public.lab_bookings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status in ('booked', 'cancelled'));

create policy lab_bookings_staff_all on public.lab_bookings
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

create policy lab_assignments_select on public.lab_assignments
  for select to authenticated
  using (
    app.is_staff()
    or exists (select 1 from public.enrollments e
                where e.user_id = auth.uid() and e.course_id = lab_assignments.course_id
                  and e.status in ('active', 'completed'))
  );

create policy lab_assignments_staff_write on public.lab_assignments
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- A learner owns their report until it is submitted; after that only staff
-- may modify it. Enforced with a WITH CHECK on status plus a trigger.
create policy lab_reports_self_select on public.lab_reports
  for select to authenticated using (user_id = auth.uid());

create policy lab_reports_self_insert on public.lab_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status in ('draft', 'submitted')
    and exists (select 1 from public.enrollments e
                 where e.user_id = auth.uid() and e.course_id = lab_reports.course_id
                   and e.status in ('active', 'completed'))
  );

create policy lab_reports_self_update on public.lab_reports
  for update to authenticated
  using (user_id = auth.uid() and status in ('draft', 'returned'))
  with check (user_id = auth.uid() and status in ('draft', 'submitted'));

create policy lab_reports_staff_all on public.lab_reports
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- Stop a learner from writing their own grade.
create or replace function app.guard_lab_report_grading()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.is_privileged_connection() or app.is_staff() then
    if new.status = 'graded' and new.graded_at is null then
      new.graded_at := now();
      new.grader_id := auth.uid();
    end if;
    return new;
  end if;

  if new.points_awarded is distinct from old.points_awarded
     or new.rubric_scores is distinct from old.rubric_scores
     or new.feedback_md is distinct from old.feedback_md
     or new.passed is distinct from old.passed
     or new.grader_id is distinct from old.grader_id
     or new.graded_at is distinct from old.graded_at then
    raise exception 'grading_fields_are_staff_only' using errcode = '42501';
  end if;

  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    new.submitted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists lab_reports_guard on public.lab_reports;
create trigger lab_reports_guard before update on public.lab_reports
  for each row execute function app.guard_lab_report_grading();

create policy telemetry_self_all on public.telemetry_captures
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy telemetry_staff_select on public.telemetry_captures
  for select to authenticated using (app.is_staff());

-- ---------------------------------------------------------------------------
-- commerce
-- ---------------------------------------------------------------------------
create policy orders_self_select on public.orders
  for select to authenticated using (user_id = auth.uid());

create policy orders_admin_all on public.orders
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy discount_codes_admin_all on public.discount_codes
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Invitation rows are never readable by learners — redemption is by function.
create policy invitations_admin_all on public.invitations
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy webhook_events_none on public.webhook_events
  for select to authenticated using (app.is_admin());

-- ---------------------------------------------------------------------------
-- audit log — readable by admins, writable only via app.write_audit()
-- ---------------------------------------------------------------------------
create policy audit_log_admin_select on public.audit_log
  for select to authenticated using (app.is_admin());

-- Append-only is enforced at the privilege level as well as by the absence of
-- an UPDATE/DELETE policy. Without the revoke, a missing policy merely makes
-- an UPDATE affect zero rows — which is correct but silent. With it, tampering
-- raises an error that shows up in logs.
revoke update, delete, truncate on public.audit_log from anon, authenticated, service_role;
revoke update, delete, truncate on public.webhook_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------
create policy announcements_select on public.announcements
  for select to authenticated
  using (
    app.is_staff()
    or course_id is null
    or exists (select 1 from public.enrollments e
                where e.user_id = auth.uid() and e.course_id = announcements.course_id
                  and e.status in ('active', 'completed'))
  );

create policy announcements_staff_write on public.announcements
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- ---------------------------------------------------------------------------
-- rate_limits — no policy at all: only service_role (which bypasses RLS)
-- and the SECURITY DEFINER function may touch it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Storage buckets and their policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('course-media', 'course-media', true,  52428800,
   array['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf','video/mp4']),
  ('lab-uploads',  'lab-uploads',  false, 26214400,
   array['image/png','image/jpeg','application/pdf','text/csv','text/plain',
         'application/zip','application/octet-stream']),
  ('avatars',      'avatars',      true,  2097152,
   array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists course_media_read on storage.objects;
create policy course_media_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'course-media');

drop policy if exists course_media_write on storage.objects;
create policy course_media_write on storage.objects
  for all to authenticated
  using (bucket_id = 'course-media' and app.is_staff())
  with check (bucket_id = 'course-media' and app.is_staff());

-- Lab uploads live under `<user-id>/<report-id>/<filename>`.
drop policy if exists lab_uploads_own on storage.objects;
create policy lab_uploads_own on storage.objects
  for all to authenticated
  using (bucket_id = 'lab-uploads'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'lab-uploads'
         and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists lab_uploads_staff on storage.objects;
create policy lab_uploads_staff on storage.objects
  for select to authenticated
  using (bucket_id = 'lab-uploads' and app.is_staff());

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');

drop policy if exists avatars_own on storage.objects;
create policy avatars_own on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
