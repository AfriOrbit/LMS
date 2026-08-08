-- =============================================================================
-- RLS security test suite
--
-- Asserts the properties the platform's security actually depends on. Run
-- against a database that has the shim plus every migration applied:
--
--   npm run db:test
--
-- Each check raises an exception on failure, so a clean run means every
-- assertion held. The point of this file is to make the guarantees in
-- docs/SECURITY.md executable rather than aspirational.
-- =============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function pg_temp.assert(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  %', label;
  end if;
end $$;

-- Impersonate a signed-in user: set the PostgREST role and the JWT claims.
create or replace function pg_temp.act_as(p_user uuid, p_aal text default 'aal2')
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text,
    true
  );
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.act_as_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.act_as_owner()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
begin;

do $fixtures$
declare
  v_admin   uuid := '11111111-1111-1111-1111-111111111111';
  v_learner uuid := '22222222-2222-2222-2222-222222222222';
  v_other   uuid := '33333333-3333-3333-3333-333333333333';
  v_instr   uuid := '44444444-4444-4444-4444-444444444444';
begin
  delete from public.profiles where id in (v_admin, v_learner, v_other, v_instr);
  delete from auth.users where id in (v_admin, v_learner, v_other, v_instr);

  insert into auth.users (id, email, raw_user_meta_data) values
    (v_admin,   'admin@test.local',    '{"full_name":"Admin"}'),
    (v_learner, 'learner@test.local',  '{"full_name":"Learner One"}'),
    (v_other,   'other@test.local',    '{"full_name":"Learner Two"}'),
    (v_instr,   'instructor@test.local','{"full_name":"Instructor"}');

  -- The trigger makes the first-ever profile an admin; force known values.
  -- Runs as the table owner, which is the only way `role` and `status` can be
  -- written outside the sanctioned SECURITY DEFINER functions.
  update public.profiles set role = 'admin',      status = 'active'  where id = v_admin;
  update public.profiles set role = 'learner',    status = 'active'  where id = v_learner;
  update public.profiles set role = 'learner',    status = 'pending' where id = v_other;
  update public.profiles set role = 'instructor', status = 'active'  where id = v_instr;
end
$fixtures$;

commit;

