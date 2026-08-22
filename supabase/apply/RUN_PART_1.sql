-- ============================================================================
-- AfriOrbit LMS — schema, part 1 of 3: schema and row-level security
--
-- Use these three files ONLY if RUN_ALL_MIGRATIONS.sql is too large to paste.
-- Run them in order, 0001_foundation.sql first. Each is safe to re-run.
-- Contains: 0001_foundation.sql, 0002_catalog.sql, 0003_assessment.sql, 0004_labs.sql, 0005_commerce_and_audit.sql, 0006_rls.sql
-- ============================================================================


-- =============================================================================
-- =============================================================================
--
--   PART 01 OF 6   0001_foundation.sql   (11,308 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- AfriOrbit LMS — 0001 Foundation
-- Extensions, enums, helper schema, and the identity/profile layer.
--
-- Design notes
--  * Every application table lives in `public` and has RLS enabled. There are
--    no "trusted" tables reachable by the anon/authenticated keys.
--  * Authorisation predicates live in `app` schema SECURITY DEFINER functions
--    so policies stay readable and cannot be short-circuited by recursion.
--  * `auth.users` is owned by Supabase. We mirror the minimum into
--    `public.profiles` via a trigger so the app never queries auth schema.
-- =============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid, digest
create extension if not exists "citext";        -- case-insensitive email
create extension if not exists "pg_trgm";       -- catalog search

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('learner', 'instructor', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Registration gate. Users may authenticate while 'pending' but the
  -- middleware and RLS keep them out of course content until 'active'.
  create type account_status as enum ('pending', 'active', 'suspended', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type course_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type course_level as enum ('foundation', 'intermediate', 'advanced');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lesson_kind as enum ('reading', 'video', 'lab', 'quiz', 'simulation', 'download');
exception when duplicate_object then null; end $$;

do $$ begin
  create type enrollment_status as enum ('active', 'completed', 'withdrawn', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type question_kind as enum ('single_choice', 'multi_choice', 'true_false', 'numeric', 'short_text');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attempt_status as enum ('in_progress', 'submitted', 'graded', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_status as enum ('draft', 'submitted', 'returned', 'graded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kit_status as enum ('available', 'assigned', 'maintenance', 'retired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending', 'paid', 'failed', 'refunded', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles — application identity, 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             citext not null,
  full_name         text not null default '',
  role              app_role not null default 'learner',
  status            account_status not null default 'pending',
  organization      text,
  country           text,
  job_title         text,
  -- Self-declared technical depth; used to recommend tracks, never to gate.
  technical_level   course_level not null default 'intermediate',
  bio               text,
  avatar_url        text,
  -- Denormalised MFA flag kept in sync by the app after enrolment/unenrolment
  -- so we can report on it without granting access to auth.mfa_factors.
  mfa_enabled       boolean not null default false,
  mfa_enforced_at   timestamptz,
  -- Hashed single-use recovery codes (sha256 hex). Never store plaintext.
  recovery_codes    text[] not null default '{}',
  recovery_codes_generated_at timestamptz,
  accepted_terms_at timestamptz,
  approved_by       uuid references auth.users(id) on delete set null,
  approved_at       timestamptz,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists profiles_role_idx    on public.profiles (role);
create index if not exists profiles_status_idx  on public.profiles (status);
create index if not exists profiles_email_idx   on public.profiles (email);

comment on column public.profiles.recovery_codes is
  'SHA-256 hashes of one-time MFA recovery codes. Codes are removed as they are consumed.';

-- ---------------------------------------------------------------------------
-- Authorisation helpers (SECURITY DEFINER, search_path pinned)
-- ---------------------------------------------------------------------------

create or replace function app.current_role()
returns app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'instructor') and status = 'active'
  );
$$;

-- An "active member" is an approved account. Pending/suspended users hold a
-- valid JWT but must not read course content.
create or replace function app.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'active'
  );
$$;

-- True only when the caller completed a second factor in this session.
-- Supabase stamps the JWT claim `aal` with aal1 (password only) or aal2 (MFA).
create or replace function app.has_mfa()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    'aal1'
  ) = 'aal2';
$$;

grant execute on function app.current_role(), app.is_admin(), app.is_staff(),
  app.is_active_member(), app.has_mfa() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Mirror new auth users into profiles.
-- Role is NEVER taken from user-supplied metadata — privilege escalation via
-- the signup payload is the classic Supabase footgun. Role defaults to
-- 'learner' and can only be changed by an admin through app.set_user_role().
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_first_user boolean;
begin
  select not exists (select 1 from public.profiles) into v_first_user;

  insert into public.profiles (id, email, full_name, organization, country, job_title, role, status)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
    nullif(trim(new.raw_user_meta_data ->> 'organization'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'country'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'job_title'), ''),
    -- Bootstrap: the very first account becomes the owner/admin so the
    -- instance is never left without one. Everyone else is a learner.
    case when v_first_user then 'admin'::app_role else 'learner'::app_role end,
    case when v_first_user then 'active'::account_status else 'pending'::account_status end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Keep email in sync if the user changes it in auth.
create or replace function app.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function app.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Role administration — the only sanctioned path to change a role.
-- ---------------------------------------------------------------------------
create or replace function app.set_user_role(target uuid, new_role app_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if target = auth.uid() and new_role <> 'admin' then
    raise exception 'admins cannot demote themselves' using errcode = '22023';
  end if;
  update public.profiles set role = new_role where id = target;
end;
$$;

grant execute on function app.set_user_role(uuid, app_role) to authenticated;

-- Approve, suspend or reject an account. The only sanctioned path, for the
-- same reason as set_user_role: `status` is not writable through a normal
-- UPDATE by any authenticated session (see 0006).
create or replace function app.set_account_status(target uuid, new_status account_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if target = auth.uid() and new_status <> 'active' then
    raise exception 'admins cannot deactivate their own account' using errcode = '22023';
  end if;

  update public.profiles
     set status      = new_status,
         approved_by = case when new_status = 'active' then auth.uid() else null end,
         approved_at = case when new_status = 'active' then now() else null end
   where id = target;
end;
$$;

grant execute on function app.set_account_status(uuid, account_status) to authenticated;


-- =============================================================================
-- =============================================================================
--
--   PART 02 OF 6   0002_catalog.sql   (11,974 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- AfriOrbit LMS — 0002 Catalog
-- Tracks, courses, modules, lessons, enrollment and progress.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- tracks — a curated sequence of courses (e.g. "EduSat Flight Software")
-- ---------------------------------------------------------------------------
create table if not exists public.tracks (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  summary      text not null default '',
  description  text not null default '',
  level        course_level not null default 'intermediate',
  hero_image_url text,
  sort_order   int not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id             uuid primary key default gen_random_uuid(),
  track_id       uuid references public.tracks(id) on delete set null,
  slug           text not null unique,
  title          text not null,
  subtitle       text not null default '',
  summary        text not null default '',
  description    text not null default '',
  level          course_level not null default 'intermediate',
  status         course_status not null default 'draft',
  -- Discovery / filtering
  tags           text[] not null default '{}',
  prerequisites  text[] not null default '{}',
  outcomes       text[] not null default '{}',
  -- Effort + delivery
  estimated_minutes int not null default 0,
  requires_hardware boolean not null default false,
  hardware_notes text,
  -- Commerce. price_cents = 0 means free-to-enroll (still gated on approval).
  price_cents    int not null default 0 check (price_cents >= 0),
  currency       text not null default 'USD' check (char_length(currency) = 3),
  -- Certification
  issues_certificate boolean not null default true,
  pass_threshold  int not null default 70 check (pass_threshold between 0 and 100),
  hero_image_url text,
  sort_order     int not null default 0,
  owner_id       uuid references public.profiles(id) on delete set null,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists courses_status_idx on public.courses (status);
create index if not exists courses_track_idx  on public.courses (track_id);
create index if not exists courses_tags_idx   on public.courses using gin (tags);
create index if not exists courses_search_idx on public.courses
  using gin ((title || ' ' || summary) gin_trgm_ops);

-- Instructors assigned to a course (many-to-many).
create table if not exists public.course_instructors (
  course_id  uuid not null references public.courses(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  is_lead    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

-- ---------------------------------------------------------------------------
-- modules -> lessons
-- ---------------------------------------------------------------------------
create table if not exists public.modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  slug        text not null,
  title       text not null,
  summary     text not null default '',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (course_id, slug)
);

create index if not exists modules_course_idx on public.modules (course_id, sort_order);

create table if not exists public.lessons (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references public.modules(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  slug          text not null,
  title         text not null,
  kind          lesson_kind not null default 'reading',
  -- Markdown (GFM + LaTeX math). Rendered without raw HTML, so authored
  -- content cannot inject script even though authors are trusted roles.
  content_md    text not null default '',
  video_url     text,
  attachment_urls text[] not null default '{}',
  -- Free preview lessons are readable by anyone, for marketing.
  is_preview    boolean not null default false,
  estimated_minutes int not null default 10,
  sort_order    int not null default 0,
  -- For kind = 'simulation': which built-in sandbox to mount.
  simulation_key text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (course_id, slug)
);

create index if not exists lessons_module_idx on public.lessons (module_id, sort_order);
create index if not exists lessons_course_idx on public.lessons (course_id);

-- ---------------------------------------------------------------------------
-- enrollments + progress
-- ---------------------------------------------------------------------------
create table if not exists public.enrollments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  cohort_id     uuid,  -- FK added in 0004 once cohorts exist
  status        enrollment_status not null default 'active',
  source        text not null default 'self',  -- self | invite | purchase | admin | bulk
  progress_pct  int not null default 0 check (progress_pct between 0 and 100),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, course_id)
);

create index if not exists enrollments_user_idx   on public.enrollments (user_id);
create index if not exists enrollments_course_idx on public.enrollments (course_id);

create table if not exists public.lesson_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  completed     boolean not null default false,
  seconds_spent int not null default 0 check (seconds_spent >= 0),
  last_position text,             -- e.g. video timestamp or scroll anchor
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create index if not exists lesson_progress_user_course_idx
  on public.lesson_progress (user_id, course_id);

-- ---------------------------------------------------------------------------
-- Progress rollup: recompute enrollment.progress_pct whenever a lesson
-- completion flips. Done in the database so a tampered client cannot claim
-- 100% by POSTing a progress value directly.
-- ---------------------------------------------------------------------------
create or replace function app.recalc_course_progress(p_user uuid, p_course uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total int;
  v_done  int;
  v_pct   int;
begin
  select count(*) into v_total from public.lessons where course_id = p_course;
  if v_total = 0 then
    v_pct := 0;
  else
    select count(*) into v_done
      from public.lesson_progress
     where user_id = p_user and course_id = p_course and completed;
    v_pct := floor((v_done::numeric / v_total) * 100);
  end if;

  update public.enrollments
     set progress_pct = v_pct,
         status = case when v_pct >= 100 then 'completed'::enrollment_status else status end,
         completed_at = case when v_pct >= 100 and completed_at is null then now() else completed_at end
   where user_id = p_user and course_id = p_course;

  return v_pct;
end;
$$;

create or replace function app.on_lesson_progress_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.recalc_course_progress(
    coalesce(new.user_id, old.user_id),
    coalesce(new.course_id, old.course_id)
  );
  return null;
end;
$$;

drop trigger if exists lesson_progress_rollup on public.lesson_progress;
create trigger lesson_progress_rollup
  after insert or update or delete on public.lesson_progress
  for each row execute function app.on_lesson_progress_change();

-- Keep lessons.course_id consistent with its module's course.
create or replace function app.sync_lesson_course()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select course_id into new.course_id from public.modules where id = new.module_id;
  return new;
end;
$$;

drop trigger if exists lessons_sync_course on public.lessons;
create trigger lessons_sync_course before insert or update of module_id on public.lessons
  for each row execute function app.sync_lesson_course();

drop trigger if exists tracks_touch  on public.tracks;
create trigger tracks_touch  before update on public.tracks  for each row execute function app.touch_updated_at();
drop trigger if exists courses_touch on public.courses;
create trigger courses_touch before update on public.courses for each row execute function app.touch_updated_at();
drop trigger if exists modules_touch on public.modules;
create trigger modules_touch before update on public.modules for each row execute function app.touch_updated_at();
drop trigger if exists lessons_touch on public.lessons;
create trigger lessons_touch before update on public.lessons for each row execute function app.touch_updated_at();
drop trigger if exists enrollments_touch on public.enrollments;
create trigger enrollments_touch before update on public.enrollments for each row execute function app.touch_updated_at();
drop trigger if exists lesson_progress_touch on public.lesson_progress;
create trigger lesson_progress_touch before update on public.lesson_progress for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Enrollment guard: a learner may only self-enroll in a published, free course
-- and only when their account is active. Paid courses are enrolled by the
-- Stripe webhook (service role) or by an admin.
-- ---------------------------------------------------------------------------
create or replace function app.enroll_self(p_course uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course public.courses%rowtype;
  v_id uuid;
begin
  if not app.is_active_member() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;

  select * into v_course from public.courses where id = p_course;
  if not found or v_course.status <> 'published' then
    raise exception 'course_not_available' using errcode = '42501';
  end if;
  if v_course.price_cents > 0 then
    raise exception 'payment_required' using errcode = '42501';
  end if;

  insert into public.enrollments (user_id, course_id, source)
  values (auth.uid(), p_course, 'self')
  on conflict (user_id, course_id) do update set status = 'active'
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function app.enroll_self(uuid) to authenticated;


-- =============================================================================
-- =============================================================================
--
--   PART 03 OF 6   0003_assessment.sql   (16,998 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- AfriOrbit LMS — 0003 Assessment & Certification
--
-- Threat model for assessments:
--  * Correct answers are NEVER exposed to the client. They live in
--    quiz_questions.answer_key, which no RLS policy grants to learners.
--  * Grading happens in a SECURITY DEFINER function inside Postgres, so the
--    score cannot be forged by calling PostgREST directly.
--  * Attempts are server-timed: expires_at is set at start, not by the client.
-- =============================================================================

create table if not exists public.quizzes (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses(id) on delete cascade,
  lesson_id      uuid references public.lessons(id) on delete set null,
  slug           text not null,
  title          text not null,
  instructions   text not null default '',
  -- 'practice' quizzes never gate a certificate; 'graded' ones do.
  is_graded      boolean not null default true,
  pass_threshold int not null default 70 check (pass_threshold between 0 and 100),
  time_limit_minutes int,           -- null = untimed
  max_attempts   int not null default 3 check (max_attempts >= 1),
  -- Draw N questions at random from the bank; 0 = serve all.
  questions_per_attempt int not null default 0 check (questions_per_attempt >= 0),
  shuffle_questions boolean not null default true,
  shuffle_options   boolean not null default true,
  -- Show which items were wrong after submission?
  reveal_feedback boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (course_id, slug)
);

create table if not exists public.quiz_questions (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  kind         question_kind not null default 'single_choice',
  prompt_md    text not null,
  -- Options for choice questions: [{ "id": "a", "text": "..." }, ...]
  options      jsonb not null default '[]'::jsonb,
  -- Answer key. Shape depends on kind:
  --   single_choice / true_false : { "correct": "a" }
  --   multi_choice               : { "correct": ["a","c"] }
  --   numeric                    : { "value": 12.5, "tolerance": 0.5, "unit": "dB" }
  --   short_text                 : { "accept": ["ax.25","ax25"] }  (case-folded)
  answer_key   jsonb not null default '{}'::jsonb,
  explanation_md text not null default '',
  points       numeric(6,2) not null default 1 check (points > 0),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists quiz_questions_quiz_idx on public.quiz_questions (quiz_id, sort_order);

-- A learner-safe projection: everything except the answer key.
create or replace view public.quiz_questions_public
with (security_invoker = true) as
  select id, quiz_id, kind, prompt_md, options, points, sort_order
    from public.quiz_questions;

create table if not exists public.quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  attempt_no   int not null,
  status       attempt_status not null default 'in_progress',
  -- Question ids served for this attempt, in served order.
  question_ids uuid[] not null default '{}',
  -- Learner responses keyed by question id.
  responses    jsonb not null default '{}'::jsonb,
  -- Per-question grading detail, written only by app.grade_attempt().
  breakdown    jsonb not null default '[]'::jsonb,
  score_pct    numeric(5,2),
  points_earned numeric(8,2),
  points_possible numeric(8,2),
  passed       boolean,
  started_at   timestamptz not null default now(),
  expires_at   timestamptz,
  submitted_at timestamptz,
  graded_at    timestamptz,
  ip_hash      text,          -- salted hash, for integrity review only
  user_agent   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (quiz_id, user_id, attempt_no)
);

create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, quiz_id);

-- ---------------------------------------------------------------------------
-- Start an attempt. Enforces enrollment, attempt cap, and server-side timing.
-- ---------------------------------------------------------------------------
create or replace function app.start_quiz_attempt(p_quiz uuid)
returns public.quiz_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quiz    public.quizzes%rowtype;
  v_used    int;
  v_ids     uuid[];
  v_attempt public.quiz_attempts%rowtype;
begin
  if not app.is_active_member() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'quiz_not_found' using errcode = '42704';
  end if;

  if not exists (
    select 1 from public.enrollments
     where user_id = auth.uid() and course_id = v_quiz.course_id
       and status in ('active', 'completed')
  ) then
    raise exception 'not_enrolled' using errcode = '42501';
  end if;

  -- Resume an unexpired in-progress attempt rather than burning a new one.
  select * into v_attempt from public.quiz_attempts
   where quiz_id = p_quiz and user_id = auth.uid() and status = 'in_progress'
     and (expires_at is null or expires_at > now())
   order by attempt_no desc limit 1;
  if found then
    return v_attempt;
  end if;

  -- Expire any stale in-progress attempts so they count against the cap.
  update public.quiz_attempts
     set status = 'abandoned'
   where quiz_id = p_quiz and user_id = auth.uid() and status = 'in_progress';

  select count(*) into v_used from public.quiz_attempts
   where quiz_id = p_quiz and user_id = auth.uid();
  if v_used >= v_quiz.max_attempts then
    raise exception 'attempt_limit_reached' using errcode = '42501';
  end if;

  select array_agg(id order by
           case when v_quiz.shuffle_questions then random() else sort_order end)
    into v_ids
    from (
      select id, sort_order from public.quiz_questions where quiz_id = p_quiz
       order by case when v_quiz.shuffle_questions then random() else sort_order end
       limit case when v_quiz.questions_per_attempt > 0
                  then v_quiz.questions_per_attempt else null end
    ) q;

  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'quiz_has_no_questions' using errcode = '22023';
  end if;

  insert into public.quiz_attempts
    (quiz_id, user_id, course_id, attempt_no, question_ids, expires_at)
  values
    (p_quiz, auth.uid(), v_quiz.course_id, v_used + 1, v_ids,
     case when v_quiz.time_limit_minutes is not null
          then now() + make_interval(mins => v_quiz.time_limit_minutes) end)
  returning * into v_attempt;

  return v_attempt;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grade an attempt. All comparison logic is server-side.
-- ---------------------------------------------------------------------------
create or replace function app.grade_attempt(p_attempt uuid, p_responses jsonb)
returns public.quiz_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt  public.quiz_attempts%rowtype;
  v_quiz     public.quizzes%rowtype;
  v_q        public.quiz_questions%rowtype;
  v_qid      uuid;
  v_given    jsonb;
  v_correct  boolean;
  v_earned   numeric := 0;
  v_possible numeric := 0;
  v_break    jsonb := '[]'::jsonb;
  v_expected jsonb;
  v_num      numeric;
  v_tol      numeric;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt;
  if not found or v_attempt.user_id <> auth.uid() then
    raise exception 'attempt_not_found' using errcode = '42704';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt_already_submitted' using errcode = '22023';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  -- A late submission still grades, but only the answers already recorded
  -- server-side count; we accept the payload only if within grace.
  if v_attempt.expires_at is not null and now() > v_attempt.expires_at + interval '30 seconds' then
    p_responses := v_attempt.responses;
  end if;

  foreach v_qid in array v_attempt.question_ids loop
    select * into v_q from public.quiz_questions where id = v_qid;
    continue when not found;

    v_possible := v_possible + v_q.points;
    v_given    := p_responses -> v_qid::text;
    v_correct  := false;

    if v_given is not null then
      case v_q.kind
        when 'single_choice', 'true_false' then
          v_correct := lower(coalesce(v_given #>> '{}', '')) =
                       lower(coalesce(v_q.answer_key ->> 'correct', '\x00'));

        when 'multi_choice' then
          -- Exact set match; partial credit is intentionally not awarded.
          v_expected := v_q.answer_key -> 'correct';
          v_correct := (
            select coalesce(
              (select array_agg(x order by x) from jsonb_array_elements_text(v_given) x)
              =
              (select array_agg(y order by y) from jsonb_array_elements_text(v_expected) y),
            false)
          );

        when 'numeric' then
          begin
            v_num := (v_given #>> '{}')::numeric;
            v_tol := coalesce((v_q.answer_key ->> 'tolerance')::numeric, 0);
            v_correct := abs(v_num - (v_q.answer_key ->> 'value')::numeric) <= v_tol;
          exception when others then
            v_correct := false;
          end;

        when 'short_text' then
          v_correct := exists (
            select 1 from jsonb_array_elements_text(v_q.answer_key -> 'accept') a
             where lower(trim(a)) = lower(trim(coalesce(v_given #>> '{}', '')))
          );
      end case;
    end if;

    if v_correct then
      v_earned := v_earned + v_q.points;
    end if;

    v_break := v_break || jsonb_build_object(
      'question_id', v_qid,
      'correct', v_correct,
      'points', case when v_correct then v_q.points else 0 end,
      'explanation_md', case when v_quiz.reveal_feedback then v_q.explanation_md else '' end
    );
  end loop;

  update public.quiz_attempts
     set responses    = p_responses,
         breakdown    = v_break,
         points_earned = v_earned,
         points_possible = v_possible,
         score_pct    = case when v_possible > 0
                             then round((v_earned / v_possible) * 100, 2) else 0 end,
         passed       = case when v_possible > 0
                             then round((v_earned / v_possible) * 100, 2) >= v_quiz.pass_threshold
                             else false end,
         status       = 'graded',
         submitted_at = now(),
         graded_at    = now()
   where id = p_attempt
  returning * into v_attempt;

  return v_attempt;
end;
$$;

grant execute on function app.start_quiz_attempt(uuid), app.grade_attempt(uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------------
create table if not exists public.certificates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  course_id       uuid not null references public.courses(id) on delete cascade,
  -- Human-shareable verification code, e.g. AO-2026-7Q4KX2M9
  code            text not null unique,
  -- Snapshot of identity at issue time so later profile edits cannot rewrite
  -- what a certificate claims.
  recipient_name  text not null,
  course_title    text not null,
  final_score_pct numeric(5,2),
  hours           numeric(6,2),
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz,
  revoked_at      timestamptz,
  revoked_reason  text,
  -- sha256 over the canonical claim string; printed on the PDF so a verifier
  -- can detect an altered document.
  integrity_hash  text not null,
  created_at      timestamptz not null default now(),
  unique (user_id, course_id)
);

create index if not exists certificates_code_idx on public.certificates (code);

-- Public, non-enumerable verification projection (no user_id, no email).
create or replace view public.certificate_verification
with (security_invoker = false) as
  select c.code,
         c.recipient_name,
         c.course_title,
         c.final_score_pct,
         c.issued_at,
         c.expires_at,
         (c.revoked_at is null) as is_valid,
         c.integrity_hash
    from public.certificates c;

create or replace function app.generate_certificate_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I/O/0/1
  out_code text := '';
  i int;
begin
  for i in 1..8 loop
    out_code := out_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'AO-' || to_char(now(), 'YYYY') || '-' || out_code;
end;
$$;

-- Issue a certificate if — and only if — the learner actually finished the
-- course and cleared every graded quiz. Called by the app after completion.
create or replace function app.issue_certificate(p_course uuid)
returns public.certificates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course public.courses%rowtype;
  v_enr    public.enrollments%rowtype;
  v_prof   public.profiles%rowtype;
  v_cert   public.certificates%rowtype;
  v_score  numeric;
  v_failed int;
  v_code   text;
  v_hours  numeric;
begin
  select * into v_prof from public.profiles where id = auth.uid();
  if not found or v_prof.status <> 'active' then
    raise exception 'account_not_active' using errcode = '42501';
  end if;

  select * into v_course from public.courses where id = p_course;
  if not found or not v_course.issues_certificate then
    raise exception 'certificate_not_offered' using errcode = '22023';
  end if;

  select * into v_enr from public.enrollments
   where user_id = auth.uid() and course_id = p_course;
  if not found or v_enr.progress_pct < 100 then
    raise exception 'course_incomplete' using errcode = '42501';
  end if;

  -- Every graded quiz in the course must have at least one passing attempt.
  select count(*) into v_failed
    from public.quizzes q
   where q.course_id = p_course and q.is_graded
     and not exists (
       select 1 from public.quiz_attempts a
        where a.quiz_id = q.id and a.user_id = auth.uid() and a.passed
     );
  if v_failed > 0 then
    raise exception 'assessments_outstanding' using errcode = '42501';
  end if;

  select round(avg(best), 2) into v_score from (
    select max(a.score_pct) as best
      from public.quiz_attempts a
      join public.quizzes q on q.id = a.quiz_id
     where q.course_id = p_course and q.is_graded and a.user_id = auth.uid()
     group by q.id
  ) s;

  select round(coalesce(sum(l.estimated_minutes), 0) / 60.0, 2) into v_hours
    from public.lessons l where l.course_id = p_course;

  select * into v_cert from public.certificates
   where user_id = auth.uid() and course_id = p_course;
  if found then
    return v_cert;
  end if;

  loop
    v_code := app.generate_certificate_code();
    exit when not exists (select 1 from public.certificates where code = v_code);
  end loop;

  insert into public.certificates
    (user_id, course_id, code, recipient_name, course_title,
     final_score_pct, hours, integrity_hash)
  values
    (auth.uid(), p_course, v_code,
     coalesce(nullif(v_prof.full_name, ''), split_part(v_prof.email::text, '@', 1)),
     v_course.title, v_score, v_hours,
     encode(digest(
       v_code || '|' || coalesce(v_prof.full_name, '') || '|' || v_course.title ||
       '|' || coalesce(v_score::text, '') || '|' || now()::text, 'sha256'), 'hex'))
  returning * into v_cert;

  return v_cert;
end;
$$;

grant execute on function app.issue_certificate(uuid) to authenticated;

drop trigger if exists quizzes_touch on public.quizzes;
create trigger quizzes_touch before update on public.quizzes for each row execute function app.touch_updated_at();
drop trigger if exists quiz_questions_touch on public.quiz_questions;
create trigger quiz_questions_touch before update on public.quiz_questions for each row execute function app.touch_updated_at();
drop trigger if exists quiz_attempts_touch on public.quiz_attempts;
create trigger quiz_attempts_touch before update on public.quiz_attempts for each row execute function app.touch_updated_at();


-- =============================================================================
-- =============================================================================
--
--   PART 04 OF 6   0004_labs.sql   (12,845 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- AfriOrbit LMS — 0004 Cohorts, Hardware Kits, Lab Sessions, Lab Reports
--
-- This is the layer that makes the platform fit hands-on CubeSat / satellite-
-- IoT training rather than generic e-learning: physical kits are tracked as
-- inventory, lab sessions have capacity and a ground-station window, and
-- lab reports carry structured telemetry evidence alongside prose.
-- =============================================================================

create table if not exists public.cohorts (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  slug          text not null unique,
  name          text not null,
  -- Delivery mode matters for kit logistics.
  delivery_mode text not null default 'hybrid'
                check (delivery_mode in ('online', 'in_person', 'hybrid')),
  location      text,
  timezone      text not null default 'Africa/Nairobi',
  starts_on     date not null,
  ends_on       date not null,
  enrollment_opens_at  timestamptz,
  enrollment_closes_at timestamptz,
  capacity      int not null default 24 check (capacity > 0),
  seats_taken   int not null default 0 check (seats_taken >= 0),
  lead_instructor_id uuid references public.profiles(id) on delete set null,
  notes         text,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists cohorts_course_idx on public.cohorts (course_id);

alter table public.enrollments
  drop constraint if exists enrollments_cohort_id_fkey;
alter table public.enrollments
  add constraint enrollments_cohort_id_fkey
  foreign key (cohort_id) references public.cohorts(id) on delete set null;

-- ---------------------------------------------------------------------------
-- hardware_kits — physical EduSat / IoT edge device inventory
-- ---------------------------------------------------------------------------
create table if not exists public.hardware_kits (
  id            uuid primary key default gen_random_uuid(),
  asset_tag     text not null unique,           -- e.g. AO-EDUSAT-014
  kit_type      text not null default 'edusat_1u',
  -- Freeform but structured: {"obc":"STM32H7","radio":"SX1262","band":"UHF 435-438 MHz"}
  spec          jsonb not null default '{}'::jsonb,
  firmware_version text,
  status        kit_status not null default 'available',
  location      text,
  condition_notes text,
  last_serviced_on date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.kit_assignments (
  id           uuid primary key default gen_random_uuid(),
  kit_id       uuid not null references public.hardware_kits(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  cohort_id    uuid references public.cohorts(id) on delete set null,
  assigned_at  timestamptz not null default now(),
  due_back_on  date,
  returned_at  timestamptz,
  return_condition text,
  assigned_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists kit_assignments_user_idx on public.kit_assignments (user_id);
create unique index if not exists kit_assignments_one_open_per_kit
  on public.kit_assignments (kit_id) where returned_at is null;

-- Flip kit status as assignments open and close.
create or replace function app.sync_kit_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.hardware_kits set status = 'assigned' where id = new.kit_id;
  elsif tg_op = 'UPDATE' and new.returned_at is not null and old.returned_at is null then
    update public.hardware_kits set status = 'available' where id = new.kit_id;
  end if;
  return null;
end;
$$;

drop trigger if exists kit_assignment_sync on public.kit_assignments;
create trigger kit_assignment_sync after insert or update on public.kit_assignments
  for each row execute function app.sync_kit_status();

-- ---------------------------------------------------------------------------
-- lab_sessions — scheduled hands-on blocks, optionally tied to a real pass
-- ---------------------------------------------------------------------------
create table if not exists public.lab_sessions (
  id            uuid primary key default gen_random_uuid(),
  cohort_id     uuid not null references public.cohorts(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  lesson_id     uuid references public.lessons(id) on delete set null,
  title         text not null,
  objective     text not null default '',
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  capacity      int not null default 12 check (capacity > 0),
  location      text,
  meeting_url   text,
  -- Ground-segment context for pass-scheduled labs.
  ground_station text,
  norad_id       int,
  -- Cached TLE so a session can be replayed/verified later.
  tle_line1      text,
  tle_line2      text,
  instructor_id  uuid references public.profiles(id) on delete set null,
  safety_brief_md text not null default '',
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists lab_sessions_cohort_idx on public.lab_sessions (cohort_id, starts_at);

create table if not exists public.lab_bookings (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.lab_sessions(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'booked'
               check (status in ('booked', 'attended', 'no_show', 'cancelled')),
  booked_at    timestamptz not null default now(),
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  unique (session_id, user_id)
);

-- Capacity is enforced in the database, not the UI, so concurrent bookings
-- cannot oversubscribe a bench with limited hardware.
create or replace function app.book_lab_session(p_session uuid)
returns public.lab_bookings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.lab_sessions%rowtype;
  v_count   int;
  v_booking public.lab_bookings%rowtype;
begin
  if not app.is_active_member() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;

  select * into v_session from public.lab_sessions where id = p_session for update;
  if not found or not v_session.is_published then
    raise exception 'session_not_available' using errcode = '42704';
  end if;
  if v_session.starts_at < now() then
    raise exception 'session_already_started' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.enrollments
     where user_id = auth.uid() and course_id = v_session.course_id
       and status in ('active', 'completed')
  ) then
    raise exception 'not_enrolled' using errcode = '42501';
  end if;

  select count(*) into v_count from public.lab_bookings
   where session_id = p_session and status in ('booked', 'attended');
  if v_count >= v_session.capacity then
    raise exception 'session_full' using errcode = '42501';
  end if;

  insert into public.lab_bookings (session_id, user_id)
  values (p_session, auth.uid())
  on conflict (session_id, user_id)
  do update set status = 'booked', cancelled_at = null
  returning * into v_booking;

  return v_booking;
end;
$$;

grant execute on function app.book_lab_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- lab_reports — the graded deliverable of a hands-on exercise
-- ---------------------------------------------------------------------------
create table if not exists public.lab_assignments (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses(id) on delete cascade,
  lesson_id       uuid references public.lessons(id) on delete set null,
  slug            text not null,
  title           text not null,
  brief_md        text not null default '',
  -- Structured rubric: [{ "criterion": "...", "weight": 30, "descriptor": "..." }]
  rubric          jsonb not null default '[]'::jsonb,
  -- Structured data fields the learner must supply, e.g. measured RSSI / SNR.
  -- [{ "key":"rssi_dbm", "label":"Measured RSSI (dBm)", "type":"number" }]
  data_schema     jsonb not null default '[]'::jsonb,
  max_points      numeric(6,2) not null default 100,
  pass_threshold  int not null default 60 check (pass_threshold between 0 and 100),
  allow_resubmit  boolean not null default true,
  due_offset_days int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (course_id, slug)
);

create table if not exists public.lab_reports (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.lab_assignments(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  course_id      uuid not null references public.courses(id) on delete cascade,
  cohort_id      uuid references public.cohorts(id) on delete set null,
  kit_id         uuid references public.hardware_kits(id) on delete set null,
  status         submission_status not null default 'draft',
  narrative_md   text not null default '',
  -- Values matching lab_assignments.data_schema
  data           jsonb not null default '{}'::jsonb,
  -- Storage object paths in the private `lab-uploads` bucket.
  attachment_paths text[] not null default '{}',
  submitted_at   timestamptz,
  -- Grading
  grader_id      uuid references public.profiles(id) on delete set null,
  points_awarded numeric(6,2),
  rubric_scores  jsonb not null default '[]'::jsonb,
  feedback_md    text not null default '',
  graded_at      timestamptz,
  passed         boolean,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (assignment_id, user_id)
);

create index if not exists lab_reports_course_idx on public.lab_reports (course_id, status);
create index if not exists lab_reports_user_idx   on public.lab_reports (user_id);

-- ---------------------------------------------------------------------------
-- telemetry_captures — packets a learner decoded in the sandbox or captured
-- from a real pass. Kept small and append-only; useful as lab evidence.
-- ---------------------------------------------------------------------------
create table if not exists public.telemetry_captures (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  session_id   uuid references public.lab_sessions(id) on delete set null,
  kit_id       uuid references public.hardware_kits(id) on delete set null,
  source       text not null default 'sandbox'
               check (source in ('sandbox', 'bench', 'ground_station')),
  captured_at  timestamptz not null default now(),
  raw_hex      text not null check (raw_hex ~ '^[0-9a-fA-F]*$' and length(raw_hex) <= 8192),
  decoded      jsonb not null default '{}'::jsonb,
  rssi_dbm     numeric(6,2),
  snr_db       numeric(6,2),
  frame_valid  boolean,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists telemetry_captures_user_idx
  on public.telemetry_captures (user_id, captured_at desc);

drop trigger if exists cohorts_touch on public.cohorts;
create trigger cohorts_touch before update on public.cohorts for each row execute function app.touch_updated_at();
drop trigger if exists hardware_kits_touch on public.hardware_kits;
create trigger hardware_kits_touch before update on public.hardware_kits for each row execute function app.touch_updated_at();
drop trigger if exists lab_sessions_touch on public.lab_sessions;
create trigger lab_sessions_touch before update on public.lab_sessions for each row execute function app.touch_updated_at();
drop trigger if exists lab_assignments_touch on public.lab_assignments;
create trigger lab_assignments_touch before update on public.lab_assignments for each row execute function app.touch_updated_at();
drop trigger if exists lab_reports_touch on public.lab_reports;
create trigger lab_reports_touch before update on public.lab_reports for each row execute function app.touch_updated_at();


-- =============================================================================
-- =============================================================================
--
--   PART 05 OF 6   0005_commerce_and_audit.sql   (10,364 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- AfriOrbit LMS — 0005 Commerce, Invitations, Audit, Rate Limiting
-- =============================================================================

-- ---------------------------------------------------------------------------
-- orders — one row per Stripe Checkout session
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.profiles(id) on delete set null,
  email              citext not null,
  course_id          uuid references public.courses(id) on delete set null,
  cohort_id          uuid references public.cohorts(id) on delete set null,
  quantity           int not null default 1 check (quantity > 0),
  seats_remaining    int not null default 0 check (seats_remaining >= 0),
  amount_cents       int not null check (amount_cents >= 0),
  currency           text not null default 'USD',
  status             order_status not null default 'pending',
  stripe_session_id  text unique,
  stripe_payment_intent text,
  discount_code      text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);

-- Idempotency ledger for Stripe webhooks. Stripe retries aggressively; without
-- this a retried `checkout.session.completed` would double-enroll or double
-- decrement seats.
create table if not exists public.webhook_events (
  id           text primary key,          -- Stripe event id (evt_...)
  type         text not null,
  received_at  timestamptz not null default now(),
  payload      jsonb
);

-- ---------------------------------------------------------------------------
-- discount_codes + invitations
-- ---------------------------------------------------------------------------
create table if not exists public.discount_codes (
  id            uuid primary key default gen_random_uuid(),
  code          citext not null unique,
  percent_off   int check (percent_off between 1 and 100),
  amount_off_cents int check (amount_off_cents > 0),
  course_id     uuid references public.courses(id) on delete cascade,
  max_redemptions int,
  redemptions   int not null default 0,
  starts_at     timestamptz,
  expires_at    timestamptz,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (percent_off is not null or amount_off_cents is not null)
);

-- Invitation codes let AfriOrbit onboard a partner institution's engineers
-- without opening public registration for a private cohort.
create table if not exists public.invitations (
  id            uuid primary key default gen_random_uuid(),
  -- Only the hash is stored; the plaintext code is shown once at creation.
  code_hash     text not null unique,
  code_hint     text not null,          -- last 4 chars, for admin recognition
  email         citext,                 -- optional: bind to one recipient
  course_id     uuid references public.courses(id) on delete cascade,
  cohort_id     uuid references public.cohorts(id) on delete cascade,
  grants_role   app_role not null default 'learner',
  -- Auto-approve the account on redemption, skipping the manual gate.
  auto_approve  boolean not null default true,
  max_uses      int not null default 1 check (max_uses >= 1),
  uses          int not null default 0,
  expires_at    timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create or replace function app.redeem_invitation(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv  public.invitations%rowtype;
  v_hash text := encode(digest(upper(trim(p_code)), 'sha256'), 'hex');
  v_prof public.profiles%rowtype;
begin
  select * into v_prof from public.profiles where id = auth.uid();
  if not found then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations where code_hash = v_hash for update;
  if not found then
    raise exception 'invalid_code' using errcode = '22023';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'code_expired' using errcode = '22023';
  end if;
  if v_inv.uses >= v_inv.max_uses then
    raise exception 'code_exhausted' using errcode = '22023';
  end if;
  if v_inv.email is not null and lower(v_inv.email::text) <> lower(v_prof.email::text) then
    raise exception 'code_not_for_this_account' using errcode = '22023';
  end if;

  update public.invitations set uses = uses + 1 where id = v_inv.id;

  if v_inv.auto_approve and v_prof.status = 'pending' then
    update public.profiles
       set status = 'active', approved_at = now()
     where id = auth.uid();
  end if;

  -- Never let an invitation grant admin; instructor is the ceiling.
  if v_inv.grants_role = 'instructor' and v_prof.role = 'learner' then
    update public.profiles set role = 'instructor' where id = auth.uid();
  end if;

  if v_inv.course_id is not null then
    insert into public.enrollments (user_id, course_id, cohort_id, source)
    values (auth.uid(), v_inv.course_id, v_inv.cohort_id, 'invite')
    on conflict (user_id, course_id) do update
      set status = 'active', cohort_id = coalesce(excluded.cohort_id, public.enrollments.cohort_id);
  end if;

  return jsonb_build_object(
    'course_id', v_inv.course_id,
    'cohort_id', v_inv.cohort_id,
    'approved', v_inv.auto_approve
  );
end;
$$;

grant execute on function app.redeem_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- audit_log — append-only. No UPDATE/DELETE policy exists for anyone.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_email citext,
  action      text not null,
  entity      text,
  entity_id   text,
  -- Salted hash rather than raw IP, so the log is useful for incident review
  -- without becoming a database of learners' addresses.
  ip_hash     text,
  user_agent  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_action_idx on public.audit_log (action, created_at desc);

create or replace function app.write_audit(
  p_action text,
  p_entity text default null,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_ip_hash text default null,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_email citext;
begin
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.audit_log
    (actor_id, actor_email, action, entity, entity_id, metadata, ip_hash, user_agent)
  values
    (auth.uid(), v_email, p_action, p_entity, p_entity_id, p_metadata, p_ip_hash, p_user_agent);
end;
$$;

grant execute on function app.write_audit(text, text, text, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- rate_limits — Postgres-backed fixed-window counter.
-- Keeps the deployment to one backing service; swap for Upstash if you need
-- limits shared across regions at high volume.
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket      text not null,
  window_start timestamptz not null,
  hits        int not null default 0,
  primary key (bucket, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

create or replace function app.rate_limit_hit(
  p_bucket text,
  p_limit int,
  p_window_seconds int
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_hits  int;
begin
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start)
    do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits', v_hits,
    'limit', p_limit,
    'reset_at', v_start + make_interval(secs => p_window_seconds)
  );
end;
$$;

revoke execute on function app.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function app.rate_limit_hit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- announcements — instructor/admin broadcast, scoped to course or cohort
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid references public.courses(id) on delete cascade,
  cohort_id  uuid references public.cohorts(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  title      text not null,
  body_md    text not null default '',
  pinned     boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists announcements_course_idx
  on public.announcements (course_id, published_at desc);

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function app.touch_updated_at();


-- =============================================================================
-- =============================================================================
--
--   PART 06 OF 6   0006_rls.sql   (26,012 bytes)
--
-- =============================================================================
-- =============================================================================

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
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_staff_select on public.profiles;
create policy profiles_staff_select on public.profiles
  for select to authenticated
  using (app.is_staff());

-- A user may edit their own profile. Which COLUMNS they may edit is enforced
-- with column-level UPDATE privileges below, not with a trigger — a trigger
-- that has to distinguish trusted callers is fragile, and column privileges
-- are checked by the planner before any policy runs.
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_admin_update on public.profiles;
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
drop policy if exists tracks_public_select on public.tracks;
create policy tracks_public_select on public.tracks
  for select to anon, authenticated
  using (is_published or app.is_staff());

drop policy if exists tracks_staff_write on public.tracks;
create policy tracks_staff_write on public.tracks
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

drop policy if exists courses_public_select on public.courses;
create policy courses_public_select on public.courses
  for select to anon, authenticated
  using (status = 'published' or app.is_staff());

drop policy if exists courses_admin_write on public.courses;
create policy courses_admin_write on public.courses
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Instructors may edit courses they are assigned to.
drop policy if exists courses_instructor_update on public.courses;
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

drop policy if exists course_instructors_select on public.course_instructors;
create policy course_instructors_select on public.course_instructors
  for select to anon, authenticated using (true);

drop policy if exists course_instructors_admin_write on public.course_instructors;
create policy course_instructors_admin_write on public.course_instructors
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

drop policy if exists modules_select on public.modules;
create policy modules_select on public.modules
  for select to anon, authenticated
  using (
    app.is_staff()
    or exists (select 1 from public.courses c
                where c.id = course_id and c.status = 'published')
  );

drop policy if exists modules_staff_write on public.modules;
create policy modules_staff_write on public.modules
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- Lesson rows are visible for published courses so the syllabus can be shown,
-- but content_md is redacted for non-entitled users by the view below.
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons
  for select to anon, authenticated
  using (
    app.is_staff()
    or exists (select 1 from public.courses c
                where c.id = course_id and c.status = 'published')
  );

drop policy if exists lessons_staff_write on public.lessons;
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
drop policy if exists enrollments_self_select on public.enrollments;
create policy enrollments_self_select on public.enrollments
  for select to authenticated using (user_id = auth.uid());

drop policy if exists enrollments_staff_select on public.enrollments;
create policy enrollments_staff_select on public.enrollments
  for select to authenticated using (app.is_staff());

drop policy if exists enrollments_admin_write on public.enrollments;
create policy enrollments_admin_write on public.enrollments
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Note: no self-INSERT policy. Learners enroll via app.enroll_self(), which
-- validates price and publication state. Direct inserts are denied.

drop policy if exists lesson_progress_self_all on public.lesson_progress;
create policy lesson_progress_self_all on public.lesson_progress
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and app.can_read_lesson(lesson_id)   -- cannot mark unentitled lessons done
  );

drop policy if exists lesson_progress_staff_select on public.lesson_progress;
create policy lesson_progress_staff_select on public.lesson_progress
  for select to authenticated using (app.is_staff());

-- ---------------------------------------------------------------------------
-- quizzes — questions table itself is staff-only; learners use the view.
-- ---------------------------------------------------------------------------
drop policy if exists quizzes_select on public.quizzes;
create policy quizzes_select on public.quizzes
  for select to authenticated
  using (
    app.is_staff()
    or exists (select 1 from public.enrollments e
                where e.user_id = auth.uid() and e.course_id = quizzes.course_id
                  and e.status in ('active', 'completed'))
  );

drop policy if exists quizzes_staff_write on public.quizzes;
create policy quizzes_staff_write on public.quizzes
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- Answer keys: staff only. The learner-facing `quiz_questions_public` view is
-- security_invoker, so it inherits this policy — which would block learners.
-- We therefore add a second policy that exposes rows but the view's column
-- list omits answer_key, so no key ever leaves the database.
drop policy if exists quiz_questions_staff_all on public.quiz_questions;
create policy quiz_questions_staff_all on public.quiz_questions
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

drop policy if exists quiz_questions_enrolled_select on public.quiz_questions;
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

drop policy if exists quiz_attempts_self_select on public.quiz_attempts;
create policy quiz_attempts_self_select on public.quiz_attempts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists quiz_attempts_staff_select on public.quiz_attempts;
create policy quiz_attempts_staff_select on public.quiz_attempts
  for select to authenticated using (app.is_staff());

-- Attempts are created and graded exclusively through SECURITY DEFINER
-- functions, so there is deliberately no INSERT/UPDATE policy for learners.
drop policy if exists quiz_attempts_staff_update on public.quiz_attempts;
create policy quiz_attempts_staff_update on public.quiz_attempts
  for update to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- ---------------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------------
drop policy if exists certificates_self_select on public.certificates;
create policy certificates_self_select on public.certificates
  for select to authenticated using (user_id = auth.uid());

drop policy if exists certificates_staff_all on public.certificates;
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
drop policy if exists cohorts_select on public.cohorts;
create policy cohorts_select on public.cohorts
  for select to anon, authenticated
  using (is_published or app.is_staff());

drop policy if exists cohorts_staff_write on public.cohorts;
create policy cohorts_staff_write on public.cohorts
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- Inventory is staff-only; a learner sees their own assignment, not the fleet.
drop policy if exists hardware_kits_staff_all on public.hardware_kits;
create policy hardware_kits_staff_all on public.hardware_kits
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

drop policy if exists kit_assignments_self_select on public.kit_assignments;
create policy kit_assignments_self_select on public.kit_assignments
  for select to authenticated using (user_id = auth.uid());

drop policy if exists kit_assignments_staff_all on public.kit_assignments;
create policy kit_assignments_staff_all on public.kit_assignments
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

drop policy if exists lab_sessions_select on public.lab_sessions;
create policy lab_sessions_select on public.lab_sessions
  for select to authenticated
  using (
    app.is_staff()
    or (is_published and exists (
      select 1 from public.enrollments e
       where e.user_id = auth.uid() and e.course_id = lab_sessions.course_id
         and e.status in ('active', 'completed')))
  );

drop policy if exists lab_sessions_staff_write on public.lab_sessions;
create policy lab_sessions_staff_write on public.lab_sessions
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

drop policy if exists lab_bookings_self_select on public.lab_bookings;
create policy lab_bookings_self_select on public.lab_bookings
  for select to authenticated using (user_id = auth.uid());

-- Learners may cancel their own booking; creation goes through
-- app.book_lab_session() so capacity is enforced under a row lock.
drop policy if exists lab_bookings_self_update on public.lab_bookings;
create policy lab_bookings_self_update on public.lab_bookings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status in ('booked', 'cancelled'));

drop policy if exists lab_bookings_staff_all on public.lab_bookings;
create policy lab_bookings_staff_all on public.lab_bookings
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

drop policy if exists lab_assignments_select on public.lab_assignments;
create policy lab_assignments_select on public.lab_assignments
  for select to authenticated
  using (
    app.is_staff()
    or exists (select 1 from public.enrollments e
                where e.user_id = auth.uid() and e.course_id = lab_assignments.course_id
                  and e.status in ('active', 'completed'))
  );

drop policy if exists lab_assignments_staff_write on public.lab_assignments;
create policy lab_assignments_staff_write on public.lab_assignments
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- A learner owns their report until it is submitted; after that only staff
-- may modify it. Enforced with a WITH CHECK on status plus a trigger.
drop policy if exists lab_reports_self_select on public.lab_reports;
create policy lab_reports_self_select on public.lab_reports
  for select to authenticated using (user_id = auth.uid());

drop policy if exists lab_reports_self_insert on public.lab_reports;
create policy lab_reports_self_insert on public.lab_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status in ('draft', 'submitted')
    and exists (select 1 from public.enrollments e
                 where e.user_id = auth.uid() and e.course_id = lab_reports.course_id
                   and e.status in ('active', 'completed'))
  );

drop policy if exists lab_reports_self_update on public.lab_reports;
create policy lab_reports_self_update on public.lab_reports
  for update to authenticated
  using (user_id = auth.uid() and status in ('draft', 'returned'))
  with check (user_id = auth.uid() and status in ('draft', 'submitted'));

drop policy if exists lab_reports_staff_all on public.lab_reports;
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

drop policy if exists telemetry_self_all on public.telemetry_captures;
create policy telemetry_self_all on public.telemetry_captures
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists telemetry_staff_select on public.telemetry_captures;
create policy telemetry_staff_select on public.telemetry_captures
  for select to authenticated using (app.is_staff());

-- ---------------------------------------------------------------------------
-- commerce
-- ---------------------------------------------------------------------------
drop policy if exists orders_self_select on public.orders;
create policy orders_self_select on public.orders
  for select to authenticated using (user_id = auth.uid());

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

drop policy if exists discount_codes_admin_all on public.discount_codes;
create policy discount_codes_admin_all on public.discount_codes
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Invitation rows are never readable by learners — redemption is by function.
drop policy if exists invitations_admin_all on public.invitations;
create policy invitations_admin_all on public.invitations
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

drop policy if exists webhook_events_none on public.webhook_events;
create policy webhook_events_none on public.webhook_events
  for select to authenticated using (app.is_admin());

-- ---------------------------------------------------------------------------
-- audit log — readable by admins, writable only via app.write_audit()
-- ---------------------------------------------------------------------------
drop policy if exists audit_log_admin_select on public.audit_log;
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
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated
  using (
    app.is_staff()
    or course_id is null
    or exists (select 1 from public.enrollments e
                where e.user_id = auth.uid() and e.course_id = announcements.course_id
                  and e.status in ('active', 'completed'))
  );

drop policy if exists announcements_staff_write on public.announcements;
create policy announcements_staff_write on public.announcements
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- ---------------------------------------------------------------------------
-- rate_limits — no policy at all: only service_role (which bypasses RLS)
-- and the SECURITY DEFINER function may touch it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Storage buckets and their policies
--
-- FAULT-TOLERANT ON PURPOSE, and the reason matters.
--
-- `storage.objects` is owned by `supabase_storage_admin`, not by the role the
-- SQL editor runs as. On some projects the editor role has been granted enough
-- to add policies to it and on others it has not, and there is no way to tell
-- from the dashboard which kind of project you have. When it has not, a bare
--
--     create policy course_media_read on storage.objects ...
--
-- fails with `must be owner of table objects` — and because this file is
-- applied as one script, that single error aborts everything after it. The
-- curriculum, the JWT hook and the commerce catalogue never run, over a
-- feature (file uploads) that is not on the critical path for signing in.
--
-- So each statement carries its own handler. A project that permits these gets
-- them; one that does not gets a WARNING naming the exact policy to add through
-- Storage → Policies, and the rest of the schema installs normally.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise warning 'storage.buckets is absent — skipping bucket creation. Normal outside Supabase.';
    return;
  end if;

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
exception
  when undefined_table then
    raise warning 'storage.buckets is absent — skipping bucket creation. This is normal outside Supabase.';
  when insufficient_privilege then
    raise warning 'Not permitted to create storage buckets from SQL. Create course-media (public), lab-uploads (private) and avatars (public) under Storage → New bucket.';
end $$;

do $$
declare
  spec  text[];
  specs text[][] := array[
    array['course_media_read', $p$
      for select to anon, authenticated
      using (bucket_id = 'course-media')
    $p$],
    array['course_media_write', $p$
      for all to authenticated
      using (bucket_id = 'course-media' and app.is_staff())
      with check (bucket_id = 'course-media' and app.is_staff())
    $p$],
    -- Lab uploads live under `<user-id>/<report-id>/<filename>`.
    array['lab_uploads_own', $p$
      for all to authenticated
      using (bucket_id = 'lab-uploads'
             and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'lab-uploads'
             and (storage.foldername(name))[1] = auth.uid()::text)
    $p$],
    array['lab_uploads_staff', $p$
      for select to authenticated
      using (bucket_id = 'lab-uploads' and app.is_staff())
    $p$],
    array['avatars_read', $p$
      for select to anon, authenticated
      using (bucket_id = 'avatars')
    $p$],
    array['avatars_own', $p$
      for all to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$]
  ];
begin
  -- Checked once rather than caught six times. Outside Supabase — a local
  -- Postgres, a dry run, a restored dump without the storage extension — the
  -- schema simply is not there, and that is not an error worth six warnings.
  if to_regclass('storage.objects') is null then
    raise warning 'storage.objects is absent — skipping all storage policies. Normal outside Supabase.';
    return;
  end if;

  foreach spec slice 1 in array specs loop
    begin
      execute format('drop policy if exists %I on storage.objects', spec[1]);
      execute format('create policy %I on storage.objects %s', spec[1], spec[2]);
    exception
      when insufficient_privilege then
        raise warning 'Could not create storage policy %. Add it under Storage → Policies; everything else in this migration is unaffected.', spec[1];
    end;
  end loop;
end $$;