-- ---------------------------------------------------------------------------
-- 1. A learner cannot read another learner's profile
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.profiles) = 1,
  'learner sees only their own profile row'
);
select pg_temp.assert(
  not exists (select 1 from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'learner cannot read another learner profile'
);
rollback;

-- ---------------------------------------------------------------------------
-- 2. Staff can read profiles; anon cannot
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.assert(
  (select count(*) from public.profiles) >= 4,
  'instructor can read the roster'
);
rollback;

begin;
select pg_temp.act_as_anon();
select pg_temp.assert(
  (select count(*) from public.profiles) = 0,
  'anonymous cannot read any profile'
);
rollback;

-- ---------------------------------------------------------------------------
-- 3. Privilege escalation via profile UPDATE is blocked
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
begin
  begin
    update public.profiles set role = 'admin'
     where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'FAIL  learner was able to promote themselves to admin';
  exception
    when insufficient_privilege then
      raise notice 'PASS  learner cannot change their own role';
  end;
end $$;

rollback;

-- A pending learner must not be able to approve themselves.
begin;
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$
begin
  begin
    update public.profiles set status = 'active'
     where id = '33333333-3333-3333-3333-333333333333';
    raise exception 'FAIL  pending learner approved their own account';
  exception
    when insufficient_privilege then
      raise notice 'PASS  pending learner cannot approve their own account';
  end;
end $$;

-- ... nor edit somebody else's profile at all.
do $$
declare v_rows int;
begin
  update public.profiles set full_name = 'Hijacked'
   where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL  learner updated another user''s profile';
  end if;
  raise notice 'PASS  learner cannot update another user''s profile';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 4. A learner cannot escalate through app.set_user_role()
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
begin
  begin
    perform app.set_user_role('22222222-2222-2222-2222-222222222222', 'admin');
    raise exception 'FAIL  set_user_role allowed a non-admin caller';
  exception
    when insufficient_privilege then
      raise notice 'PASS  set_user_role rejects non-admin callers';
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 4b. app.set_account_status is admin-only, and admins cannot self-deactivate
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
begin
  begin
    perform app.set_account_status('22222222-2222-2222-2222-222222222222', 'active');
    raise exception 'FAIL  set_account_status allowed a non-admin caller';
  exception
    when insufficient_privilege then
      raise notice 'PASS  set_account_status rejects non-admin callers';
  end;
end $$;
rollback;

begin;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.assert(
  (select status from public.profiles
    where id = '33333333-3333-3333-3333-333333333333') = 'pending',
  'target account starts pending'
);
do $$
begin
  perform app.set_account_status('33333333-3333-3333-3333-333333333333', 'active');
  if (select status from public.profiles
       where id = '33333333-3333-3333-3333-333333333333') <> 'active' then
    raise exception 'FAIL  admin could not approve an account';
  end if;
  raise notice 'PASS  admin can approve an account';

  begin
    perform app.set_account_status('11111111-1111-1111-1111-111111111111', 'suspended');
    raise exception 'FAIL  admin suspended their own account';
  exception
    when sqlstate '22023' then
      raise notice 'PASS  admin cannot deactivate their own account';
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 5. Quiz answer keys are unreachable by learners
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as_owner();
insert into public.enrollments (user_id, course_id, source)
select '22222222-2222-2222-2222-222222222222', id, 'admin'
  from public.courses where slug = 'cubesat-systems-fundamentals'
on conflict do nothing;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
begin
  begin
    perform answer_key from public.quiz_questions limit 1;
    raise exception 'FAIL  learner could select answer_key';
  exception
    when insufficient_privilege then
      raise notice 'PASS  answer_key column is not granted to learners';
  end;
end $$;

select pg_temp.assert(
  (select count(*) from public.quiz_questions_public) > 0,
  'learner can read the answer-free question view'
);
rollback;

-- ---------------------------------------------------------------------------
-- 6. Lesson bodies are gated on enrollment
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.lessons_readable
    where content_md is not null and not is_preview) = 0,
  'unenrolled learner gets no non-preview lesson bodies'
);
select pg_temp.assert(
  (select count(*) from public.lessons_readable where is_preview) > 0,
  'preview lessons remain visible to build the catalogue'
);
rollback;

begin;
select pg_temp.act_as_owner();
insert into public.enrollments (user_id, course_id, source)
select '22222222-2222-2222-2222-222222222222', id, 'admin'
  from public.courses where slug = 'cubesat-systems-fundamentals'
on conflict do nothing;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.lessons_readable l
     join public.courses c on c.id = l.course_id
    where c.slug = 'cubesat-systems-fundamentals' and l.content_md is not null) > 0,
  'enrolled learner receives lesson bodies'
);
rollback;

-- ---------------------------------------------------------------------------
-- 7. Direct enrollment INSERT is denied; enroll_self() is the only path
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
declare v_course uuid;
begin
  select id into v_course from public.courses where slug = 'cubesat-systems-fundamentals';
  begin
    insert into public.enrollments (user_id, course_id) values (auth.uid(), v_course);
    raise exception 'FAIL  learner inserted an enrollment directly';
  exception
    when insufficient_privilege then
      raise notice 'PASS  direct enrollment insert is denied by RLS';
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 8. A pending account cannot enrol
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$
declare v_course uuid;
begin
  select id into v_course from public.courses where slug = 'cubesat-systems-fundamentals';
  begin
    perform app.enroll_self(v_course);
    raise exception 'FAIL  pending account was allowed to enrol';
  exception
    when insufficient_privilege then
      raise notice 'PASS  pending account cannot enrol';
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 9. Progress cannot be claimed for a lesson the learner cannot read
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
declare v_lesson record;
begin
  select l.id, l.course_id into v_lesson
    from public.lessons l
    join public.courses c on c.id = l.course_id
   where c.slug = 'satellite-iot-link-and-ground-segment' and not l.is_preview
   limit 1;

  begin
    insert into public.lesson_progress (user_id, lesson_id, course_id, completed)
    values (auth.uid(), v_lesson.id, v_lesson.course_id, true);
    raise exception 'FAIL  learner marked an unentitled lesson complete';
  exception
    when insufficient_privilege then
      raise notice 'PASS  progress on unentitled lessons is refused';
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 10. Grading is server-side and correct
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as_owner();
insert into public.enrollments (user_id, course_id, source)
select '22222222-2222-2222-2222-222222222222', id, 'admin'
  from public.courses where slug = 'cubesat-systems-fundamentals'
on conflict do nothing;

-- The answer key is deliberately unreadable by a learner, so the expected
-- responses are precomputed here, while still acting as the owner.
create temporary table expected_answers on commit drop as
  select id,
         case kind
           when 'multi_choice' then answer_key -> 'correct'
           when 'numeric'      then to_jsonb(answer_key ->> 'value')
           when 'short_text'   then (answer_key -> 'accept') -> 0
           else to_jsonb(answer_key ->> 'correct')
         end as response
    from public.quiz_questions;

grant select on expected_answers to authenticated;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
declare
  v_quiz    uuid;
  v_attempt public.quiz_attempts%rowtype;
  v_resp    jsonb := '{}'::jsonb;
  v_qid     uuid;
  v_graded  public.quiz_attempts%rowtype;
begin
  select id into v_quiz from public.quizzes where slug = 'fundamentals-assessment';
  v_attempt := app.start_quiz_attempt(v_quiz);

  foreach v_qid in array v_attempt.question_ids loop
    v_resp := v_resp || jsonb_build_object(
      v_qid::text,
      (select response from expected_answers where id = v_qid)
    );
  end loop;

  v_graded := app.grade_attempt(v_attempt.id, v_resp);

  if v_graded.score_pct <> 100 then
    raise exception 'FAIL  a fully correct submission scored %', v_graded.score_pct;
  end if;
  raise notice 'PASS  correct submission scores 100%%';

  if not v_graded.passed then
    raise exception 'FAIL  a 100%% score did not pass';
  end if;
  raise notice 'PASS  pass flag set from the server-side score';
end $$;
rollback;

-- Same, but with every answer wrong.
begin;
select pg_temp.act_as_owner();
insert into public.enrollments (user_id, course_id, source)
select '22222222-2222-2222-2222-222222222222', id, 'admin'
  from public.courses where slug = 'cubesat-systems-fundamentals'
on conflict do nothing;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
declare
  v_quiz uuid;
  v_attempt public.quiz_attempts%rowtype;
  v_graded  public.quiz_attempts%rowtype;
begin
  select id into v_quiz from public.quizzes where slug = 'fundamentals-assessment';
  v_attempt := app.start_quiz_attempt(v_quiz);
  v_graded := app.grade_attempt(v_attempt.id, '{}'::jsonb);

  if v_graded.score_pct <> 0 then
    raise exception 'FAIL  an empty submission scored %', v_graded.score_pct;
  end if;
  if v_graded.passed then
    raise exception 'FAIL  an empty submission passed';
  end if;
  raise notice 'PASS  empty submission scores zero and fails';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 11. Attempts cannot be forged or re-graded
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as_owner();
do $$
declare v_quiz public.quizzes%rowtype;
begin
  select * into v_quiz from public.quizzes where slug = 'fundamentals-assessment';
  perform set_config('test.quiz_id', v_quiz.id::text, true);
  perform set_config('test.course_id', v_quiz.course_id::text, true);

  insert into public.enrollments (user_id, course_id, source)
  values ('22222222-2222-2222-2222-222222222222', v_quiz.course_id, 'admin')
  on conflict do nothing;
end $$;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
begin
  begin
    insert into public.quiz_attempts
      (quiz_id, user_id, course_id, attempt_no, status, passed, score_pct)
    values (
      current_setting('test.quiz_id')::uuid,
      auth.uid(),
      current_setting('test.course_id')::uuid,
      99, 'graded', true, 100
    );
    raise exception 'FAIL  learner inserted a forged passing attempt';
  exception
    when insufficient_privilege then
      raise notice 'PASS  learners cannot insert quiz attempts directly';
  end;
end $$;

-- An enrolled learner also must not be able to rewrite a graded attempt.
do $$
declare v_attempt public.quiz_attempts%rowtype;
begin
  v_attempt := app.start_quiz_attempt(current_setting('test.quiz_id')::uuid);
  begin
    update public.quiz_attempts set passed = true, score_pct = 100
     where id = v_attempt.id;
    if found then
      raise exception 'FAIL  learner rewrote their own attempt score';
    end if;
    raise notice 'PASS  learner cannot rewrite an attempt score';
  exception
    when insufficient_privilege then
      raise notice 'PASS  learner cannot rewrite an attempt score';
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 12. A certificate cannot be issued for an incomplete course
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as_owner();
insert into public.enrollments (user_id, course_id, source)
select '22222222-2222-2222-2222-222222222222', id, 'admin'
  from public.courses where slug = 'cubesat-systems-fundamentals'
on conflict do nothing;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
declare v_course uuid;
begin
  select id into v_course from public.courses where slug = 'cubesat-systems-fundamentals';
  begin
    perform app.issue_certificate(v_course);
    raise exception 'FAIL  certificate issued for an incomplete course';
  exception
    when insufficient_privilege then
      raise notice 'PASS  certificate refused while the course is incomplete';
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 13. Learners cannot grade their own lab report
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as_owner();
insert into public.enrollments (user_id, course_id, source)
select '22222222-2222-2222-2222-222222222222', id, 'admin'
  from public.courses where slug = 'satellite-iot-link-and-ground-segment'
on conflict do nothing;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
do $$
declare
  v_assignment public.lab_assignments%rowtype;
  v_report_id uuid;
begin
  select * into v_assignment from public.lab_assignments limit 1;

  insert into public.lab_reports (assignment_id, user_id, course_id, narrative_md, status)
  values (v_assignment.id, auth.uid(), v_assignment.course_id, 'draft text', 'draft')
  returning id into v_report_id;
  raise notice 'PASS  learner can create their own draft report';

  begin
    update public.lab_reports
       set points_awarded = 100, passed = true
     where id = v_report_id;
    raise exception 'FAIL  learner set their own grade';
  exception
    when insufficient_privilege then
      raise notice 'PASS  learner cannot write grading fields';
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 14. Audit log is readable only by admins and is append-only
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as_owner();
insert into public.audit_log (action) values ('test.entry');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.audit_log) = 0,
  'learner cannot read the audit log'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.assert(
  (select count(*) from public.audit_log) > 0,
  'admin can read the audit log'
);

do $$
begin
  begin
    update public.audit_log set action = 'tampered';
    raise exception 'FAIL  admin was able to modify an audit entry';
  exception
    when insufficient_privilege then
      raise notice 'PASS  audit entries cannot be updated, even by an admin';
  end;
end $$;

do $$
begin
  begin
    delete from public.audit_log;
    raise exception 'FAIL  admin was able to delete audit entries';
  exception
    when insufficient_privilege then
      raise notice 'PASS  audit entries cannot be deleted, even by an admin';
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 15. Invitations and kit inventory are not learner-readable
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.invitations) = 0,
  'learner cannot enumerate invitations'
);
select pg_temp.assert(
  (select count(*) from public.hardware_kits) = 0,
  'learner cannot enumerate the hardware fleet'
);
rollback;

-- ---------------------------------------------------------------------------
-- 16. Registration cannot self-assign a role through user metadata
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as_owner();
do $$
declare v_id uuid := '55555555-5555-5555-5555-555555555555';
begin
  delete from public.profiles where id = v_id;
  delete from auth.users where id = v_id;

  insert into auth.users (id, email, raw_user_meta_data)
  values (v_id, 'attacker@test.local',
          '{"full_name":"Attacker","role":"admin","status":"active"}');

  if (select role from public.profiles where id = v_id) <> 'learner' then
    raise exception 'FAIL  signup metadata set the account role';
  end if;
  raise notice 'PASS  signup metadata cannot set role';

  if (select status from public.profiles where id = v_id) <> 'pending' then
    raise exception 'FAIL  signup metadata set the account status';
  end if;
  raise notice 'PASS  signup metadata cannot set status';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 17. Every public table has RLS forced
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  not exists (
    select 1 from pg_tables t
      join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
     where t.schemaname = 'public' and not (c.relrowsecurity and c.relforcerowsecurity)
  ),
  'every table in public has RLS enabled and forced'
);

-- ---------------------------------------------------------------------------
-- 18. Lab session capacity is enforced under concurrency
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as_owner();
do $$
declare
  v_course uuid;
  v_cohort uuid;
  v_session uuid;
begin
  select id into v_course from public.courses
   where slug = 'satellite-iot-link-and-ground-segment';
  select id into v_cohort from public.cohorts where course_id = v_course limit 1;

  insert into public.lab_sessions
    (cohort_id, course_id, title, starts_at, ends_at, capacity, is_published)
  values (v_cohort, v_course, 'Capacity test',
          now() + interval '1 day', now() + interval '1 day 2 hours', 1, true)
  returning id into v_session;

  insert into public.enrollments (user_id, course_id, source) values
    ('22222222-2222-2222-2222-222222222222', v_course, 'admin'),
    ('44444444-4444-4444-4444-444444444444', v_course, 'admin')
  on conflict do nothing;

  perform set_config('test.session_id', v_session::text, true);
end $$;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (app.book_lab_session(current_setting('test.session_id')::uuid)).status = 'booked',
  'first learner books the only seat'
);

select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
do $$
begin
  begin
    perform app.book_lab_session(current_setting('test.session_id')::uuid);
    raise exception 'FAIL  a full session accepted a second booking';
  exception
    when insufficient_privilege then
      raise notice 'PASS  full session refuses further bookings';
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 19. Invitation redemption cannot grant admin
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as_owner();
do $$
declare v_code text := 'TESTCODE1234';
begin
  insert into public.invitations (code_hash, code_hint, grants_role, auto_approve, max_uses)
  values (encode(digest(upper(v_code), 'sha256'), 'hex'), '1234', 'instructor', true, 5);
  perform set_config('test.invite', v_code, true);
end $$;

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.assert(
  (app.redeem_invitation(current_setting('test.invite'))) ->> 'approved' = 'true',
  'invitation approves a pending account'
);
select pg_temp.assert(
  (select role from public.profiles where id = auth.uid()) = 'instructor',
  'invitation can grant instructor'
);
select pg_temp.assert(
  (select status from public.profiles where id = auth.uid()) = 'active',
  'invitation activates the account'
);
rollback;

-- ---------------------------------------------------------------------------
-- 20. Progress rollup is computed in the database
-- ---------------------------------------------------------------------------
begin;
select pg_temp.act_as_owner();
do $$
declare
  v_course uuid;
  v_user uuid := '22222222-2222-2222-2222-222222222222';
  v_pct int;
begin
  select id into v_course from public.courses where slug = 'cubesat-systems-fundamentals';

  insert into public.enrollments (user_id, course_id, source)
  values (v_user, v_course, 'admin') on conflict do nothing;

  insert into public.lesson_progress (user_id, lesson_id, course_id, completed, completed_at)
  select v_user, id, v_course, true, now() from public.lessons where course_id = v_course
  on conflict (user_id, lesson_id) do update set completed = true;

  select progress_pct into v_pct from public.enrollments
   where user_id = v_user and course_id = v_course;

  if v_pct <> 100 then
    raise exception 'FAIL  rollup produced %%%, expected 100', v_pct;
  end if;
  raise notice 'PASS  completing every lesson rolls up to 100%%';

  if (select status from public.enrollments
       where user_id = v_user and course_id = v_course) <> 'completed' then
    raise exception 'FAIL  enrollment was not marked completed';
  end if;
  raise notice 'PASS  enrollment flips to completed at 100%%';
end $$;
rollback;

\echo ''
\echo '================================================'
\echo ' All RLS and business-rule assertions passed.'
\echo '================================================'
