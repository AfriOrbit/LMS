-- ============================================================================
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
-- Part 08 creates `public.custom_access_token_hook`, which puts the account's
-- role and status into the JWT. Creating it is not the same as enabling it,
-- and enabling it is a dashboard setting with no SQL equivalent:
--
--   Authentication → Hooks → Customize Access Token (JWT) → select
--   public.custom_access_token_hook → Enable
--
-- Skip that and sign-in appears to work while every page treats the account as
-- having no role — which reads like a permissions bug and is not one.
-- ============================================================================


-- =============================================================================
-- =============================================================================
--
--   PART 01 OF 12   0001_foundation.sql   (11,308 bytes)
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
--   PART 02 OF 12   0002_catalog.sql   (11,974 bytes)
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
--   PART 03 OF 12   0003_assessment.sql   (16,998 bytes)
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
--   PART 04 OF 12   0004_labs.sql   (12,845 bytes)
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
--   PART 05 OF 12   0005_commerce_and_audit.sql   (10,364 bytes)
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
--   PART 06 OF 12   0006_rls.sql   (26,012 bytes)
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


-- =============================================================================
-- =============================================================================
--
--   PART 07 OF 12   0007_seed_curriculum.sql   (107,859 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- AfriOrbit LMS — 0007 Seed Curriculum
--
-- A real starter curriculum for the EduSat satellite-to-IoT programme.
-- Everything here is editable from the admin console; it exists so the
-- platform ships with defensible technical content rather than lorem ipsum.
--
-- Safe to re-run: all inserts are keyed on slug with ON CONFLICT DO UPDATE.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Helper: upsert a lesson and return its id
-- ---------------------------------------------------------------------------
create or replace function app.seed_lesson(
  p_module uuid, p_slug text, p_title text, p_kind lesson_kind,
  p_minutes int, p_order int, p_content text,
  p_preview boolean default false, p_sim text default null
) returns uuid
language plpgsql
as $fn$
declare v_id uuid; v_course uuid;
begin
  select course_id into v_course from public.modules where id = p_module;
  insert into public.lessons
    (module_id, course_id, slug, title, kind, estimated_minutes, sort_order,
     content_md, is_preview, simulation_key)
  values
    (p_module, v_course, p_slug, p_title, p_kind, p_minutes, p_order,
     p_content, p_preview, p_sim)
  on conflict (course_id, slug) do update
    set title = excluded.title, kind = excluded.kind,
        estimated_minutes = excluded.estimated_minutes,
        sort_order = excluded.sort_order, content_md = excluded.content_md,
        is_preview = excluded.is_preview, simulation_key = excluded.simulation_key,
        module_id = excluded.module_id
  returning id into v_id;
  return v_id;
end;
$fn$;

do $seed$
declare
  v_track uuid;
  c1 uuid; c2 uuid; c3 uuid;
  m uuid;
  q uuid;
  l uuid;
begin

-- ===========================================================================
-- TRACK
-- ===========================================================================
insert into public.tracks (slug, title, summary, description, level, sort_order, is_published)
values (
  'edusat-satellite-iot',
  'EduSat: Satellite-to-IoT Engineering',
  'From CubeSat bus fundamentals to a working store-and-forward IoT payload and ground segment.',
  'A three-course applied track built around the AfriOrbit EduSat 1U platform and the IoT edge device. Learners progress from systems-engineering fundamentals, through RF link design and protocol work, to flight and edge firmware — with hardware-in-the-loop labs and a live pass at the end.',
  'intermediate', 1, true
)
on conflict (slug) do update
  set title = excluded.title, summary = excluded.summary,
      description = excluded.description, is_published = true
returning id into v_track;

-- ===========================================================================
-- COURSE 1 — CubeSat Systems Engineering Fundamentals
-- ===========================================================================
insert into public.courses (
  track_id, slug, title, subtitle, summary, description, level, status,
  tags, prerequisites, outcomes, estimated_minutes, requires_hardware,
  hardware_notes, price_cents, issues_certificate, pass_threshold, sort_order,
  published_at
) values (
  v_track, 'cubesat-systems-fundamentals',
  'CubeSat Systems Engineering Fundamentals',
  'Form factor, subsystems, environment and verification',
  'Understand the CubeSat standard and every bus subsystem well enough to size a mission, build a power budget, and plan a test campaign.',
  'This course takes an engineer who knows electronics or software but has not flown hardware and gives them a working model of a complete small satellite. We cover the CubeSat Design Specification and deployer interface, then walk each bus subsystem — EPS, OBC/CDH, ADCS, comms, structure and thermal — with the sizing arithmetic that actually drives design decisions. The final module covers the LEO environment and the verification campaign that keeps a launch provider willing to carry you.',
  'foundation', 'published',
  array['cubesat','systems engineering','power budget','ADCS','verification'],
  array['Comfort with algebra and unit conversion','Basic electronics (Ohm''s law, DC power)','Any one programming language'],
  array[
    'Size a 1U–3U CubeSat against a mission concept and ConOps',
    'Build an orbit-average power budget including eclipse and duty cycles',
    'Select an ADCS architecture appropriate to a pointing requirement',
    'Explain the LEO environment''s effect on electronics and materials',
    'Plan a qualification and acceptance test campaign to GEVS levels'
  ],
  600, false,
  'No hardware required. Labs use the EduSat digital twin in the browser.',
  0, true, 70, 1, now()
)
on conflict (slug) do update
  set title = excluded.title, subtitle = excluded.subtitle, summary = excluded.summary,
      description = excluded.description, status = 'published', tags = excluded.tags,
      prerequisites = excluded.prerequisites, outcomes = excluded.outcomes,
      estimated_minutes = excluded.estimated_minutes, track_id = excluded.track_id,
      published_at = coalesce(public.courses.published_at, now())
returning id into c1;

-- --- Module 1.1 ------------------------------------------------------------
insert into public.modules (course_id, slug, title, summary, sort_order)
values (c1, 'form-factor-and-mission', 'The CubeSat Standard and Mission Design',
  'What the standard actually constrains, and how a mission concept becomes a set of requirements.', 1)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'what-a-cubesat-is', 'What a CubeSat Is (and Is Not)', 'reading', 25, 1,
$md$
## The unit

A CubeSat is defined by a mechanical envelope, not by a capability. One unit — **1U** — is a **100 mm × 100 mm × 113.5 mm** volume. The extra 13.5 mm in the Z axis accommodates the rails and the deployment switches; a common beginner error is to design to a 100 mm cube and then discover the rail standoffs have nowhere to live.

Units combine along the long axis: 1U, 1.5U, 2U, 3U, 6U, 12U, and 16U are all flown today. The **CubeSat Design Specification (CDS)**, maintained by California Polytechnic State University, is the governing document. Read the revision your launch provider cites — mass allowances have moved over time, and current revisions permit roughly **2 kg per U**, up from the original 1.33 kg.

What the standard constrains:

- **Envelope and rails.** Rails are hard-anodised, minimum 8.5 mm wide, and at least 75 % of the rail must contact the deployer. Nothing may protrude more than 6.5 mm beyond the rail plane.
- **Deployment switches.** The satellite must be electrically inert inside the deployer. At least one, usually two, kill switches on the rail ends.
- **Inhibits.** Typically three independent inhibits between the battery and any RF transmitter, and a **30-minute RF silence timer** plus a **45-minute deployable timer** after ejection.
- **Materials and outgassing.** TML ≤ 1.0 %, CVCM ≤ 0.1 % per ASTM E595 — the launch provider will not risk contaminating a primary payload worth three orders of magnitude more than yours.

What the standard does *not* constrain: your architecture, your bus voltage, your radio, your software, or your ambition.

## The deployer is the real interface

You do not integrate with a rocket. You integrate with a **deployer** — a P-POD, ISIPOD, NRCSD or similar — which is itself integrated with the launch vehicle or with the ISS airlock. The deployer imposes:

| Interface | Typical requirement |
|---|---|
| Random vibration | Qualification to GSFC-STD-7000 (GEVS) levels, ~14.1 g<sub>rms</sub>, 3 axes |
| Shock | Deployer separation and vehicle stage events |
| Thermal | Non-operating survival across the ascent and coast profile |
| Venting | Depressurisation without pressure build-up in enclosed volumes |
| Centre of mass | Within 20 mm of the geometric centre in X and Y for a 1U |
| Cleanliness | Visibly clean, often to a stated particulate level |

The centre-of-mass requirement quietly drives layout more than anything else in a 1U. Batteries are the densest thing you carry; put them off-centre and you will be adding ballast late in the build.

## Where the EduSat platform sits

The AfriOrbit EduSat is a **1U training platform** with a flight-representative bus and an IoT store-and-forward payload. It is deliberately not a flight-qualified spacecraft: it runs the same firmware architecture, the same telemetry framing, and the same radio chain as an orbital design, on a bench. Everything you learn about framing, power budgeting and ConOps transfers directly; the parts that do not transfer — radiation tolerance, thermal vacuum behaviour, launch loads — are exactly the parts we cover in Module 3 so you know what the twin is *not* telling you.

## A note on ambition versus schedule

The failure mode that kills more university and agency CubeSat programmes than any technical cause is scope. A 1U with a camera, a store-and-forward payload, a deployable antenna, three-axis control and an experimental propulsion module is not a mission; it is five missions sharing a battery. Pick one measurable objective, size everything to it, and treat everything else as a stretch goal that gets cut at the first schedule slip.
$md$, true);

perform app.seed_lesson(m, 'conops-and-requirements', 'ConOps, Requirements and the V-Model', 'reading', 30, 2,
$md$
## Start with the concept of operations

A **ConOps** is a narrative of what the spacecraft does, in order, from separation to disposal. Write it before you write a single requirement. A usable ConOps for a store-and-forward IoT mission reads something like:

1. **Ejection + 0 s.** All systems inert. Kill switches release.
2. **+30 min.** RF inhibit expires. Beacon begins at 1/60 s duty on UHF.
3. **+45 min.** Antenna deployment permitted. OBC commands burn-wire, confirms via continuity and monitors current.
4. **Commissioning, days 1–14.** Detumble with B-dot to below 1 °/s. Verify EPS charge cycle across ≥10 orbits. Downlink whole-orbit data. Range and refine the TLE.
5. **Nominal, days 15 onward.** Per orbit: enable payload receiver over the service area, buffer sensor uplinks, downlink the buffer over the primary ground station pass, then return to low-power cruise.
6. **Contingency.** On any of: battery below 30 % SoC, three consecutive watchdog resets, or no ground contact for 72 h → enter safe mode, minimum beacon only, await ground command.
7. **Disposal.** Passive decay. Verify decay lifetime meets the applicable post-mission disposal rule for your licensing jurisdiction.

Notice how much engineering that narrative already implies: a real-time clock that survives reset, non-volatile storage for the payload buffer, current sensing on the burn-wire line, an autonomous safe-mode state machine, and a definition of "no ground contact".

## Requirements flow down, verification flows up

The **V-model** is not bureaucracy; it is the only way a small team keeps track of why a part is on the board.

```
Mission objectives
   └─ System requirements ──────────────► System verification (end-to-end test)
        └─ Subsystem requirements ─────► Subsystem qualification
             └─ Component specs ───────► Component acceptance
```

Every requirement should be:

- **Uniquely identified.** `SYS-PWR-004`, not "the power thing".
- **Verifiable**, with the method named: **I**nspection, **A**nalysis, **D**emonstration, or **T**est.
- **Traceable** upward to an objective and downward to a design element.
- **Free of solution.** "The EPS shall maintain bus voltage within 3.2–4.2 V" is a requirement. "The EPS shall use an LTC3105" is a design choice pretending to be one.

A worked example:

| ID | Requirement | Parent | Verification |
|---|---|---|---|
| MIS-01 | Collect and relay sensor data from ground nodes across a 500 km × 500 km service area | — | Demonstration |
| SYS-COM-03 | The payload receiver shall achieve ≥ −137 dBm sensitivity at SF12/125 kHz | MIS-01 | Test |
| SYS-PWR-01 | The spacecraft shall close a positive orbit-average energy balance at 35 % eclipse fraction | MIS-01 | Analysis |
| SUB-EPS-07 | Battery depth of discharge shall not exceed 25 % in nominal operations | SYS-PWR-01 | Analysis + Test |

## Margins are requirements too

Carry explicit margin and state it. Standard practice on a first flight:

- **Mass:** 20 % at PDR, 10 % at CDR, 5 % at delivery.
- **Power:** 30 % at PDR, 20 % at CDR.
- **Link:** 3 dB minimum for a well-characterised link; 6 dB if the antenna pattern is not measured.
- **Data:** 2× the computed downlink volume.

Margin consumed silently is the leading indicator of a programme in trouble. Track it at every review as a number, on a chart, with a date axis.
$md$);

-- --- Module 1.2 ------------------------------------------------------------
insert into public.modules (course_id, slug, title, summary, sort_order)
values (c1, 'bus-subsystems', 'Bus Subsystems',
  'EPS, OBC/CDH, ADCS, communications, structure and thermal — with the sizing arithmetic.', 2)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'eps-and-power-budget', 'Electrical Power and the Orbit-Average Budget', 'reading', 45, 1,
$md$
## The chain

$$\text{Solar cells} \rightarrow \text{MPPT} \rightarrow \text{Battery} \rightarrow \text{Regulation} \rightarrow \text{Loads}$$

Each stage has an efficiency, and the product of those efficiencies is what you actually get.

### Generation

Triple-junction GaAs cells for space are typically **28–30 %** efficient at beginning of life. The solar constant at 1 AU is **1361 W/m²**. A 1U body-mounted panel has roughly **60 cm² = 0.006 m²** of usable cell area after rails, standoffs and gaps.

$$P_{\text{cell}} = 1361 \times 0.006 \times 0.29 \approx 2.37\ \text{W}$$

That is the number *at normal incidence*. A tumbling or nadir-pointing 1U rarely sees normal incidence on any one face. Multiply by a **cosine loss factor** — 0.5 to 0.7 for a body-mounted, coarsely pointed satellite is realistic — then by an **illumination fraction** of about 0.65 for a typical LEO orbit (35 % eclipse), then by **MPPT efficiency** of ~0.90, then by **degradation** of ~0.97/year.

A 1U with cells on four side faces, coarse pointing:

$$P_{\text{orbit avg}} \approx 4 \times 2.37 \times 0.35 \times 0.65 \times 0.90 \approx 1.94\ \text{W}$$

Under **2 W orbit-average** is the honest number for a body-mounted 1U. Every design decision downstream lives inside that budget. Deployable panels change the arithmetic dramatically — and change your ADCS, your deployment risk, and your deployer paperwork just as dramatically.

### Storage

Li-ion 18650 cells at ~3.6 V nominal, 2600 mAh, give ~9.4 Wh per cell. Two cells in series is a common 1U configuration: **7.2 V, ~18.7 Wh**.

Cycle life is the constraint, not capacity. In LEO you complete roughly **15 orbits per day, ~5,500 cycles per year**. At 25 % depth of discharge a good Li-ion cell manages several thousand cycles; at 60 % DoD it will not survive a year. Size the battery so that your worst-case eclipse draw is a shallow discharge, not so that it "just fits".

Battery heaters are usually mandatory. Li-ion charging below 0 °C plates lithium and permanently damages the cell. Budget 0.5–1 W of heater power and interlock the charger on a battery thermistor.

### The budget itself

Build it as a table with a duty cycle column. This is the single most important spreadsheet in the programme.

| Load | Power (W) | Duty | Orbit-avg (W) |
|---|---|---|---|
| OBC (active) | 0.35 | 100 % | 0.350 |
| OBC (sleep) | 0.02 | — | — |
| UHF receiver | 0.15 | 100 % | 0.150 |
| UHF transmitter (2 W RF, 40 % PA eff.) | 5.00 | 4 % | 0.200 |
| Payload LoRa receiver | 0.12 | 40 % | 0.048 |
| ADCS (magnetorquers + sensors) | 0.60 | 30 % | 0.180 |
| Battery heater | 0.80 | 25 % | 0.200 |
| EPS housekeeping + losses | 0.20 | 100 % | 0.200 |
| **Total demand** | | | **1.328** |
| **Generation** | | | **1.94** |
| **Margin** | | | **+0.61 W (32 %)** |

Then check the **eclipse energy balance** separately: eclipse on a 500 km orbit lasts roughly 35 minutes of a 94.6-minute period. Energy drawn in eclipse must be recoverable in the sunlit portion *and* leave the battery within its DoD limit.

$$E_{\text{eclipse}} = 1.328\ \text{W} \times 2100\ \text{s} = 2789\ \text{J} = 0.77\ \text{Wh}$$

Against 18.7 Wh installed, that is **4.1 % DoD** — comfortable. If your transmitter duty cycle rises, recompute; a 2 W PA at 20 % duty rather than 4 % adds 0.8 W orbit-average and eats the entire margin.

## Protection

- **Latch-up protection** on every rail that feeds a COTS part. A current-limited load switch that cycles power on overcurrent is the cheapest radiation mitigation you will ever buy.
- **Undervoltage lockout** below which loads shed in a defined order.
- **Independent battery protection IC** that the OBC cannot override in software.
- **Separate the beacon.** If the design permits, a hardware beacon that transmits identification independently of the OBC will tell you the satellite is alive even when the software is not.
$md$);

perform app.seed_lesson(m, 'obc-and-cdh', 'On-Board Computer and Command & Data Handling', 'reading', 40, 2,
$md$
## Picking a processor

The temptation is to fly the most capable processor you can afford. Resist it. The design driver is not throughput; it is **determinism, power, and recoverability**.

Three tiers you will actually see:

| Tier | Example class | Power | When |
|---|---|---|---|
| MCU | Cortex-M4/M7, MSP430 | 20–300 mW | Bus control, always-on, safe mode |
| SoC | Cortex-A + Linux | 0.5–3 W | Payload processing, image handling |
| FPGA | Flash-based FPGA | 0.2–1 W | Deterministic DSP, radio, redundancy manager |

A widely-used pattern for a 1U is an **MCU running the bus with a hard watchdog**, and — only if the payload demands it — a separately powered SoC that the MCU can cut at will. The MCU must be able to keep the satellite alive, beacon, and accept commands with the payload processor completely off.

## Watchdogs, resets, and why software cannot be trusted

Assume single-event upsets will corrupt RAM and single-event functional interrupts will hang the processor. Design for it:

- **External hardware watchdog**, not the internal one. An internal watchdog shares a clock domain with the thing that hung.
- **Windowed watchdog**: kicking too *often* is also a fault.
- **Reset counter in non-volatile memory.** Escalate: three resets in an orbit → boot to safe mode. Ten → boot the golden image.
- **Golden image + updatable image.** A read-only bootloader validates a CRC or signature over the application image and falls back to the factory image on mismatch. The bootloader itself is never field-updatable.
- **EDAC on critical memory**, or at minimum triple-redundant storage of critical state (mode, reset counter, orbit epoch) with majority voting on read.

## Command and data handling

Two data flows to design deliberately:

**Telecommand (up).** Every command should carry a sequence number, an authentication tag, and a CRC. Commands that can end the mission — RF off, battery disconnect, attitude control disable — get an **arm/execute** pair with a timeout between them. It is standard practice to include a **command loss timer**: if no valid ground command is received in N hours, autonomously reset to a known-good configuration and resume beaconing. This has saved a great many spacecraft, including from their own operators.

**Telemetry (down).** Structure it in three layers:

1. **Beacon** — a short, fixed, always-on frame with the vitals: mode, battery voltage, temperatures, reset count, uptime. Small enough to decode with a handheld radio and a laptop.
2. **Housekeeping** — a fuller frame downlinked on request, covering every subsystem.
3. **Whole-orbit data (WOD)** — sampled continuously at low rate into a ring buffer, downlinked in bulk. This is what lets you debug an anomaly that happened over an ocean with no ground station.

Store telemetry with **timestamps from a monotonic counter**, not just wall-clock, so a clock reset does not destroy your ability to order events.

## File systems and storage

A journalling flash file system on NOR or NAND is standard, but the simplest thing that works on a 1U is a **circular log in raw flash** with fixed-size records and a CRC per record. No allocation, no fragmentation, no corruption-on-power-loss failure mode. If a record fails CRC, you skip it and keep going.

## Software architecture

Whatever RTOS you choose, the structure that survives contact with orbit is:

- A small number of tasks with clearly separated responsibilities and **no shared mutable state** except through queues.
- A **mode manager** that owns the single global mode variable; nothing else writes it.
- Every task registers with the watchdog supervisor and must check in; a task that stops checking in causes a controlled reset, not a silent hang.
- All timing derived from one monotonic tick. Never from a delay loop.
- **Telemetry for everything you might ever want to know.** Storage is cheap; a second launch is not.
$md$);

perform app.seed_lesson(m, 'adcs', 'Attitude Determination and Control', 'reading', 40, 3,
$md$
## Start from the pointing requirement

ADCS complexity scales viciously with pointing accuracy. Establish the requirement honestly, because each tier roughly doubles cost, mass and integration effort.

| Requirement | Architecture | Typical accuracy |
|---|---|---|
| Detumble only | Magnetorquers + magnetometer, B-dot | Rate < 1–5 °/s |
| Coarse sun pointing | + sun sensors, passive magnetic or active | 5–10° |
| Nadir pointing | + gravity-gradient boom or 3-axis magnetic | 2–5° |
| 3-axis stabilised | + reaction wheels, full estimator | 0.1–1° |
| Precision imaging | + star tracker, fine wheels | < 0.05° |

A store-and-forward IoT mission usually needs no better than **coarse sun pointing for power, with a nadir bias for antenna coverage** — which is achievable with magnetorquers and good software alone. That is a very cheap place to be. Do not leave it without a reason written into a requirement.

## Determination

**Sensors, cheapest first:**

- *Coarse sun sensors* — photodiodes on each face. Sub-degree is not achievable; 5–10° is. Blinded in eclipse.
- *Magnetometer* — gives the local field vector. Must be calibrated against the spacecraft's own magnetic signature, and read while magnetorquers are OFF.
- *MEMS gyroscope* — good short-term rate, drifts badly. Always fused with an absolute reference.
- *Earth/horizon sensor* — thermopile or IR camera, gives nadir.
- *Star tracker* — arcsecond class, but power, mass, cost, and it needs to be baffled from the Sun and Earth limb.

**Estimation.** With two non-parallel measured vectors and their known references (Sun direction from an ephemeris, magnetic field from IGRF at your propagated position), **TRIAD** gives a closed-form attitude. **QUEST**/**q-method** does it optimally for more vectors. In flight you run an **extended Kalman filter** or a **multiplicative EKF** on the quaternion, using gyros for propagation and vector measurements for correction, and you estimate gyro bias as part of the state.

You cannot run any of this without knowing where you are. That means **SGP4 propagation from a TLE**, updated from the ground, plus an onboard clock. When the TLE goes stale your magnetic field reference degrades and your attitude solution quietly follows it.

## Control

**B-dot detumbling** is the first thing that runs after ejection and it is beautifully simple. Command each magnetorquer proportional to the negative rate of change of the measured field:

$$\mathbf{m} = -k \frac{d\mathbf{B}}{dt}$$

This dissipates rotational energy without needing an attitude solution at all. Deployment tip-off rates of 5–20 °/s typically damp out in hours to a couple of days. Bound $k$, and duty-cycle the torquers so the magnetometer gets clean sample windows.

**Magnetic control** in general can only produce torque perpendicular to the local field, $\boldsymbol{\tau} = \mathbf{m} \times \mathbf{B}$ — you have two axes of authority at any instant, and the missing axis rotates as you move along the orbit. This is why pure magnetic three-axis control is slow but, over an orbit, possible.

**Reaction wheels** give fast, precise, three-axis authority but accumulate momentum from disturbance torques and must be **desaturated** — on a CubeSat, with magnetorquers. Budget the disturbance environment: at 500 km, aerodynamic drag torque dominates for a 3U with an offset centre of pressure; solar radiation pressure and residual magnetic dipole matter above ~600 km; gravity gradient always matters for elongated bodies.

## Practical traps

- **Your own satellite is magnetic.** Current loops on the PCB and permeable materials create a residual dipole that fights your control and biases your magnetometer. Twist supply pairs, minimise loop area, and characterise the residual dipole in a Helmholtz cage before flight.
- **Sun sensor albedo error.** Earth reflects ~30 % of incident sunlight. A naive sun vector from photodiodes can be tens of degrees off over a bright cloud deck. Model albedo or reject measurements when the Earth is in the field of view.
- **Torquer/magnetometer interference.** Never measure while actuating. Interleave.
- **Verify in simulation before flight.** A hardware-in-the-loop test with a Helmholtz cage driving a simulated orbit field into your real magnetometer, and your real torquer commands feeding a rigid-body model, will find more bugs than any amount of code review.
$md$);

perform app.seed_lesson(m, 'comms-subsystem', 'The Communications Subsystem', 'reading', 35, 4,
$md$
## Band selection is a regulatory decision first

| Band | Typical use | Notes |
|---|---|---|
| VHF 145.8–146.0 MHz | Uplink, beacons | Amateur satellite service; crowded; large antennas |
| UHF 435–438 MHz | TT&C up/down | The CubeSat workhorse; IARU coordination required |
| S-band 2.0–2.3 GHz | Higher-rate downlink | Needs pointing or a wide-beam patch; licensing more involved |
| X-band 8.0–8.4 GHz | Payload data | High rate, needs a tracking ground station |
| ISM 868/915 MHz | IoT payload links | Not a space allocation — check national rules carefully |

If you intend to use the **amateur satellite service**, you must coordinate your frequency with the **IARU**, and the mission must genuinely meet the amateur service's non-commercial, open-communications criteria. Using amateur spectrum for a commercial IoT service is not permissible, and regulators have become considerably less tolerant of the practice. Plan your licensing path at the same time as your ConOps, not after CDR — filings and coordination routinely take longer than building the spacecraft.

## Antennas on a 1U

You have no room. The realistic options:

- **Deployable tape-spring dipole or turnstile** for VHF/UHF. Rolled around the body, released by burn wire. A quarter-wave at 437 MHz is 17 cm — longer than the satellite. A turnstile (crossed dipoles fed in quadrature) gives near-hemispherical circular polarisation, which is what you want when your attitude is uncertain.
- **Patch antenna** for S-band, body-mounted, ~5–8 dBi, beamwidth 60–90°.
- **Monopole against the body** as a ground plane — simple, but the pattern is badly perturbed by solar panels and deployables. Measure it; do not trust the simulation alone.

Polarisation mismatch costs you. A linearly polarised ground antenna against a tumbling linearly polarised satellite suffers deep, fast fades. Circular polarisation on at least one end costs a fixed 3 dB and removes the fades — a trade almost always worth making.

## Modulation and coding

- **AFSK 1200 bps** in AX.25 — decodable by anyone with a handheld radio and a sound card. Slow, but it maximises the number of people who can help you when things go wrong.
- **GMSK 9600 bps** — the practical standard for CubeSat downlink. Good spectral efficiency, constant envelope so the PA runs in saturation.
- **BPSK/QPSK with FEC** for higher rates.

Always add **forward error correction**. Convolutional r=1/2 K=7 with Viterbi decoding gives roughly 5 dB of coding gain; concatenate with **Reed–Solomon (255,223)** and you approach 7–8 dB. That is the difference between a working link and a marginal one, for the cost of some flash and some ground-side CPU.

## The transmitter duty cycle trap

A 2 W RF output at 40 % PA efficiency draws 5 W. On a 1U generating under 2 W orbit-average, you can transmit for about **4 % of the orbit** at full power without touching your margin — roughly 4 minutes per 94-minute orbit. That is comparable to one good pass. Your data budget is therefore set by power, not by bandwidth, and the correct response is compression and FEC, not a bigger radio.
$md$);

perform app.seed_lesson(m, 'structure-thermal', 'Structure, Mechanisms and Thermal', 'reading', 30, 5,
$md$
## Structure

The primary structure carries launch loads and provides the deployer interface; secondary structure holds your boards. On a 1U you will use either a **machined frame with rail-integrated corner posts** or a **skeletonised chassis with stacked PC/104 boards on standoffs**.

Design rules that repeatedly matter:

- **Fundamental frequency.** Launch providers commonly require the first mode above 90–100 Hz so the satellite does not couple with vehicle modes. A stack of loosely supported boards on long standoffs will not make it; add a mid-stack support or shorten spans.
- **Fasteners.** Every fastener needs a locking feature — thread-locking patch, staking compound, or a locking helicoil. A screw that backs out under vibration becomes free-floating debris inside your own satellite.
- **Anodising.** Rails hard-anodised for wear; contact surfaces that must conduct electrically or thermally masked off. Hard anodise is an excellent insulator, which is exactly wrong for a grounding path.
- **Materials.** 6061-T6 and 7075 aluminium dominate. Avoid pure tin, zinc and cadmium platings entirely — **tin whiskers** cause short circuits and have destroyed real spacecraft.

## Mechanisms

Every mechanism is a single point of failure with a probability of not working. Minimise their number, then make the survivors robust:

- **Burn-wire release** is the CubeSat standard: a nylon line under tension across a resistor or nichrome wire. Redundant heaters, current monitoring, and a retry policy with a cool-down.
- **Test in vacuum and at temperature extremes.** Nylon behaves differently cold, and there is no convection to carry heat away from your burn resistor — it will get much hotter in vacuum than on your bench.
- **Confirm deployment in telemetry.** A microswitch, a continuity break, or a change in a measurable RF property. "We commanded it" is not confirmation.

## Thermal

With no air, only **conduction and radiation** matter. Two loops to close:

**Steady state.** Absorbed solar, albedo and Earth IR in; radiated IR out.

$$\alpha S A_{\text{proj}} + q_{\text{internal}} = \varepsilon \sigma A_{\text{rad}} T^4$$

The ratio $\alpha/\varepsilon$ of your external surfaces is the main design knob. Polished aluminium runs hot; white paint and OSRs run cold; black anodise sits between and is common on CubeSats because it also radiates internal heat well.

**Transient.** In LEO you cycle through sunlight and eclipse roughly **15 times a day, ~5,500 cycles per year**. Component temperature ranges are typically −40 to +85 °C commercial, −55 to +125 °C industrial — but the **battery is the constraint**: charge only within roughly 0 to +45 °C, discharge −20 to +60 °C. Batteries therefore get heaters, insulation, and a thermally isolated mount near the middle of the stack.

Practical thermal control on a 1U is almost entirely passive: surface finishes, thermal straps or gap pads from hot parts to the structure, thermal isolation of the battery, and a heater with a thermostat. Get the internal conduction paths right — a PA that dumps 3 W into an isolated board will exceed its junction temperature in minutes with nowhere to send the heat.
$md$);

-- --- Module 1.3 ------------------------------------------------------------
insert into public.modules (course_id, slug, title, summary, sort_order)
values (c1, 'environment-and-verification', 'Space Environment and Verification',
  'What LEO does to hardware, and the test campaign that proves you survived it.', 3)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'leo-environment', 'The LEO Environment', 'reading', 35, 1,
$md$
## Vacuum

Below about 10⁻⁵ Pa there is no convection. Three consequences:

- **Outgassing.** Volatiles leave polymers and adhesives and condense on the coldest nearby surface — typically your optics or a radiator. Hence the ASTM E595 limits (TML ≤ 1 %, CVCM ≤ 0.1 %) and the practice of vacuum-baking assemblies before integration.
- **Cold welding.** Clean metal surfaces in contact under load with no oxide layer can bond. Relevant for mechanisms; use dissimilar materials or dry-film lubricant.
- **Corona and multipaction.** During ascent the satellite passes through the Paschen minimum pressure region where a few hundred volts can arc across a millimetre. Either keep the RF and high-voltage systems off until pressure is low (which your 30-minute inhibit already does) or design the spacing to avoid it.

## Thermal cycling

Roughly 5,500 cycles per year through a range that, for an uncontrolled surface, can span −70 to +80 °C. This drives solder joint fatigue and delamination. Match coefficients of thermal expansion where you can, avoid rigid constraints across dissimilar materials, and stake heavy components.

## Radiation

Three distinct effects that are often conflated:

**Total Ionising Dose (TID).** Cumulative charge trapped in oxides; shifts thresholds, increases leakage, eventually kills the part. In a typical 500 km, low-inclination LEO behind 1–2 mm of aluminium, expect on the order of **hundreds of rad(Si) to a few krad per year**. Most modern COTS parts survive 5–20 krad, so a 1–3 year LEO mission is usually feasible with COTS. Polar and high-inclination orbits pass through the horns of the radiation belts and accumulate faster; anything near the **South Atlantic Anomaly** sees a disproportionate share of the dose and of the upsets.

**Single Event Effects (SEE).** A single heavy ion or energetic proton deposits enough charge in a sensitive volume to:
- flip a memory bit — **SEU**, recoverable by scrubbing and EDAC;
- corrupt control logic — **SEFI**, recoverable by reset;
- trigger a parasitic thyristor in CMOS — **SEL**, *not* recoverable in software and potentially destructive. This is why current-limited load switches are non-negotiable on COTS parts.

**Displacement damage.** Lattice defects from protons and neutrons, mainly degrading solar cells, optocouplers and image sensors over time.

Mitigations that are cheap and effective on a CubeSat: current-limited power switching, watchdogs and reset escalation, memory scrubbing, triple-redundant critical variables, CRCs on everything stored, and choosing parts with flight heritage where the budget allows. Spot-shielding a single sensitive part with a few grams of tantalum can be more mass-efficient than shielding the whole box.

## Atomic oxygen

At 300–500 km, atomic oxygen is the dominant neutral species and it erodes organic materials — Kapton, silver, some paints — at rates measured in micrometres per year. Ram-facing surfaces take the worst of it. Use AO-resistant materials or coatings on exposed ram surfaces; germanium-coated Kapton and silica coatings are common.

## Drag, lifetime and disposal

Atmospheric density at LEO altitudes varies by an order of magnitude with solar activity. A 1U at 400 km may decay in months; at 600 km it may take a decade or more. You must compute your **post-mission orbital lifetime** and show it complies with the disposal rules of your licensing authority — these have been tightening, and the historical 25-year guideline is no longer universal. Check the current rule in the jurisdiction that licenses you, because that is the one you will be held to. If you cannot comply passively, you need a deorbit device, and that is a whole subsystem.

## Debris and conjunctions

You will receive conjunction warnings. Have a plan for what you do with them even if you cannot manoeuvre — at minimum, know who to notify, and record your orbit accurately so that others can screen against you. Register the object properly and keep your TLE identification current.
$md$);

perform app.seed_lesson(m, 'verification-campaign', 'The Verification and Test Campaign', 'reading', 40, 2,
$md$
## Model philosophy

Small teams typically fly a **protoflight** approach: build one flight article and test it at qualification *levels* for acceptance *durations*. It is cheaper than a separate qualification model and riskier — a failure during test means you are repairing the article you intend to fly.

Where budget allows, an **engineering model** (form- and function-representative, non-flight parts) pays for itself in software development and integration rehearsal alone.

## The campaign, in order

**1. Functional baseline.** A full functional test — every command, every telemetry point, every mode transition — recorded. You will repeat this identical test after every environmental exposure. Its value comes entirely from being *identical* each time.

**2. Mass properties.** Mass, centre of mass, and moments of inertia. The deployer has a CoM requirement; your ADCS simulation needs the inertia tensor.

**3. Vibration.** Sine sweep to find modes, then random vibration to **GSFC-STD-7000 (GEVS)** levels — commonly around **14.1 g<sub>rms</sub>** for qualification, in each of three axes, with a low-level sine signature before and after each axis. A shift in the signature frequency means something moved or cracked. Then repeat the functional test.

**4. Shock.** Where the launch provider requires it, per their separation environment.

**5. Thermal vacuum (TVAC).** Pump down, then cycle between hot and cold operating limits — typically 4 to 8 cycles, with dwell at each extreme long enough for the hardware to stabilise, and functional tests at hot and cold extremes. Include at least one **cold start**: the ability to boot at your minimum survival temperature is a real requirement and it is routinely missed.

**6. Bakeout.** Elevated temperature under vacuum to drive off volatiles.

**7. EMC/EMI.** Self-compatibility is the practical concern on a CubeSat: does your own transmitter reset your own OBC? Does the magnetorquer driver corrupt the magnetometer? Test radiated emissions and susceptibility at least informally, in a chamber if you can get one.

**8. Deployment tests.** Antenna and any other deployables, in vacuum, at temperature extremes, with the flight release mechanism, repeated enough times to have confidence. Then fit the flight nylon.

**9. Day-in-the-life.** Run the satellite on the bench through a full simulated orbit sequence — eclipse, pass, payload operation, safe-mode entry and recovery — with the real ground station software. This is the test that finds ConOps errors.

**10. Fit check** in the deployer, then **final functional**, then bag it.

## Documentation the launch provider will demand

- Interface Control Document compliance matrix against the CDS revision they cite
- Test reports for vibration, TVAC, and deployment
- Materials list with outgassing data
- Battery test report, often to a specific standard, and shipping documentation
- Inhibit and deployment-switch verification evidence
- Debris assessment / orbital lifetime analysis
- Licences and frequency coordination evidence

Assemble this in parallel with the build. Teams routinely finish the hardware and then miss a launch slot on paperwork.

## What the EduSat digital twin can and cannot verify

The twin exercises your **software, framing, telemetry, ConOps and ground segment** faithfully. It cannot tell you anything about vibration survival, thermal behaviour in vacuum, radiation response, or deployment reliability. Treat it as a functional and operational rehearsal tool, and keep the environmental campaign firmly in the physical world.
$md$);

-- --- Quiz for Course 1 -----------------------------------------------------
insert into public.quizzes (course_id, slug, title, instructions, is_graded,
  pass_threshold, time_limit_minutes, max_attempts, questions_per_attempt,
  shuffle_questions, reveal_feedback)
values (c1, 'fundamentals-assessment', 'CubeSat Fundamentals Assessment',
  'Closed-book. You may use a calculator. Numeric answers are graded within the stated tolerance.',
  true, 70, 40, 3, 0, true, true)
on conflict (course_id, slug) do update set title = excluded.title
returning id into q;

delete from public.quiz_questions where quiz_id = q;

insert into public.quiz_questions (quiz_id, kind, prompt_md, options, answer_key, explanation_md, points, sort_order) values
(q, 'single_choice',
 'A 1U CubeSat is specified as a 100 mm × 100 mm × 113.5 mm envelope. What does the additional 13.5 mm in the Z axis accommodate?',
 '[{"id":"a","text":"Thermal expansion of the structure on orbit"},
   {"id":"b","text":"The rails and deployment switches"},
   {"id":"c","text":"The antenna deployment mechanism"},
   {"id":"d","text":"Manufacturing tolerance stack-up only"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'The Z dimension is extended to accommodate the rail standoffs and the deployment (kill) switches at the rail ends. Designing to a literal 100 mm cube leaves nowhere for them.',
 1, 1),

(q, 'numeric',
 'A body-mounted 1U face carries 0.006 m² of triple-junction cells at 29 % efficiency. At normal incidence and a solar constant of 1361 W/m², what is the peak power from that face, in watts? (± 0.15 W)',
 '[]'::jsonb,
 '{"value":2.37,"tolerance":0.15,"unit":"W"}'::jsonb,
 '1361 × 0.006 × 0.29 ≈ 2.37 W. This is a *peak, normal-incidence* figure — orbit-average generation is far lower once cosine loss, eclipse fraction and MPPT efficiency are applied.',
 2, 2),

(q, 'multi_choice',
 'Which of the following are effects of ionising radiation that a CubeSat designer must mitigate separately? Select all that apply.',
 '[{"id":"a","text":"Total Ionising Dose (TID)"},
   {"id":"b","text":"Single Event Latch-up (SEL)"},
   {"id":"c","text":"Atomic oxygen erosion"},
   {"id":"d","text":"Single Event Upset (SEU)"},
   {"id":"e","text":"Cold welding"}]'::jsonb,
 '{"correct":["a","b","d"]}'::jsonb,
 'TID, SEL and SEU are radiation effects with distinct mitigations (shielding/part selection, current-limited switching, EDAC/scrubbing respectively). Atomic oxygen erosion is a chemical effect of the neutral atmosphere, and cold welding is a vacuum contact phenomenon — real hazards, but not radiation.',
 2, 3),

(q, 'single_choice',
 'Why is a current-limited load switch considered a radiation mitigation on a COTS-based CubeSat?',
 '[{"id":"a","text":"It reduces total ionising dose to downstream parts"},
   {"id":"b","text":"It allows recovery from single event latch-up, which software cannot clear"},
   {"id":"c","text":"It corrects single event upsets in memory"},
   {"id":"d","text":"It shields the part from heavy ions"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'SEL triggers a parasitic thyristor that draws high current until power is removed. No software action can clear it, and left alone it can destroy the part. Cycling power through a current-limited switch is the standard recovery.',
 1, 4),

(q, 'true_false',
 'B-dot detumbling requires a full attitude solution before it can be applied.',
 '[{"id":"true","text":"True"},{"id":"false","text":"False"}]'::jsonb,
 '{"correct":"false"}'::jsonb,
 'B-dot commands a magnetic dipole proportional to the negative time-derivative of the measured magnetic field. It dissipates rotational kinetic energy using the magnetometer alone — no attitude determination required, which is precisely why it is the first control law to run after ejection.',
 1, 5),

(q, 'single_choice',
 'A 1U generates 1.94 W orbit-average. Its transmitter draws 5 W when keyed. Ignoring all other loads, roughly what transmit duty cycle consumes the entire generation budget?',
 '[{"id":"a","text":"About 4 %"},{"id":"b","text":"About 12 %"},
   {"id":"c","text":"About 39 %"},{"id":"d","text":"About 65 %"}]'::jsonb,
 '{"correct":"c"}'::jsonb,
 '1.94 / 5 ≈ 0.39, so a 39 % duty cycle would consume all generated power with nothing left for the bus. In a real budget, where the bus needs roughly 1.1 W, the transmitter is limited to around 4 % — which is why downlink volume on a 1U is power-limited, not bandwidth-limited.',
 2, 6),

(q, 'multi_choice',
 'Which items belong in the environmental test campaign for a protoflight CubeSat? Select all that apply.',
 '[{"id":"a","text":"Random vibration to GEVS qualification levels in three axes"},
   {"id":"b","text":"Thermal vacuum cycling with functional tests at hot and cold extremes"},
   {"id":"c","text":"Low-level sine signature before and after each vibration axis"},
   {"id":"d","text":"Deployment tests in vacuum at temperature extremes"},
   {"id":"e","text":"A software unit test suite run on the developer laptop"}]'::jsonb,
 '{"correct":["a","b","c","d"]}'::jsonb,
 'All except (e) are environmental verification activities. Unit tests are essential engineering practice but they are not environmental verification and no launch provider will accept them as such. The sine signature in (c) is what reveals a structural change between axes.',
 2, 7),

(q, 'short_text',
 'Name the release mechanism almost universally used to hold and release CubeSat deployable antennas. (Two words)',
 '[]'::jsonb,
 '{"accept":["burn wire","burnwire","burn-wire","burn wire release"]}'::jsonb,
 'A nylon line under tension is melted by a resistor or nichrome element — the burn-wire release. Cheap, light, and testable, but it must be qualified in vacuum where there is no convection to cool the element.',
 1, 8),

(q, 'single_choice',
 'Your spacecraft has not received a valid ground command in 96 hours. Which autonomous behaviour is standard practice?',
 '[{"id":"a","text":"Increase transmitter power to maximum and beacon continuously"},
   {"id":"b","text":"Command loss timer expires; reset to a known-good configuration and resume beaconing"},
   {"id":"c","text":"Disable the receiver to save power until the next scheduled pass"},
   {"id":"d","text":"Deploy all remaining mechanisms to improve link geometry"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'The command loss timer is one of the highest-value autonomy features on a small satellite. It assumes the most likely cause of silence is a bad configuration the ground uploaded, and undoes it. (a) and (d) risk making a recoverable situation permanent; (c) guarantees you cannot be commanded.',
 2, 9);

-- ===========================================================================
-- COURSE 2 — Satellite-to-IoT Link Design and Ground Segment
-- ===========================================================================
insert into public.courses (
  track_id, slug, title, subtitle, summary, description, level, status,
  tags, prerequisites, outcomes, estimated_minutes, requires_hardware,
  hardware_notes, price_cents, issues_certificate, pass_threshold, sort_order,
  published_at
) values (
  v_track, 'satellite-iot-link-and-ground-segment',
  'Satellite-to-IoT Link Design and Ground Segment',
  'Link budgets, AX.25 and CCSDS framing, LoRa store-and-forward, and pass operations',
  'Close a real link budget from a battery-powered ground sensor to a LEO satellite, frame the data correctly, and operate a pass end to end.',
  'The core engineering course of the EduSat track. You will compute link budgets from first principles for both the TT&C link and the direct-to-satellite IoT link, work through AX.25 and CCSDS framing byte by byte, understand why LoRa''s chirp spread spectrum makes a −137 dBm uplink from a coin-cell sensor plausible, and then run passes: Doppler correction, scheduling, and decoding real frames with an SDR.',
  'advanced', 'published',
  array['link budget','RF','LoRa','CCSDS','AX.25','ground station','SDR','Doppler'],
  array['CubeSat Systems Engineering Fundamentals, or equivalent experience','Decibel arithmetic','Comfort reading hex dumps'],
  array[
    'Close a link budget in dB and state the margin honestly',
    'Decode an AX.25 UI frame and a CCSDS Space Packet by hand',
    'Choose LoRa spreading factor and bandwidth against a link and duty-cycle constraint',
    'Predict a pass, correct for Doppler, and schedule a downlink',
    'Diagnose why a link that closed on paper is failing in practice'
  ],
  720, true,
  'Labs use the EduSat kit''s SX1262 radio and an RTL-SDR. A digital-twin path is available if hardware is not yet issued.',
  0, true, 75, 2, now()
)
on conflict (slug) do update
  set title = excluded.title, subtitle = excluded.subtitle, summary = excluded.summary,
      description = excluded.description, status = 'published', tags = excluded.tags,
      prerequisites = excluded.prerequisites, outcomes = excluded.outcomes,
      requires_hardware = excluded.requires_hardware, hardware_notes = excluded.hardware_notes,
      estimated_minutes = excluded.estimated_minutes, track_id = excluded.track_id,
      pass_threshold = excluded.pass_threshold,
      published_at = coalesce(public.courses.published_at, now())
returning id into c2;

insert into public.modules (course_id, slug, title, summary, sort_order)
values (c2, 'rf-and-link-budget', 'RF Fundamentals and the Link Budget',
  'Decibels, free-space path loss, G/T, Eb/N0 and margin — computed, not guessed.', 1)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'decibels-and-fspl', 'Decibels, EIRP and Free-Space Path Loss', 'reading', 35, 1,
$md$
## Why everything is in dB

A link budget spans about **eighteen orders of magnitude** between what leaves the transmitter and what arrives at the receiver. In dB that becomes an addition problem you can do on a napkin, which is exactly the point.

- $\text{dBW} = 10\log_{10}(P/1\,\text{W})$, $\text{dBm} = 10\log_{10}(P/1\,\text{mW})$, and $\text{dBm} = \text{dBW} + 30$.
- Gains and losses in dB **add**. Ratios multiply, decibels add.
- 3 dB ≈ ×2, 10 dB = ×10, 20 dB = ×100. Learn these three and you can estimate anything.

## EIRP

**Effective Isotropic Radiated Power** is what the transmitter looks like to the far end:

$$\text{EIRP} = P_t + G_t - L_{\text{line}}$$

For the EduSat UHF downlink: 2 W = **33 dBm**, a turnstile antenna at roughly **2 dBi** in the useful direction, and **1 dB** of feed and connector loss:

$$\text{EIRP} = 33 + 2 - 1 = 34\ \text{dBm} = 4\ \text{dBW}$$

## Free-space path loss

$$L_{\text{fs}} = 20\log_{10}(d_{\text{km}}) + 20\log_{10}(f_{\text{MHz}}) + 32.44\ \text{dB}$$

Two things to internalise. First, **slant range, not altitude**. A satellite at 500 km is 500 km away only at zenith. At 10° elevation the slant range is about **1,700 km** — that is **10.6 dB** more path loss than at zenith, and it is the case you must design for, because passes begin and end at low elevation.

Second, path loss rises with frequency for a *fixed antenna gain*. Physical apertures gain with frequency, which is why S-band and X-band are usable at all; a fixed-gain omnidirectional antenna does not.

Worked, at 437 MHz and 1,700 km:

$$L_{\text{fs}} = 20\log_{10}(1700) + 20\log_{10}(437) + 32.44 = 64.6 + 52.8 + 32.44 = 149.8\ \text{dB}$$

## Additional losses to carry

| Loss | Typical value | Note |
|---|---|---|
| Atmospheric absorption | 0.5–1 dB at UHF, low elevation | Rises sharply above 10 GHz |
| Ionospheric scintillation | 0.5–3 dB at UHF | Worse near the geomagnetic equator, worse after local sunset — directly relevant across much of Africa |
| Polarisation mismatch | 3 dB (circular↔linear), up to ∞ (crossed linear) | Use CP on at least one end |
| Pointing loss | 0.5–2 dB | Larger if you are tracking with a rotator and imperfect TLEs |
| Implementation loss | 1–2 dB | Real receivers are not ideal |

**Equatorial scintillation deserves emphasis for African ground stations.** Post-sunset ionospheric irregularities at low geomagnetic latitudes produce deep, rapid amplitude fades at UHF. If your station is within roughly ±20° of the magnetic equator, budget for it explicitly and prefer passes outside the 19:00–24:00 local window when scheduling critical operations.

## Received power

$$P_r = \text{EIRP} - L_{\text{fs}} - L_{\text{other}} + G_r$$

With a 15 dBi cross-Yagi on the ground and 6 dB of other losses:

$$P_r = 34 - 149.8 - 6 + 15 = -106.8\ \text{dBm}$$

Whether that is enough is the subject of the next lesson.
$md$, true);

perform app.seed_lesson(m, 'gt-and-margin', 'Noise, G/T, Eb/N0 and Closing the Budget', 'reading', 45, 2,
$md$
## Noise

Thermal noise power in a bandwidth $B$ is $N = kT_{\text{sys}}B$, where Boltzmann's constant expressed logarithmically is

$$k = -228.6\ \text{dBW/K/Hz}$$

**System noise temperature** referred to the antenna terminals is the sum of what the antenna sees and what the receiver adds:

$$T_{\text{sys}} = T_{\text{ant}} + T_{\text{line}} + T_{\text{rx}}$$

At UHF, $T_{\text{ant}}$ is dominated by galactic background and, when the antenna points at the horizon, by the warm Earth — commonly **150–300 K** for an amateur station in a suburban location, and considerably worse in an electrically noisy environment. A good LNA at the antenna gives $T_{\text{rx}}$ around **75–120 K**; the same LNA at the *bottom* of 30 m of coax is nearly useless, because the feedline loss ahead of it adds noise and attenuates signal. **Mount the LNA at the antenna.** This is the single highest-value change most ground stations can make.

## G/T

**Figure of merit** of the receiving station:

$$G/T = G_r - 10\log_{10}(T_{\text{sys}})\quad[\text{dB/K}]$$

For a 15 dBi Yagi with $T_{\text{sys}} = 250$ K: $G/T = 15 - 24.0 = -9.0$ dB/K. Perfectly ordinary for an amateur UHF station.

## Carrier-to-noise-density

$$C/N_0 = \text{EIRP} - L_{\text{total}} + G/T + 228.6\quad[\text{dB-Hz}]$$

Using the numbers from the previous lesson (EIRP 4 dBW, total losses 155.8 dB):

$$C/N_0 = 4 - 155.8 - 9.0 + 228.6 = 67.8\ \text{dB-Hz}$$

## Energy per bit

$$E_b/N_0 = C/N_0 - 10\log_{10}(R_b)$$

At 9,600 bps: $10\log_{10}(9600) = 39.8$ dB, so

$$E_b/N_0 = 67.8 - 39.8 = 28.0\ \text{dB}$$

## Margin

Compare against the **required** $E_b/N_0$ for your modulation and coding at your target bit error rate:

| Scheme | Required Eb/N0 at BER 10⁻⁵ |
|---|---|
| Coherent BPSK/GMSK, uncoded | ~9.6 dB |
| + Convolutional r=1/2, K=7, Viterbi | ~4.5 dB |
| + Concatenated with RS(255,223) | ~2.5 dB |
| Non-coherent FSK, uncoded | ~13 dB |

$$\text{Margin} = 28.0 - 4.5 = 23.5\ \text{dB}$$

That is a very comfortable downlink — because we assumed a 15 dBi tracking Yagi. Recompute with a 2 dBi omnidirectional whip ($G/T = -22$ dB/K) and the margin falls to **10.5 dB**; add a 3 dB polarisation mismatch and a 3 dB fade from scintillation and you are at 4.5 dB, which is where real stations live.

## Rules for honest budgets

- Compute at **10° elevation**, not zenith. Zenith budgets are marketing.
- Use **measured** antenna gain if you have it. Simulated patterns of a deployable dipole on a satellite covered in solar panels are optimistic.
- State the **required** Eb/N0 for the coding you actually implemented, not the one in the datasheet's best case.
- Carry **3 dB minimum** margin; **6 dB** if any term is estimated rather than measured.
- Do the **uplink separately**. It is a different frequency, a different antenna, a different noise environment, and it is frequently the leg that fails — a satellite receiver sits in the spacecraft's own EMI environment and hears every switching converter you built.

## Worked: the IoT direct-to-satellite uplink

Now the interesting case — a battery-powered ground sensor transmitting *to* the satellite at 868 MHz.

| Term | Value |
|---|---|
| Node TX power | +14 dBm (regulatory limit in many regions) |
| Node antenna | +2 dBi |
| Feed loss | −0.5 dB |
| **EIRP** | **+15.5 dBm** |
| FSPL at 1,000 km, 868 MHz | −151.2 dB |
| Atmosphere + scintillation | −2.0 dB |
| Polarisation mismatch | −3.0 dB |
| Satellite antenna gain | +2.0 dBi |
| **Received power** | **−138.7 dBm** |

A conventional narrowband receiver would never hear that. LoRa at SF12/125 kHz has a sensitivity around **−137 dBm**, and SF12/62.5 kHz is better still — which is why chirp spread spectrum, and not FSK, is what makes direct-to-satellite IoT work from a coin cell. We are still 1.7 dB short at 1,000 km slant, which tells you something real: **the link closes at high elevation and fails at low elevation**, so the service window per pass is shorter than the visibility window. That is a ConOps input, not a failure.
$md$);

insert into public.modules (course_id, slug, title, summary, sort_order)
values (c2, 'protocols-and-framing', 'Protocols and Framing',
  'AX.25, CCSDS Space Packets and TM frames, and LoRa store-and-forward.', 2)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'ax25-framing', 'AX.25 Framing, Byte by Byte', 'reading', 40, 1,
$md$
## Why AX.25 still matters

AX.25 is old, inefficient, and has an addressing scheme designed for terrestrial packet radio in the 1980s. It is also the format that the global amateur satellite community can decode without being told anything about your mission, and the format that SatNOGS and gr-satellites handle out of the box. For a beacon, that reach is worth more than the efficiency you lose.

## The UI frame

Almost all satellite telemetry uses an **unnumbered information (UI)** frame — connectionless, no acknowledgement, no retransmission.

```
+------+-------------------+---------+------+------------------+-----+------+
| Flag |     Address       | Control | PID  |      Info        | FCS | Flag |
| 0x7E |   14 or 21 bytes  |  0x03   | 0xF0 |    0..256 bytes  |  2  | 0x7E |
+------+-------------------+---------+------+------------------+-----+------+
```

**Flag.** `0x7E` = `01111110`, marking frame boundaries.

**Address field.** Destination callsign first, then source, then up to two digipeater addresses. Each address is 7 bytes: 6 characters of callsign, space-padded, **each shifted left by one bit**, then an SSID byte. The left shift is the part that trips everyone up on their first hand-decode — the ASCII value is in bits 7..1, and bit 0 carries the "last address" flag, set to 1 only in the final address of the field.

To encode `AO0EDU`: take ASCII `A`=0x41, shift left → 0x82. `O`=0x4F → 0x9E. `0`=0x30 → 0x60. `E`=0x45 → 0x8A. `D`=0x44 → 0x88. `U`=0x55 → 0xAA.

The SSID byte is `0b011SSID0` in the general case, with bit 0 set on the last address. SSID 0 with the last-address flag set gives `0x61`.

**Control.** `0x03` for UI.

**PID.** `0xF0` = no layer-3 protocol.

**Info.** Your payload. For a beacon this is often plain ASCII so a human with a terminal can read it, or a compact binary structure documented publicly so others can decode it.

**FCS.** CRC-16/X.25 — polynomial 0x1021, initial value 0xFFFF, reflected input and output, final XOR 0xFFFF. Transmitted **least significant byte first**, and computed over the address, control, PID and info fields, not over the flags.

## Bit stuffing and NRZI

Two transformations happen below the frame:

**Bit stuffing.** After five consecutive `1` bits in the data, a `0` is inserted so the flag pattern `01111110` can never appear inside a frame. The receiver removes it.

**NRZI encoding.** A `0` causes a transition; a `1` causes no transition. This makes the link insensitive to polarity inversion — which matters, because your receiver's discriminator output polarity is not something you want the protocol to depend on.

## A worked beacon

Info field: `AO0EDU>BEACON:MODE=NOM V=7.98 T=+12 R=3 U=142317`

That is 46 bytes of information in a frame with 16 bytes of overhead plus flags. At 1200 bps AFSK that transmission takes about 420 ms. At 9600 bps GMSK, 52 ms. On a power budget that allows 4 minutes of transmit per orbit, you can afford roughly 340 such beacons at 1200 bps — far more than you need, which is why beacons are usually rate-limited to once or twice a minute to leave power for bulk downlink.

## KISS

Between your ground station software and the TNC or modem, frames are carried in **KISS** format: `0xC0` frame delimiters, a command byte, and escape sequences `0xDB 0xDC` for a literal `0xC0` and `0xDB 0xDD` for a literal `0xDB`. Trivial, and worth knowing because it is what you will actually see on the serial port.
$md$);

perform app.seed_lesson(m, 'ccsds-framing', 'CCSDS Space Packets and Transfer Frames', 'reading', 45, 2,
$md$
## When to move beyond AX.25

Once you have more than a handful of telemetry types, need reliable file transfer, or want your ground segment to interoperate with an agency network, you adopt **CCSDS**. The standards are free to download from the CCSDS website, and the parts you need for a CubeSat are a small subset.

## The Space Packet — the application layer

A 6-byte primary header, then data.

```
 Bits:  0-2      3      4      5-15        16-17        18-31        32-47
      +-------+------+------+-----------+------------+-------------+------------------+
      |Version| Type | SecHF|   APID    | Seq Flags  |  Seq Count  | Packet Data Len  |
      | 3 bits| 1 bit| 1 bit|  11 bits  |   2 bits   |   14 bits   |     16 bits      |
      +-------+------+------+-----------+------------+-------------+------------------+
```

- **Version** — `000`.
- **Type** — `0` for telemetry (down), `1` for telecommand (up).
- **Secondary header flag** — set if a secondary header (usually a timestamp) follows.
- **APID** — Application Process Identifier, 11 bits. This is your routing key: give each telemetry source and each command target its own APID and document the list. APID `0x7FF` is reserved for idle packets.
- **Sequence flags** — `11` for a standalone packet; `01`/`00`/`10` for first/continuation/last of a segmented sequence.
- **Sequence count** — 14 bits, increments per APID, wraps at 16383. Gaps in this counter are how the ground detects lost packets, so **count per APID**, not globally.
- **Packet Data Length** — the number of octets in the data field **minus one**. This off-by-one is deliberate (it allows a 65536-byte field) and it is the single most common implementation bug in the standard.

A telemetry packet with APID 0x064, sequence 1234, carrying 32 bytes:

```
08 64 C4 D2 00 1F
```

Decoding that: `0x0864` → version 000, type 0, sec-hdr 0, APID `0x064`. `0xC4D2` → sequence flags `11`, count 1234. `0x001F` → 31, so 32 octets of data follow.

## The TM Transfer Frame — the data link layer

Space Packets are multiplexed into fixed-length **Transfer Frames** on a **Virtual Channel**. A common CubeSat configuration uses a 223-byte frame data field so that Reed–Solomon (255,223) fits neatly.

The frame primary header carries the spacecraft ID, virtual channel ID, frame counters (per master channel and per virtual channel) and a first-header-pointer that tells the receiver where the first complete packet starts inside the frame — essential when packets span frame boundaries.

Virtual channels let you separate traffic classes: VC0 for real-time housekeeping, VC1 for stored WOD playback, VC2 for payload files. The ground can then prioritise, and a flood of payload data cannot starve your housekeeping telemetry.

## Channel coding

The transmitted unit is a **CADU** — Channel Access Data Unit:

```
+---------------------------+---------------------------+
| Attached Sync Marker      |  Randomised, RS-encoded   |
|      0x1ACFFC1D           |     transfer frame        |
+---------------------------+---------------------------+
```

- **ASM** `0x1ACFFC1D` is a fixed 32-bit pattern the receiver correlates against to find frame boundaries. It is not scrambled.
- **Pseudo-randomisation** XORs the frame with a known sequence so the transmitted bitstream has enough transitions for clock recovery regardless of the data.
- **Reed–Solomon (255,223)** adds 32 check symbols per 223-byte codeword, correcting up to 16 symbol errors. **Interleaving depth 5** spreads a burst error across five codewords so a fade that destroys 80 consecutive symbols is still correctable.
- Optionally a **convolutional** inner code, giving the concatenated scheme its ~7–8 dB of coding gain.

On the uplink, the equivalent unit is a **CLTU** using BCH(63,56) codeblocks, with a start sequence and a tail sequence. Telecommand is short and precious; the coding is chosen for reliable detection of errors rather than maximum throughput.

## What to actually implement on a 1U

A pragmatic and widely-used configuration:

- Space Packets with a documented APID map — do this from day one, it costs nothing and structures everything.
- One virtual channel unless you have a real reason for more.
- ASM + randomisation + RS(255,223) with interleave 5.
- AX.25 beacon in parallel, so the amateur community can see you are alive.

Then publish your telemetry format. A public decoder specification is the cheapest insurance policy in small satellites: when your ground station is down and the satellite is misbehaving, someone in another hemisphere may already have your frames.
$md$);

perform app.seed_lesson(m, 'lora-store-and-forward', 'LoRa and Store-and-Forward IoT Payloads', 'reading', 40, 3,
$md$
## Why chirp spread spectrum

LoRa modulates data onto **linear frequency chirps** that sweep the whole channel bandwidth. A symbol is defined by the frequency at which the chirp wraps around. Demodulation is a de-chirp followed by an FFT, which concentrates the signal energy into one bin while spreading the noise — giving processing gain that lets the receiver work well **below the noise floor**.

**Spreading factor** SF sets how many chirps per symbol: SF7 through SF12, each symbol carrying SF bits over $2^{\text{SF}}$ chips.

$$T_{\text{sym}} = \frac{2^{\text{SF}}}{BW}$$

At SF12 and BW = 125 kHz, one symbol takes **32.8 ms**. Each SF step up roughly **doubles time-on-air** and buys about **2.5 dB** of sensitivity.

| SF | BW | Sensitivity (typical) | Bit rate |
|---|---|---|---|
| 7 | 125 kHz | −123 dBm | 5,470 bps |
| 9 | 125 kHz | −129 dBm | 1,760 bps |
| 10 | 125 kHz | −132 dBm | 980 bps |
| 12 | 125 kHz | −137 dBm | 293 bps |
| 12 | 62.5 kHz | −140 dBm | 146 bps |

For direct-to-satellite, **SF10–SF12** is the working range. The cost is time-on-air: a 20-byte payload at SF12/125 kHz occupies the channel for roughly **1.3 seconds** (explicit header, CR 4/5, 8-symbol preamble, low-data-rate optimisation on).

## Doppler is the hard part

A LEO satellite at 7.6 km/s produces a Doppler shift of

$$\Delta f = \frac{v_r}{c} f_0$$

The largest range rate occurs at acquisition, where the line of sight is tangent to the Earth; there the radial component is $v \cdot R_e / a$. For a 550 km orbit that is about **7.0 km/s**, giving roughly **±20 kHz** at 868 MHz — and the **rate of change** near closest approach reaches several hundred hertz per second.

Two problems follow. First, the shift can exceed the channel bandwidth at narrow settings — at 62.5 kHz bandwidth, ±20 kHz is a third of the channel. Second, and more subtly, **Doppler rate distorts the chirp itself**: the received chirp slope no longer matches the reference, smearing the FFT bin and costing sensitivity.

Mitigations in practice:

- Use **wider bandwidth** (125–250 kHz) than a terrestrial deployment would, accepting the sensitivity cost.
- Have the ground node **pre-compensate** if it knows the satellite ephemeris and its own position — a node with GNSS can do this, a coin-cell sensor without a clock cannot.
- Restrict the service window to elevations where Doppler rate is manageable, or **sweep the receiver** across a set of frequency offsets.
- On the satellite, run **multiple demodulator instances** at different offsets if the radio and processor allow.

## Store and forward

The ConOps is straightforward and the engineering is in the details.

1. Ground nodes transmit small, self-describing messages on a schedule or on an event, with **no expectation of acknowledgement**. Nodes are asleep otherwise, drawing microamps.
2. As the satellite passes, its receiver is enabled over the service area. It timestamps and buffers everything it hears, recording RSSI, SNR and frequency offset alongside the payload.
3. Over the gateway pass, the buffer is downlinked and cleared.
4. The backend deduplicates — the same node message may be heard on consecutive passes — and delivers.

Design consequences worth internalising:

- **Message size discipline.** Every byte costs time-on-air, which costs collision probability and node battery. Design a binary schema with fixed fields; do not send JSON to space.
- **No ACK means no retransmission control.** Nodes should send the same reading a small number of times with randomised delays rather than expecting reliability.
- **Collisions are the throughput limit.** With uncoordinated ALOHA-style access, throughput peaks at a low channel utilisation. Randomise transmit times, and prefer many short messages over few long ones.
- **Buffer sizing.** Compute it: nodes × messages per node per day × bytes, against downlink volume per day. If the buffer can overflow, define the drop policy explicitly (oldest first, or lowest priority first) rather than letting the filesystem decide.
- **Duty cycle and national regulation.** ISM band duty-cycle limits vary by jurisdiction and are enforced. Confirm the rules in each country where nodes will operate, and enforce them in node firmware, not in documentation.
- **Security.** These are unauthenticated radio messages arriving from anywhere. Sign or MAC the payload at the node with a per-node key, validate on the backend, and treat the satellite purely as an untrusted transport. Never let a payload message trigger a spacecraft action.
$md$);

insert into public.modules (course_id, slug, title, summary, sort_order)
values (c2, 'ground-segment', 'Ground Segment and Pass Operations',
  'Predicting passes, correcting Doppler, decoding with SDR, and running a real contact.', 3)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'pass-prediction', 'Orbits, TLEs and Pass Prediction', 'reading', 35, 1,
$md$
## What a TLE is, and what it is not

A **Two-Line Element set** encodes a mean orbital state in a format designed for punch cards. It is only meaningful when propagated with **SGP4/SDP4** — the analytical model the elements were fitted to. Feeding TLE elements into a Keplerian propagator gives wrong answers, because the mean elements have specific perturbation terms removed in a way only SGP4 puts back.

```
1 25544U 98067A   26219.51782528  .00016717  00000-0  10270-3 0  9007
2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537
```

The fields you will actually use: **epoch** (year and fractional day), **inclination**, **RAAN**, **eccentricity** (implied decimal point), **argument of perigee**, **mean anomaly**, and **mean motion** in revolutions per day. Mean motion of 15.72 rev/day gives a period of 91.6 minutes.

**Accuracy degrades with age.** A fresh TLE is good to roughly a kilometre; a two-week-old TLE on a low, draggy CubeSat can be tens of kilometres out along-track, which shows up as a pass arriving minutes early or late. Refresh from the public catalogue at least daily during commissioning. After a launch that deploys many CubeSats together, expect days to weeks of ambiguity before your object is correctly identified — plan to search across several candidate objects and confirm by Doppler signature.

## Pass geometry

For a 500 km circular orbit:

- Orbital period ≈ **94.6 minutes**
- Maximum pass duration (overhead) ≈ **11 minutes**
- Typical usable pass ≈ **6–9 minutes** above 10° elevation
- Passes per day over a mid-latitude site ≈ **4–6 usable**, clustered in two groups

Two consequences. First, your entire daily contact time is well under an hour, so operations must be scripted and unattended. Second, **elevation matters enormously**: a 5° pass has 10 dB more path loss than a 90° pass and is far more affected by terrain, multipath and ground noise. Schedule critical activities on high-elevation passes.

## Doppler

$$\Delta f = -\frac{\dot{r}}{c} f_0$$

At 437 MHz, expect approximately **±10 kHz** across a pass, with the highest rate of change at closest approach — where the shift sweeps through zero fastest and where a fixed-frequency receiver loses lock. At 868 MHz the shift roughly doubles; at S-band it is ±50 kHz.

Standard practice is **full Doppler correction on the ground**: your tracking software computes the instantaneous shift from the propagated orbit and commands the radio's frequency, typically several times per second, via Hamlib or an SDR's tuning API. Correct the **uplink** too — the satellite's receiver is usually fixed-frequency with a modest capture range, and an uncorrected uplink at S-band will simply miss it.

## The station

A minimal but genuinely capable UHF station:

| Element | Choice | Note |
|---|---|---|
| Antenna | Cross-Yagi, ~12–16 dBi, RHCP | Circular polarisation removes spin fading |
| Rotator | Az/El with Hamlib support | Or a fixed high-gain antenna and accept fewer passes |
| LNA | NF < 1 dB, **at the antenna** | The highest-value component in the chain |
| Feedline | Low-loss coax, as short as practical | Loss before the LNA is loss you never recover |
| Receiver | RTL-SDR for beacons; better ADC for 9k6 | Bandwidth and dynamic range matter more than tuning range |
| Software | GNU Radio / gr-satellites, Gpredict, SatNOGS client | |

**SatNOGS** deserves specific mention: a global network of volunteer-run stations that will observe your satellite and publish the frames. Register your satellite and publish your decoder, and you effectively acquire a worldwide ground segment for free. For an African programme with a single station, this is transformative — it turns four passes a day into dozens.

## RFI, the silent killer

Before you build, **survey your site**. Sweep the band with an SDR over 24 hours and look for: switching power supplies, LED lighting drivers, Ethernet-over-power adapters, and nearby transmitters. A noise floor 15 dB above thermal costs you 15 dB of link margin and no amount of antenna gain fixes it. Ferrites, a clean ground, and moving the antenna 20 m away from the building are cheaper than a bigger Yagi.
$md$);

perform app.seed_lesson(m, 'beacon-decoder-sandbox', 'Lab: Decode an EduSat Beacon', 'simulation', 45, 2,
$md$
## Objective

Decode EduSat beacon frames by hand and with the sandbox, and confirm you can read spacecraft state from raw hex.

## The EduSat beacon format

The beacon is an AX.25 UI frame whose information field carries a fixed 24-byte binary structure, big-endian:

| Offset | Bytes | Field | Encoding |
|---|---|---|---|
| 0 | 2 | Sync | `0xA0 0x5A` |
| 2 | 1 | Format version | integer |
| 3 | 1 | Mode | 0 = BOOT, 1 = SAFE, 2 = NOMINAL, 3 = PAYLOAD, 4 = COMMS |
| 4 | 4 | Uptime | seconds, unsigned |
| 8 | 2 | Battery voltage | millivolts, unsigned |
| 10 | 2 | Battery current | milliamps, **signed** — negative is discharge |
| 12 | 1 | Battery temperature | °C, signed, offset by +40 |
| 13 | 1 | OBC temperature | °C, signed, offset by +40 |
| 14 | 1 | Reset count | unsigned, saturating |
| 15 | 1 | Payload queue depth | messages buffered |
| 16 | 2 | Photon/sun sensor sum | raw counts |
| 18 | 2 | Body rate magnitude | milli-degrees/s |
| 20 | 2 | Last RSSI heard | dBm × −1, unsigned |
| 22 | 2 | CRC-16/X.25 | over bytes 0..21 |

## Worked example

```
A05A 01 02 00015D3C 1F2E FF88 3A 37 03 11 04E2 0096 008A 07E9
```

- `A05A` — sync, valid
- `01` — format version 1
- `02` — mode NOMINAL
- `00015D3C` — 89,404 s uptime = 24 h 50 m 04 s
- `1F2E` — 7,982 mV = **7.98 V**, healthy for a 2S pack
- `FF88` — signed −120 mA, so **discharging at 120 mA** → in eclipse
- `3A` — 58 − 40 = **+18 °C** battery
- `37` — 55 − 40 = **+15 °C** OBC
- `03` — 3 resets since launch
- `11` — 17 payload messages buffered
- `04E2` — 1,250 counts on the sun sensor sum — consistent with eclipse
- `0096` — 150 m°/s = **0.15 °/s** body rate, detumbled
- `008A` — last heard node at **−138 dBm**, at the edge of SF12 sensitivity
- `07E9` — frame CRC, valid over bytes 0..21

That single frame tells you the satellite is healthy, in eclipse, detumbled, has buffered traffic waiting, and is hearing nodes at the very bottom of its sensitivity — which is the interesting operational finding. It suggests the node link is marginal and worth investigating.

## Your task in the sandbox

The sandbox below generates beacon frames from a simulated EduSat under conditions you select. Work through:

1. Decode three nominal frames by hand and confirm against the sandbox output.
2. Set the scenario to **eclipse with a heater fault** and identify which fields reveal it, and how quickly.
3. Set **post-reset** and explain what the uptime and reset count together tell you that neither tells you alone.
4. Corrupt a frame and confirm the CRC rejects it. Then corrupt it in a way the CRC does *not* catch, and describe the class of errors CRC-16 misses.
5. Capture five frames and save them to your lab record — you will reference them in your lab report.
$md$, false, 'beacon-decoder');

perform app.seed_lesson(m, 'link-budget-sandbox', 'Lab: Close a Link Budget', 'simulation', 45, 3,
$md$
## Objective

Use the interactive link budget calculator to close both legs of the EduSat link, then find the point at which each leg fails.

## Tasks

**1. The TT&C downlink.** Configure: 437 MHz, 2 W transmit, 2 dBi satellite antenna, 15 dBi ground antenna, 250 K system noise temperature, 9,600 bps GMSK with r=1/2 convolutional coding. Record the margin at 90°, 30° and 10° elevation. At what elevation does margin fall below 3 dB?

**2. Strip the ground station.** Replace the 15 dBi Yagi with a 2 dBi whip and recompute. What is the lowest elevation that still closes with 3 dB margin? What does this imply for a portable field station?

**3. Move the LNA.** Set system noise temperature to 600 K to represent an LNA at the far end of a lossy feedline. How many dB of antenna gain would you need to add to recover the loss? Compare the cost of that antenna against the cost of a mast-mounted LNA.

**4. The IoT uplink.** Configure: 868 MHz, +14 dBm node, 2 dBi node antenna, 2 dBi satellite antenna, SF12/125 kHz (−137 dBm sensitivity), 3 dB polarisation mismatch. Find the maximum slant range that closes with 0 dB margin, then convert that to a minimum elevation angle for a 550 km orbit. How many minutes of a 9-minute pass are actually usable?

**5. Trade study.** You may make exactly one change to improve the IoT uplink: (a) SF12 at 62.5 kHz bandwidth, (b) +20 dBm node transmit where regulation permits, (c) a 6 dBi patch on the satellite, or (d) circular polarisation on the satellite antenna. Compute the margin improvement for each, then rank them by improvement per unit of cost, mass and regulatory difficulty. Defend your ranking in two paragraphs.

**6. Honesty check.** Return to task 1 and add: 2 dB pointing loss, 1.5 dB implementation loss, and a 3 dB scintillation fade. Recompute the 10° margin. This is the number you would present at a design review.
$md$, false, 'link-budget');

-- --- Quiz for Course 2 -----------------------------------------------------
insert into public.quizzes (course_id, slug, title, instructions, is_graded,
  pass_threshold, time_limit_minutes, max_attempts, questions_per_attempt,
  shuffle_questions, reveal_feedback)
values (c2, 'link-and-protocol-assessment', 'Link Budget and Protocol Assessment',
  'Calculator permitted. Numeric answers graded within tolerance. Show your working in the lab report, not here.',
  true, 75, 50, 3, 0, true, true)
on conflict (course_id, slug) do update set title = excluded.title
returning id into q;

delete from public.quiz_questions where quiz_id = q;

insert into public.quiz_questions (quiz_id, kind, prompt_md, options, answer_key, explanation_md, points, sort_order) values
(q, 'numeric',
 'Compute the free-space path loss at 437 MHz over a slant range of 1,700 km, in dB. (± 0.5 dB)',
 '[]'::jsonb,
 '{"value":149.8,"tolerance":0.6,"unit":"dB"}'::jsonb,
 'L = 20·log10(1700) + 20·log10(437) + 32.44 = 64.61 + 52.81 + 32.44 = 149.86 dB. Note this is the low-elevation case, roughly 10.6 dB worse than the 500 km zenith case — which is why budgets must be computed at low elevation.',
 2, 1),

(q, 'single_choice',
 'Your ground station uses a 15 dBi antenna and has a system noise temperature of 250 K. What is its G/T?',
 '[{"id":"a","text":"−9.0 dB/K"},{"id":"b","text":"+9.0 dB/K"},
   {"id":"c","text":"−24.0 dB/K"},{"id":"d","text":"+39.0 dB/K"}]'::jsonb,
 '{"correct":"a"}'::jsonb,
 'G/T = G − 10·log10(Tsys) = 15 − 10·log10(250) = 15 − 23.98 = −8.98 dB/K. Negative G/T figures are entirely normal for small UHF stations.',
 2, 2),

(q, 'single_choice',
 'Why should the low-noise amplifier be mounted at the antenna rather than at the receiver end of the feedline?',
 '[{"id":"a","text":"It reduces the antenna''s physical noise temperature"},
   {"id":"b","text":"Feedline loss ahead of the LNA attenuates the signal and adds noise, degrading system noise figure irrecoverably"},
   {"id":"c","text":"It increases the transmitter EIRP"},
   {"id":"d","text":"It shortens the required coaxial cable run"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'By the Friis noise formula, the first stage dominates system noise figure. Loss before the LNA both attenuates the signal and contributes thermal noise, and no downstream gain can recover it. This is often the cheapest large improvement available to a station.',
 2, 3),

(q, 'numeric',
 'A LoRa link operates at SF12 with 125 kHz bandwidth. What is the symbol duration in milliseconds? (± 1 ms)',
 '[]'::jsonb,
 '{"value":32.77,"tolerance":1.2,"unit":"ms"}'::jsonb,
 'T_sym = 2^SF / BW = 4096 / 125000 = 32.77 ms. Each SF step roughly doubles this, which is why time-on-air — and therefore collision probability and node battery drain — is the real cost of sensitivity.',
 2, 4),

(q, 'single_choice',
 'In a CCSDS Space Packet primary header, the Packet Data Length field contains the value 0x001F. How many octets of data follow the header?',
 '[{"id":"a","text":"31"},{"id":"b","text":"32"},{"id":"c","text":"30"},{"id":"d","text":"33"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'The field carries (number of octets − 1). 0x001F = 31, so 32 octets follow. This off-by-one exists so a full 65,536-byte field can be expressed in 16 bits, and it is the most frequently mis-implemented detail in the standard.',
 2, 5),

(q, 'multi_choice',
 'Which of these are functions of the CCSDS channel coding layer on a telemetry downlink? Select all that apply.',
 '[{"id":"a","text":"The Attached Sync Marker 0x1ACFFC1D lets the receiver find frame boundaries"},
   {"id":"b","text":"Pseudo-randomisation guarantees bit transitions for clock recovery"},
   {"id":"c","text":"Reed–Solomon (255,223) corrects up to 16 symbol errors per codeword"},
   {"id":"d","text":"Interleaving spreads burst errors across multiple codewords"},
   {"id":"e","text":"It authenticates the sender of the frame"}]'::jsonb,
 '{"correct":["a","b","c","d"]}'::jsonb,
 'All except (e). Channel coding provides synchronisation, transition density and error correction — not authentication. Authentication of telecommands is a separate concern handled at the command layer, and it matters: an unauthenticated uplink is a spacecraft anyone can command.',
 3, 6),

(q, 'numeric',
 'A satellite at 868 MHz approaches with a radial velocity of 7.5 km/s. What is the magnitude of the Doppler shift, in kHz? (± 1 kHz)',
 '[]'::jsonb,
 '{"value":21.7,"tolerance":1.2,"unit":"kHz"}'::jsonb,
 'Δf = (v/c)·f0 = (7500 / 3e8) × 868e6 = 21.7 kHz. At 62.5 kHz LoRa bandwidth this shift is a third of the channel — which is why direct-to-satellite deployments often use wider bandwidth than a terrestrial one would, despite the sensitivity cost.',
 2, 7),

(q, 'single_choice',
 'In an AX.25 address field, each callsign character is shifted left by one bit. Why?',
 '[{"id":"a","text":"To compress the callsign into fewer bytes"},
   {"id":"b","text":"To free bit 0 as a flag marking the last address in the field"},
   {"id":"c","text":"To provide error detection on the address"},
   {"id":"d","text":"To make the address compatible with NRZI encoding"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'The ASCII character occupies bits 7..1, leaving bit 0 as the HDLC extension bit. It is 0 in every address except the last, where it is 1. This is the detail that most often defeats a first attempt at hand-decoding a frame.',
 2, 8),

(q, 'short_text',
 'What is the 32-bit CCSDS Attached Sync Marker, in hexadecimal? (Answer as 8 hex digits, no prefix.)',
 '[]'::jsonb,
 '{"accept":["1ACFFC1D","0x1ACFFC1D","1acffc1d","0x1acffc1d"]}'::jsonb,
 '0x1ACFFC1D. It is transmitted un-randomised so the receiver can correlate against it to establish frame lock before de-randomising the frame body.',
 1, 9),

(q, 'single_choice',
 'A store-and-forward IoT payload receives unauthenticated LoRa messages from ground nodes. What is the correct security posture?',
 '[{"id":"a","text":"Trust messages from known node IDs, since IDs are assigned by the operator"},
   {"id":"b","text":"Treat the satellite as an untrusted transport; authenticate payloads end-to-end at node and backend, and never let a payload message trigger a spacecraft action"},
   {"id":"c","text":"Encrypt the downlink, which secures the whole chain"},
   {"id":"d","text":"Rely on the obscurity of the payload binary format"}]'::jsonb,
 '{"correct":"b"}'::jsonb,
 'Node IDs are trivially spoofable over the air and encrypting only the downlink protects nothing on the uplink leg. End-to-end authentication with per-node keys, verified on the backend, is the only posture that holds — and the payload path must be architecturally incapable of commanding the bus.',
 3, 10);

-- --- Lab assignment for Course 2 -------------------------------------------
insert into public.lab_assignments (course_id, slug, title, brief_md, rubric, data_schema,
  max_points, pass_threshold, allow_resubmit, due_offset_days)
values (
  c2, 'iot-uplink-characterisation',
  'Lab 2: Characterise the IoT Uplink',
$md$
## Brief

Using the EduSat kit's SX1262 radio (or the digital twin if hardware has not yet been issued), characterise the store-and-forward uplink and reconcile measurement against your predicted link budget.

## Procedure

1. Configure a ground node at SF7/125 kHz, +14 dBm. Transmit 50 messages of 20 bytes at 5 s intervals to the EduSat receiver at a fixed separation. Record RSSI, SNR and packet reception rate.
2. Repeat at SF9, SF10 and SF12, holding everything else constant.
3. Introduce a calibrated attenuator (or, on the twin, an equivalent path loss) in 6 dB steps until packet reception rate falls below 50 %. Record the RSSI at that point for each spreading factor.
4. Compute time-on-air for each configuration and compare against measurement.
5. Compute the predicted maximum slant range for each SF using the measured sensitivity, and convert to a service window duration for a 550 km orbit.

## Deliverable

A report containing: your measured sensitivity per spreading factor against the datasheet figure; a reconciliation of measured versus predicted link margin with named causes for any discrepancy greater than 3 dB; a time-on-air versus sensitivity trade curve; and a recommendation of a spreading factor for the EduSat mission with the reasoning stated in one paragraph.

Attach your raw capture log as CSV.
$md$,
 '[{"criterion":"Measurement quality and completeness","weight":25,"descriptor":"All four spreading factors characterised with adequate sample size; method reproducible from the report alone"},
   {"criterion":"Link budget reconciliation","weight":30,"descriptor":"Measured and predicted margins compared with discrepancies attributed to named, plausible causes rather than dismissed"},
   {"criterion":"Trade analysis","weight":25,"descriptor":"Time-on-air versus sensitivity trade is quantified, and the recommendation follows from the data rather than preceding it"},
   {"criterion":"Engineering communication","weight":20,"descriptor":"Figures labelled with units, uncertainty stated, conclusions separable from observations"}]'::jsonb,
 '[{"key":"sf7_sensitivity_dbm","label":"Measured SF7 sensitivity (dBm)","type":"number"},
   {"key":"sf9_sensitivity_dbm","label":"Measured SF9 sensitivity (dBm)","type":"number"},
   {"key":"sf10_sensitivity_dbm","label":"Measured SF10 sensitivity (dBm)","type":"number"},
   {"key":"sf12_sensitivity_dbm","label":"Measured SF12 sensitivity (dBm)","type":"number"},
   {"key":"predicted_margin_db","label":"Predicted margin at 10° elevation (dB)","type":"number"},
   {"key":"measured_margin_db","label":"Measured margin, range-scaled (dB)","type":"number"},
   {"key":"recommended_sf","label":"Recommended spreading factor","type":"text"},
   {"key":"kit_asset_tag","label":"Kit asset tag used (or DIGITAL-TWIN)","type":"text"}]'::jsonb,
 100, 60, true, 14)
on conflict (course_id, slug) do update
  set title = excluded.title, brief_md = excluded.brief_md, rubric = excluded.rubric,
      data_schema = excluded.data_schema;

-- ===========================================================================
-- COURSE 3 — Flight Software and IoT Edge Firmware
-- ===========================================================================
insert into public.courses (
  track_id, slug, title, subtitle, summary, description, level, status,
  tags, prerequisites, outcomes, estimated_minutes, requires_hardware,
  hardware_notes, price_cents, issues_certificate, pass_threshold, sort_order,
  published_at
) values (
  v_track, 'flight-software-and-edge-firmware',
  'Flight Software and IoT Edge Firmware',
  'Mode management, FDIR, telemetry design and the edge device',
  'Write the software that keeps a spacecraft alive: mode machines, watchdogs, FDIR, telemetry design, and the low-power edge firmware at the other end of the link.',
  'The third course in the EduSat track moves from architecture to code. You will implement a mode manager and safe-mode entry, design a telemetry dictionary that survives an anomaly investigation, build fault detection, isolation and recovery that does not make things worse, and write low-power firmware for the IoT edge device — including the duty-cycling and energy accounting that make a coin-cell node last years.',
  'advanced', 'published',
  array['flight software','FDIR','RTOS','firmware','low power','telemetry'],
  array['Satellite-to-IoT Link Design and Ground Segment','Embedded C or Rust','Version control'],
  array[
    'Implement a mode manager with deterministic transitions and safe-mode entry',
    'Design a telemetry dictionary that supports anomaly investigation',
    'Build FDIR that escalates rather than oscillates',
    'Write duty-cycled edge firmware with a defensible energy budget',
    'Establish a software verification approach appropriate to a flight article'
  ],
  540, true,
  'Requires the EduSat kit and the IoT edge device. Digital twin covers the flight software modules but not the edge power measurements.',
  0, true, 75, 3, now()
)
on conflict (slug) do update
  set title = excluded.title, subtitle = excluded.subtitle, summary = excluded.summary,
      description = excluded.description, status = 'published', tags = excluded.tags,
      prerequisites = excluded.prerequisites, outcomes = excluded.outcomes,
      requires_hardware = excluded.requires_hardware, hardware_notes = excluded.hardware_notes,
      estimated_minutes = excluded.estimated_minutes, track_id = excluded.track_id,
      pass_threshold = excluded.pass_threshold,
      published_at = coalesce(public.courses.published_at, now())
returning id into c3;

insert into public.modules (course_id, slug, title, summary, sort_order)
values (c3, 'modes-and-fdir', 'Mode Management and FDIR',
  'The state machine that keeps the spacecraft alive when nobody is watching.', 1)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'mode-manager', 'The Mode Manager', 'reading', 40, 1,
$md$
## One variable, one owner

The single most useful architectural constraint in flight software: **exactly one module owns the mode variable**, and every transition goes through one function. Everything else reads it. The moment two tasks can write the mode, you have a race condition that will manifest once, over the Pacific, and you will never reproduce it.

## A workable mode set for EduSat

| Mode | Entered when | Behaviour |
|---|---|---|
| `BOOT` | Power-on or reset | Self-test, load persistent state, decide next mode |
| `SAFE` | Fault escalation, low SoC, ground command | Beacon only, receiver on, all payloads off, heaters permitted |
| `NOMINAL` | Commissioning complete, SoC healthy | Bus housekeeping, ADCS active, payload receiver duty-cycled |
| `PAYLOAD` | Over service area, SoC above threshold | Payload receiver continuous, buffering |
| `COMMS` | Predicted pass window, SoC above threshold | Transmitter enabled, downlink queue draining |

Transitions worth writing down explicitly, because the ones you leave implicit are the ones that bite:

- Any mode → `SAFE` on: SoC < 30 %, battery temperature outside limits, three watchdog resets within one orbit, or command loss timer expiry.
- `SAFE` → `NOMINAL` only on **explicit ground command**, or after a long autonomous timeout with SoC recovered above 60 %. Never automatically on SoC alone — a satellite that oscillates between safe and nominal every orbit is worse than one that stays safe.
- `NOMINAL` → `COMMS` on a stored pass schedule **and** SoC above threshold. The SoC check must be re-evaluated during the pass, not only at entry.
- `COMMS` → `NOMINAL` on schedule end, queue empty, or SoC dropping below the abort threshold.

## Hysteresis everywhere

Every threshold needs two values. If you enter SAFE below 30 % state of charge, exit above 60 %, not above 31 %. Every autonomous action that can be triggered by a noisy measurement needs both hysteresis and **persistence** — the condition must hold for N consecutive samples before it counts. A single ADC glitch should never change the spacecraft's mode.

## Time

Two clocks, both necessary:

- A **monotonic tick** since boot. Never resets, never adjusted, used for all timeouts and scheduling. Timeouts computed on wall-clock break spectacularly when the ground corrects the clock.
- A **wall clock** synchronised from the ground, used for timestamping telemetry and evaluating the pass schedule. Store the last known good time in non-volatile memory on a schedule so a reset does not throw you back to the epoch.

Timestamp every telemetry record with both. When you are debugging an anomaly six weeks later, the relationship between the two is often the clue.

## Commissioning is a mode too

Resist the urge to launch with `NOMINAL` as the boot target. A commissioning mode that does nothing but beacon, collect whole-orbit data, and accept commands gives you a calm two weeks to characterise the spacecraft before it starts making autonomous decisions based on sensors you have not yet calibrated.
$md$);

perform app.seed_lesson(m, 'fdir', 'Fault Detection, Isolation and Recovery', 'reading', 40, 2,
$md$
## The principle that matters most

**FDIR must never make a recoverable situation unrecoverable.** More small satellites have been lost to autonomy that responded confidently to a misread sensor than to the faults the autonomy was written to handle. Every automatic action should be reversible by ground command, and the path to "beacon and listen" should be reachable from every state.

## The hierarchy

Design FDIR in tiers, and let each tier act only if the one below it failed.

**Tier 0 — hardware.** Current-limited load switches, battery protection ICs, thermal cutouts. These act in microseconds and cannot be disabled in software. This is where latch-up protection lives.

**Tier 1 — device drivers.** A sensor that returns an out-of-range value, fails a checksum, or does not respond is marked invalid and retried. After N failures the device is declared failed and power-cycled once. The consumer of that data must handle "invalid" as a first-class case, not as zero.

**Tier 2 — subsystem.** The ADCS notices its attitude solution has not converged for ten minutes and falls back to B-dot. The EPS notices a rail is drawing more than expected and sheds it.

**Tier 3 — system.** The mode manager counts unresolved subsystem faults and enters SAFE.

**Tier 4 — last resort.** The hardware watchdog resets the processor. The reset counter escalates: repeated resets boot the golden image and enter SAFE.

## Detection patterns

- **Limit checking** with hysteresis and persistence. Never act on one sample.
- **Consistency checking** across independent sources. Two temperature sensors that disagree by 40 °C mean one of them is lying, and you should not act on either until you know which.
- **Liveness.** Every task checks in with a supervisor. A task that stops checking in is a fault, not a silence.
- **Trend detection.** Battery capacity fading, a temperature climbing over days, an increasing rate of CRC failures on a bus. These are the faults that give you warning if you record enough telemetry to see them.

## Recovery patterns

- **Retry** with backoff, bounded.
- **Power cycle** the device, once, with a cool-down and a counter.
- **Reconfigure** — switch to a redundant unit or a degraded mode.
- **Escalate** to the next tier.
- **Do nothing and report.** Frequently correct. If the fault is not threatening the spacecraft, log it, telemeter it, and let the ground decide.

## Anti-patterns

- **Oscillation.** A recovery that re-triggers the detection. Always add a cool-down and a counter, and cap the number of automatic recoveries per orbit.
- **Silent recovery.** If FDIR acted and did not telemeter that it acted, you will misdiagnose the next anomaly. Every FDIR action produces an event record with a timestamp, the triggering measurement, and the action taken.
- **Untested paths.** FDIR code runs rarely, which means it is the least-tested code you fly. Inject every fault on the bench, deliberately, and verify the response. The digital twin exists partly for this.
- **Disabling FDIR to get through a test.** It will stay disabled. Fix the underlying issue or record a formal waiver.

## Worked example: the burn-wire that does not confirm

Command antenna deployment. Fire burn-wire circuit A for 3 s at 1 A, monitoring current. Then check the deployment switch.

- Current within range but switch does not indicate → the mechanism may have released without triggering the switch. **Do not simply retry indefinitely.** Wait 30 minutes, attempt an RF-based confirmation (a deployed antenna changes the reflected power measurably), and try circuit B once. Then stop and report. A burn resistor left energised will destroy itself and possibly the board.
- No current → open circuit. Try circuit B immediately.
- Overcurrent → short. Cut power, do not retry that circuit, report.

Note how much of the design is about knowing when to *stop* trying. That judgement is the substance of FDIR.
$md$);

insert into public.modules (course_id, slug, title, summary, sort_order)
values (c3, 'telemetry-and-edge', 'Telemetry Design and the Edge Device',
  'A telemetry dictionary you will thank yourself for, and firmware that lasts years on a coin cell.', 2)
on conflict (course_id, slug) do update set title = excluded.title, summary = excluded.summary
returning id into m;

perform app.seed_lesson(m, 'telemetry-dictionary', 'Designing the Telemetry Dictionary', 'reading', 35, 1,
$md$
## Telemetry is written for the anomaly you have not had yet

The instinct is to telemeter what you expect to need. The discipline is to telemeter what you would want if the spacecraft started behaving in a way you cannot explain. These are different lists, and the second is longer.

## Structure

Define every telemetry point in a machine-readable dictionary — YAML or JSON, version-controlled alongside the firmware — with:

```yaml
- id: EPS_VBATT
  apid: 0x064
  offset: 8
  type: uint16
  unit: mV
  scale: 1.0
  limits: { red_low: 6400, yellow_low: 6800, yellow_high: 8300, red_high: 8500 }
  description: Battery pack terminal voltage, measured at the EPS input
```

Generate from that dictionary: the firmware packing code, the ground decoder, the limit-checking configuration, and the documentation. Hand-maintaining these four in parallel guarantees they diverge, and the divergence is discovered during an anomaly.

## What to include, beyond the obvious

- **Counters, not just states.** How many times has this fault occurred since boot? Since launch? A state tells you now; a counter tells you the history you did not record.
- **Min/max/mean since last downlink** for fast-changing analogue values you cannot sample at full rate.
- **The inputs to every autonomous decision.** If FDIR entered SAFE, telemeter the measurement that triggered it, not just the fact of the transition.
- **Software version, dictionary version, and configuration checksum.** You will one day be unsure what is actually running.
- **Time in both clocks**, as discussed.
- **Reset cause register.** The processor knows why it reset. Record it.

## Rates and the ring buffer

Three tiers, matching the three telemetry layers from Course 1:

| Tier | Rate | Storage |
|---|---|---|
| Beacon | 1 per 30–60 s | Not stored, transmitted live |
| Housekeeping | 1 per 10 s | Ring buffer, ~1 orbit |
| Whole-orbit data | 1 per 60 s, reduced set | Ring buffer, ~7 days |
| Event log | On occurrence | Ring buffer, ~30 days |

Size these against your flash and your downlink volume, and make the retention explicit. The event log is the highest-value item per byte and should be the last thing you sacrifice.

## Compression

Telemetry compresses extremely well because it is mostly unchanging. Delta encoding against the previous sample followed by a simple entropy coder routinely achieves 4:1 on housekeeping data. Given that your downlink is power-limited, this is equivalent to quadrupling your transmit budget for the cost of some flash and CPU.

Never compress the beacon. It must remain decodable by someone with no software but a specification.
$md$);

perform app.seed_lesson(m, 'edge-firmware', 'Low-Power Edge Firmware', 'reading', 40, 2,
$md$
## The energy budget is the design

A node that must run three years on a 1,200 mAh lithium primary cell has an average current budget of

$$I_{\text{avg}} = \frac{1200\ \text{mAh}}{3 \times 8760\ \text{h}} \approx 45\ \mu\text{A}$$

and that is before self-discharge, which for a good lithium thionyl chloride cell is around 1 % per year. Call it **35 µA** of usable average current.

Now account for a single SF12 transmission of a 20-byte payload:

| Phase | Current | Duration | Charge |
|---|---|---|---|
| Wake + sensor read | 3 mA | 50 ms | 0.15 µAh |
| Radio TX at +14 dBm | 45 mA | 1.32 s | 16.5 µAh |
| Radio settle/idle | 5 mA | 100 ms | 0.14 µAh |
| Sleep | 2 µA | remainder | — |
| **Per transmission** | | | **~16.8 µAh** |

At 35 µA average you have **840 µAh per day**. Sleep at 2 µA consumes 48 µAh, leaving 792 µAh — about **47 transmissions per day**, or one every 31 minutes. If the ConOps wants a reading every 15 minutes, something must give: a bigger cell, a lower spreading factor, a shorter payload, or energy harvesting.

**Do this arithmetic before choosing the radio.** It is the whole design.

## Sleep is the default state

- The MCU should be in its deepest retention sleep for **>99.9 %** of its life, woken only by an RTC alarm or a sensor interrupt.
- Audit every peripheral: an I²C pull-up on a 4.7 kΩ resistor with a stuck-low bus draws 700 µA and will flatten your cell in weeks. Power-gate sensor rails.
- Watch for **leakage through GPIO** into unpowered peripherals. Configure unused pins as analogue inputs or drive them to the rail.
- Measure with a proper low-current instrument across the full dynamic range. A multimeter with a burden voltage will lie to you at microamp levels, and averaging over a duty cycle with millisecond-scale peaks requires an instrument that can integrate.

## Time without a real clock

Nodes drift. A cheap RTC crystal at ±20 ppm drifts **±10 minutes per year**. If your ConOps depends on nodes transmitting in assigned windows, either discipline the clock (from a downlinked time reference, which costs a receiver and its power) or design the access scheme to tolerate drift. **The latter is almost always right for a cheap node**: randomised ALOHA access with no time discipline at all, accepting collisions and relying on repetition.

## Message design

- **Fixed binary layout**, documented, versioned in the first byte.
- **Node identity plus a monotonic message counter.** The counter is what lets the backend deduplicate messages heard on multiple passes and detect losses.
- **A truncated MAC** — even 4 bytes of a keyed HMAC over the payload, with a per-node key, defeats casual spoofing at a cost of 4 bytes.
- **No acknowledgements.** Send a reading two or three times, spaced by a randomised interval measured in minutes, and accept that some will be lost.
- **Nothing that can command anything.** The node is a sensor. It reports. The path from a received payload message to any actuator, on the spacecraft or on the ground, should not exist.

## Firmware update

You will want to fix something. Design for it from the start: a bootloader that validates a signature over the application image, an update path that is idempotent and power-fail-safe (A/B images with a commit flag), and a rollback that triggers automatically if the new image fails to check in within a bounded time. For nodes with no downlink capability, accept that the fleet is not updatable and let that discipline your testing accordingly.
$md$);

end
$seed$;

-- Publish a starter cohort for the flagship course so the catalog has one.
do $c$
declare v_course uuid;
begin
  select id into v_course from public.courses where slug = 'satellite-iot-link-and-ground-segment';
  if v_course is not null then
    insert into public.cohorts (course_id, slug, name, delivery_mode, location, timezone,
      starts_on, ends_on, capacity, is_published, notes)
    values (v_course, 'edusat-2026-q4-nairobi', 'EduSat Link Engineering — Q4 2026 (Nairobi)',
      'hybrid', 'AfriOrbit Lab, Nairobi', 'Africa/Nairobi',
      current_date + 45, current_date + 87, 20, true,
      'Hardware kits issued on day 1. Two live ground-station passes scheduled in week 4.')
    on conflict (slug) do nothing;
  end if;
end
$c$;


-- =============================================================================
-- =============================================================================
--
--   PART 08 OF 12   0008_jwt_claims_hook.sql   (2,152 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- AfriOrbit LMS — 0008 Custom Access Token Hook
--
-- Puts `user_role` and `account_status` into the JWT so the request proxy can
-- make authorisation decisions without a database round trip on every request.
--
-- After running this migration you must enable the hook:
--   Local  : it is already wired in supabase/config.toml
--   Hosted : Dashboard → Authentication → Hooks → Customize Access Token (JWT)
--            → select `public.custom_access_token_hook`
--
-- SECURITY: the claim is advisory. It speeds up routing decisions in the proxy
-- layer. Every actual data access is still enforced by RLS against the live
-- profiles row, so a stale claim cannot grant real privilege.
-- =============================================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims jsonb;
  v_role   text;
  v_status text;
  v_mfa    boolean;
begin
  select p.role::text, p.status::text, p.mfa_enabled
    into v_role, v_status, v_mfa
    from public.profiles p
   where p.id = (event ->> 'user_id')::uuid;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);

  v_claims := jsonb_set(v_claims, '{user_role}',    to_jsonb(coalesce(v_role, 'learner')));
  v_claims := jsonb_set(v_claims, '{account_status}', to_jsonb(coalesce(v_status, 'pending')));
  v_claims := jsonb_set(v_claims, '{mfa_enabled}',  to_jsonb(coalesce(v_mfa, false)));

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on table public.profiles to supabase_auth_admin;

drop policy if exists profiles_auth_admin_read on public.profiles;
create policy profiles_auth_admin_read on public.profiles
  as permissive for select to supabase_auth_admin using (true);


-- =============================================================================
-- =============================================================================
--
--   PART 09 OF 12   0009_commerce_gating.sql   (26,465 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- AfriOrbit LMS — 0009 Hardware commerce and demo gating
--
-- Adds the machinery behind afriorbit.space:
--   * institutional email verification, which grants demo tier 1 automatically
--   * quote requests with transparent qualification scoring
--   * export-control screening as a first-class state, not a checkbox
--   * quotations and orders, which provision LMS cohort seats on payment
--
-- Design position: the demo tier is a SIGNED, SERVER-ISSUED grant stored here.
-- The marketing site never decides what a visitor may see; it asks this
-- schema. A tier claim in a cookie is a routing hint, exactly as with the
-- JWT role claim in 0008.
-- =============================================================================

do $$ begin
  create type demo_tier as enum ('open', 'verified', 'qualified');
exception when duplicate_object then null; end $$;

do $$ begin
  create type quote_status as enum (
    'submitted',     -- awaiting first human review
    'screening',     -- export / restricted-party screening in progress
    'qualified',     -- cleared, engineer assigned
    'quoted',        -- formal quotation issued
    'won',           -- accepted, order created
    'lost',
    'rejected'       -- failed screening or out of scope
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type screening_state as enum ('pending', 'cleared', 'flagged', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type hw_order_status as enum (
    'draft', 'awaiting_po', 'awaiting_payment', 'paid', 'in_production',
    'shipped', 'delivered', 'cancelled'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Institutional domain intelligence
--
-- Auto-granting tier 1 to "anything that isn't gmail" is how you end up
-- emailing a datasheet to a competitor. This table is the allow/deny record
-- and it is auditable: every automatic decision can be explained afterwards.
-- ---------------------------------------------------------------------------
create table if not exists public.email_domains (
  domain        citext primary key,
  classification text not null
    check (classification in ('institutional', 'free', 'blocked', 'unknown')),
  institution_name text,
  country       text,
  notes         text,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

insert into public.email_domains (domain, classification) values
  ('gmail.com','free'), ('yahoo.com','free'), ('outlook.com','free'),
  ('hotmail.com','free'), ('icloud.com','free'), ('proton.me','free'),
  ('protonmail.com','free'), ('live.com','free'), ('aol.com','free'),
  ('mail.com','free'), ('gmx.com','free'), ('yandex.com','free'),
  ('qq.com','free'), ('163.com','free'), ('zoho.com','free')
on conflict (domain) do nothing;

/**
 * Classify a domain.
 *
 * Explicit table entry wins. Otherwise a conservative pattern match on
 * academic and government suffixes. Anything else is 'unknown', which means a
 * human decides — it does NOT mean rejected.
 */
create or replace function app.classify_email_domain(p_domain text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d text := lower(trim(p_domain));
  v text;
begin
  if d is null or d = '' then return 'unknown'; end if;

  select classification into v from public.email_domains where domain = d;
  if found then return v; end if;

  if d ~ '\.edu$'                      then return 'institutional'; end if;
  if d ~ '\.ac\.[a-z]{2,}$'            then return 'institutional'; end if;
  if d ~ '\.edu\.[a-z]{2,}$'           then return 'institutional'; end if;
  if d ~ '\.sch\.[a-z]{2,}$'           then return 'institutional'; end if;
  if d ~ '\.gov(\.[a-z]{2,})?$'        then return 'institutional'; end if;
  if d ~ '\.mil(\.[a-z]{2,})?$'        then return 'institutional'; end if;
  if d ~ '\.int$'                      then return 'institutional'; end if;
  if d ~ '(^|\.)(univ|university|institute|polytechnic|research)\.' then
    return 'institutional';
  end if;

  return 'unknown';
end;
$$;

grant execute on function app.classify_email_domain(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Demo access grants
-- ---------------------------------------------------------------------------
create table if not exists public.demo_access (
  id            uuid primary key default gen_random_uuid(),
  -- Either an authenticated learner or an anonymous marketing-site visitor
  -- identified only by a verified email. Both are legitimate.
  user_id       uuid references public.profiles(id) on delete cascade,
  email         citext not null,
  domain        citext not null,
  tier          demo_tier not null default 'open',
  granted_reason text not null,
  -- Opaque, high-entropy token the marketing site holds in a cookie. Only the
  -- hash is stored, exactly as with invitations and recovery codes.
  token_hash    text unique,
  verified_at   timestamptz,
  expires_at    timestamptz not null default (now() + interval '90 days'),
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  quote_request_id uuid,
  created_at    timestamptz not null default now()
);

create index if not exists demo_access_email_idx on public.demo_access (email);
create index if not exists demo_access_token_idx on public.demo_access (token_hash);

-- Pending email verifications. Short-lived, single-use.
create table if not exists public.demo_verifications (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null,
  code_hash    text not null,
  attempts     int not null default 0,
  consumed_at  timestamptz,
  expires_at   timestamptz not null default (now() + interval '30 minutes'),
  ip_hash      text,
  created_at   timestamptz not null default now()
);

create index if not exists demo_verifications_email_idx
  on public.demo_verifications (email, created_at desc);

-- ---------------------------------------------------------------------------
-- Quote requests
-- ---------------------------------------------------------------------------
create table if not exists public.quote_requests (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,

  -- Requester
  institution     text not null,
  institution_type text not null,
  country         text not null,
  contact_name    text not null,
  contact_email   citext not null,
  contact_role    text not null,
  phone           text,

  -- Requirement
  use_case        text not null,
  cohort_size     text,
  quantity_band   text,
  interests       text[] not null default '{}',

  -- Procurement
  funding_status  text,
  timeline        text,
  procurement_route text,
  funding_source  text,

  -- Derived
  domain_class    text not null default 'unknown',
  score           int not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  status          quote_status not null default 'submitted',
  sla_due_at      timestamptz,

  -- Export control. A separate state machine because it gates shipment
  -- independently of whether the commercial conversation is going well.
  screening       screening_state not null default 'pending',
  screening_notes text,
  screened_by     uuid references public.profiles(id) on delete set null,
  screened_at     timestamptz,

  assigned_to     uuid references public.profiles(id) on delete set null,
  internal_notes  text,
  consent_given_at timestamptz not null default now(),
  ip_hash         text,
  user_agent      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists quote_requests_status_idx on public.quote_requests (status, created_at desc);
create index if not exists quote_requests_score_idx  on public.quote_requests (score desc);
create index if not exists quote_requests_email_idx  on public.quote_requests (contact_email);

alter table public.demo_access
  drop constraint if exists demo_access_quote_request_id_fkey;
alter table public.demo_access
  add constraint demo_access_quote_request_id_fkey
  foreign key (quote_request_id) references public.quote_requests(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Catalogue of sellable hardware and services
-- ---------------------------------------------------------------------------
create table if not exists public.hardware_products (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,
  name          text not null,
  category      text not null
    check (category in ('spacecraft', 'edge_device', 'ground_station', 'training', 'curriculum', 'support', 'spares')),
  description   text not null default '',
  -- List price is a reference for quoting; the quoted price may differ and is
  -- recorded per line. Never expose this table to anon.
  list_price_cents int not null default 0,
  currency      text not null default 'USD',
  unit          text not null default 'each',
  lead_time_weeks int,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

insert into public.hardware_products (sku, name, category, description, list_price_cents, unit, lead_time_weeks, sort_order) values
  ('AO-EDUSAT-1U',     'EduSat 1U satellite-to-IoT trainer', 'spacecraft',
   'Flight-representative 1U bus with LoRa store-and-forward payload, UHF TT&C and deployable turnstile antenna.', 1650000, 'each', 12, 1),
  ('AO-NODE-8',        'IoT edge device, pack of 8', 'edge_device',
   'SX1262 sensor nodes with temperature, humidity and soil moisture, per-node keys.', 384000, 'pack', 8, 2),
  ('AO-GS-STARTER',    'Ground station starter kit', 'ground_station',
   'Cross-Yagi, mast-mount LNA, rotator interface, RTL-SDR v4, cabling.', 295000, 'each', 6, 3),
  ('AO-TRAIN-2D',      'Instructor training, 2 days', 'training',
   'On-site or remote. Covers assembly, ground segment, curriculum delivery and assessment.', 480000, 'engagement', 4, 4),
  ('AO-TRAIN-TTT',     'Train-the-trainer, 10 days', 'training',
   'Accredits your staff to deliver and assess the full track independently.', 2100000, 'engagement', 8, 5),
  ('AO-CURRIC-3Y',     'Curriculum licence, 3 years', 'curriculum',
   'Three assessed courses, LMS cohort seats, certificate issuance.', 420000, 'licence', 0, 6),
  ('AO-SUPPORT-24',    'Support and calibration, 24 months', 'support',
   'Firmware updates, annual calibration, spares pool access, engineer support.', 360000, 'contract', 0, 7)
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------------
-- Quotations
-- ---------------------------------------------------------------------------
create table if not exists public.quotations (
  id            uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  reference     text not null unique,
  version       int not null default 1,
  currency      text not null default 'USD',
  subtotal_cents int not null default 0,
  discount_cents int not null default 0,
  shipping_cents int not null default 0,
  tax_cents     int not null default 0,
  total_cents   int not null default 0,
  incoterms     text,
  lead_time_weeks int,
  valid_until   date,
  terms_md      text not null default '',
  issued_by     uuid references public.profiles(id) on delete set null,
  issued_at     timestamptz,
  accepted_at   timestamptz,
  declined_at   timestamptz,
  decline_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.quotation_lines (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations(id) on delete cascade,
  product_id    uuid references public.hardware_products(id) on delete set null,
  description   text not null,
  quantity      int not null default 1 check (quantity > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  line_total_cents int not null check (line_total_cents >= 0),
  sort_order    int not null default 0
);

-- ---------------------------------------------------------------------------
-- Orders — the bridge from a signed quotation to provisioned LMS seats
-- ---------------------------------------------------------------------------
create table if not exists public.hardware_orders (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid references public.quotations(id) on delete set null,
  reference     text not null unique,
  institution   text not null,
  country       text not null,
  contact_email citext not null,
  status        hw_order_status not null default 'draft',
  po_number     text,
  po_received_at timestamptz,
  stripe_invoice_id text,
  amount_cents  int not null default 0,
  currency      text not null default 'USD',
  paid_at       timestamptz,
  -- Provisioning: how many LMS seats this order entitles, and whether they
  -- have been created. Kept here so the commercial record is the single
  -- source of truth for entitlement.
  lms_seats     int not null default 0,
  lms_cohort_id uuid references public.cohorts(id) on delete set null,
  provisioned_at timestamptz,
  shipped_at    timestamptz,
  tracking_ref  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Live demo session bookings (tier 2)
-- ---------------------------------------------------------------------------
create table if not exists public.demo_bookings (
  id            uuid primary key default gen_random_uuid(),
  quote_request_id uuid references public.quote_requests(id) on delete set null,
  contact_email citext not null,
  institution   text not null,
  requested_for timestamptz not null,
  timezone      text not null default 'Africa/Nairobi',
  attendees     int not null default 1 check (attendees > 0),
  topics        text[] not null default '{}',
  status        text not null default 'requested'
    check (status in ('requested', 'confirmed', 'delivered', 'cancelled', 'no_show')),
  engineer_id   uuid references public.profiles(id) on delete set null,
  meeting_url   text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reference generator
-- ---------------------------------------------------------------------------
create or replace function app.next_reference(p_prefix text)
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  suffix text := '';
  i int;
begin
  for i in 1..6 loop
    suffix := suffix || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return p_prefix || '-' || to_char(now(), 'YYYY') || '-' || suffix;
end;
$$;

-- ---------------------------------------------------------------------------
-- Qualification scoring — mirrored in the UI so it can be explained
-- ---------------------------------------------------------------------------
create or replace function app.score_quote_request(p_request public.quote_requests)
returns jsonb
language plpgsql
immutable
as $$
declare
  s int := 0;
  parts jsonb := '{}'::jsonb;
  v int;
begin
  v := case when p_request.domain_class = 'institutional' then 25 else 0 end;
  s := s + v; parts := parts || jsonb_build_object('domain', v);

  v := case p_request.institution_type
         when 'Space agency' then 20
         when 'University' then 18
         when 'Government ministry' then 18
         when 'Technical institute / polytechnic' then 16
         when 'Research institute' then 14
         when 'Private training provider' then 8
         when 'Secondary school' then 6
         else 5 end;
  s := s + v; parts := parts || jsonb_build_object('institution_type', v);

  v := case p_request.funding_status
         when 'Budget approved' then 25
         when 'Budget requested, decision pending' then 18
         when 'Building a case, need a quotation' then 12
         when 'Exploring only' then 4
         else 0 end;
  s := s + v; parts := parts || jsonb_build_object('funding', v);

  v := case p_request.quantity_band
         when 'Over 20' then 22
         when '6 – 20' then 18
         when '3 – 5' then 12
         when '1 – 2' then 6
         else 5 end;
  s := s + v; parts := parts || jsonb_build_object('quantity', v);

  v := case p_request.timeline
         when 'This quarter' then 10
         when 'Next academic term' then 8
         when 'Next academic year' then 5
         else 2 end;
  s := s + v; parts := parts || jsonb_build_object('timeline', v);

  v := case p_request.contact_role
         when 'Head of department' then 8
         when 'Agency or ministry official' then 8
         when 'Procurement officer' then 6
         when 'Academic staff / lecturer' then 6
         when 'Laboratory manager' then 5
         when 'Researcher' then 4
         when 'Student' then 0
         else 3 end;
  s := s + v; parts := parts || jsonb_build_object('authority', v);

  s := least(100, s);
  return jsonb_build_object('total', s, 'parts', parts);
end;
$$;

/**
 * Submit a quote request.
 *
 * SECURITY DEFINER and callable by `anon`, because the marketing site has no
 * authenticated session. Everything that could be abused is constrained:
 * rate limiting is applied by the caller, the score and status are computed
 * here rather than accepted from the client, and no row in this table is ever
 * readable by anon.
 */
create or replace function app.submit_quote_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.quote_requests%rowtype;
  v_domain text;
  v_class text;
  v_score jsonb;
  v_sla interval;
begin
  v_domain := lower(split_part(coalesce(p_payload ->> 'contact_email', ''), '@', 2));
  if v_domain = '' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  v_class := app.classify_email_domain(v_domain);

  insert into public.quote_requests (
    reference, institution, institution_type, country,
    contact_name, contact_email, contact_role, phone,
    use_case, cohort_size, quantity_band, interests,
    funding_status, timeline, procurement_route, funding_source,
    domain_class, ip_hash, user_agent
  ) values (
    app.next_reference('RFQ'),
    nullif(trim(p_payload ->> 'institution'), ''),
    coalesce(p_payload ->> 'institution_type', 'Unknown'),
    coalesce(nullif(trim(p_payload ->> 'country'), ''), 'Unknown'),
    coalesce(nullif(trim(p_payload ->> 'contact_name'), ''), 'Unknown'),
    lower(p_payload ->> 'contact_email'),
    coalesce(p_payload ->> 'contact_role', 'Unknown'),
    nullif(trim(p_payload ->> 'phone'), ''),
    coalesce(p_payload ->> 'use_case', ''),
    p_payload ->> 'cohort_size',
    p_payload ->> 'quantity_band',
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(
        coalesce(p_payload -> 'interests', '[]'::jsonb)) as t(value)),
      '{}'::text[]),
    p_payload ->> 'funding_status',
    p_payload ->> 'timeline',
    p_payload ->> 'procurement_route',
    p_payload ->> 'funding_source',
    v_class,
    p_payload ->> 'ip_hash',
    left(coalesce(p_payload ->> 'user_agent', ''), 300)
  )
  returning * into r;

  v_score := app.score_quote_request(r);
  v_sla := case
    when (v_score ->> 'total')::int >= 70 then interval '1 day'
    when (v_score ->> 'total')::int >= 45 then interval '2 days'
    else interval '3 days' end;

  update public.quote_requests
     set score = (v_score ->> 'total')::int,
         score_breakdown = v_score -> 'parts',
         sla_due_at = now() + v_sla
   where id = r.id
  returning * into r;

  return jsonb_build_object(
    'reference', r.reference,
    'domain_class', v_class,
    -- The score is NOT returned to the caller. It routes work internally and
    -- telling a prospect they scored 31/100 helps nobody.
    'auto_tier', case when v_class = 'institutional' then 'verified' else 'open' end,
    'sla_due_at', r.sla_due_at
  );
end;
$$;

grant execute on function app.submit_quote_request(jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists quote_requests_touch on public.quote_requests;
create trigger quote_requests_touch before update on public.quote_requests
  for each row execute function app.touch_updated_at();

drop trigger if exists quotations_touch on public.quotations;
create trigger quotations_touch before update on public.quotations
  for each row execute function app.touch_updated_at();

drop trigger if exists hardware_orders_touch on public.hardware_orders;
create trigger hardware_orders_touch before update on public.hardware_orders
  for each row execute function app.touch_updated_at();

-- Keep quotation totals honest: recompute from the lines, never trust an
-- operator's arithmetic in a text field.
create or replace function app.recalc_quotation_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_quote uuid; v_subtotal int;
begin
  v_quote := coalesce(new.quotation_id, old.quotation_id);
  select coalesce(sum(line_total_cents), 0) into v_subtotal
    from public.quotation_lines where quotation_id = v_quote;
  update public.quotations
     set subtotal_cents = v_subtotal,
         total_cents = v_subtotal - discount_cents + shipping_cents + tax_cents
   where id = v_quote;
  return null;
end;
$$;

drop trigger if exists quotation_lines_total on public.quotation_lines;
create trigger quotation_lines_total
  after insert or update or delete on public.quotation_lines
  for each row execute function app.recalc_quotation_total();

-- The line trigger alone is not enough: editing shipping, discount or tax on
-- the quotation itself would otherwise leave `total_cents` stale, and a stale
-- total on a document a customer signs is the worst kind of bug. Derive it
-- unconditionally on every write.
create or replace function app.derive_quotation_total()
returns trigger
language plpgsql
as $$
begin
  new.total_cents :=
    new.subtotal_cents - new.discount_cents + new.shipping_cents + new.tax_cents;
  return new;
end;
$$;

drop trigger if exists quotations_derive_total on public.quotations;
create trigger quotations_derive_total before insert or update on public.quotations
  for each row execute function app.derive_quotation_total();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'email_domains','demo_access','demo_verifications','quote_requests',
    'hardware_products','quotations','quotation_lines','hardware_orders',
    'demo_bookings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using (app.is_admin()) with check (app.is_admin())
    $f$, t || '_admin_all', t);
  end loop;
end $$;

-- Instructors may read the commercial pipeline but not change it — they need
-- to know a cohort is coming, they do not need to be able to discount it.
drop policy if exists quote_requests_staff_read on public.quote_requests;
create policy quote_requests_staff_read on public.quote_requests
  for select to authenticated using (app.is_staff());

drop policy if exists hardware_orders_staff_read on public.hardware_orders;
create policy hardware_orders_staff_read on public.hardware_orders
  for select to authenticated using (app.is_staff());

-- A learner may see a demo grant that belongs to them, and nothing else.
drop policy if exists demo_access_self_read on public.demo_access;
create policy demo_access_self_read on public.demo_access
  for select to authenticated using (user_id = auth.uid());

-- Everything else here is service-role or admin only. In particular:
--   * `anon` has no policy on any of these tables. The marketing site reaches
--     them exclusively through SECURITY DEFINER functions and the service-role
--     client behind rate-limited route handlers.
--   * `hardware_products.list_price_cents` is never exposed publicly, which is
--     the whole point of a gated quote model.
revoke all on public.hardware_products from anon;
revoke all on public.quote_requests from anon;
revoke all on public.quotations, public.quotation_lines from anon;
revoke all on public.hardware_orders from anon;
revoke all on public.demo_access, public.demo_verifications from anon;
revoke update, delete on public.demo_verifications from authenticated;

-- ---------------------------------------------------------------------------
-- Pipeline view for the admin console
-- ---------------------------------------------------------------------------
create or replace view public.quote_pipeline
with (security_invoker = true) as
  select
    q.id,
    q.reference,
    q.institution,
    q.country,
    q.institution_type,
    q.contact_name,
    q.contact_email,
    q.domain_class,
    q.score,
    q.status,
    q.screening,
    q.quantity_band,
    q.funding_status,
    q.timeline,
    q.sla_due_at,
    (q.sla_due_at < now() and q.status in ('submitted', 'screening')) as sla_breached,
    q.assigned_to,
    p.full_name as assigned_to_name,
    (select count(*) from public.quotations qq where qq.quote_request_id = q.id) as quotation_count,
    q.created_at
  from public.quote_requests q
  left join public.profiles p on p.id = q.assigned_to;


-- =============================================================================
-- =============================================================================
--
--   PART 10 OF 12   0010_vertical_catalogue.sql   (10,193 bytes)
--
-- =============================================================================
-- =============================================================================

-- ===========================================================================
-- 0010_vertical_catalogue.sql
-- ---------------------------------------------------------------------------
-- Two corrections and one extension.
--
-- CORRECTION 1 — EduSat list price.
--   Migration 0009 seeded AO-EDUSAT-1U at USD 16,500. The published price on
--   afriorbit.space is USD 1,000. A catalogue that disagrees with the website
--   by a factor of sixteen will produce a quotation that destroys a deal, so
--   this is corrected rather than left for someone to notice.
--
-- CORRECTION 2 — quote-only products.
--   0009 assumed every product has a list price. Robotics platforms and
--   spaceport engagements are scoped per client and genuinely have no list
--   price. Encoding that as `list_price_cents = 0` would be a lie that reads
--   as "free" in every report, so it gets its own column and a constraint
--   that keeps the two states honest.
--
-- EXTENSION — the other three verticals.
--   The site sells four product lines. The catalogue held one.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
-- The original CHECK is replaced rather than added to; Postgres has no
-- "extend a check constraint" and silently keeping both would reject every
-- new row.
alter table public.hardware_products
  drop constraint if exists hardware_products_category_check;

alter table public.hardware_products
  add constraint hardware_products_category_check
  check (category in (
    'spacecraft',
    'edge_device',
    'ground_station',
    'rocketry',
    'robotics',
    'launch_services',
    'training',
    'curriculum',
    'support',
    'spares'
  ));

-- ---------------------------------------------------------------------------
-- Quote-only products
-- ---------------------------------------------------------------------------
alter table public.hardware_products
  add column if not exists is_quote_only boolean not null default false;

alter table public.hardware_products
  add column if not exists vertical text
  check (vertical is null or vertical in ('rocketry', 'robotics', 'edusat', 'spaceport', 'shared'));

comment on column public.hardware_products.is_quote_only is
  'True when the product is scoped per engagement and has no list price. '
  'Distinguishes "priced at zero" from "not priced", which a nullable price '
  'alone cannot express without making every arithmetic expression nullable.';

comment on column public.hardware_products.vertical is
  'Which product line the item belongs to, so a quote request arriving from '
  'the rocketry page can be scoped to rocketry items without string matching '
  'on the SKU.';

-- A quote-only product must not carry a list price, and a priced product must
-- carry one. Without this the two representations drift within a quarter.
alter table public.hardware_products
  drop constraint if exists hardware_products_pricing_consistent;

alter table public.hardware_products
  add constraint hardware_products_pricing_consistent
  check (
    (is_quote_only and list_price_cents = 0)
    or (not is_quote_only and list_price_cents > 0)
  );

-- ---------------------------------------------------------------------------
-- Correct the EduSat price to the published figure
-- ---------------------------------------------------------------------------
update public.hardware_products
   set list_price_cents = 100000,   -- USD 1,000, as published on afriorbit.space
       vertical = 'edusat',
       description =
         'Flight-representative 1U trainer with a satellite-to-IoT store-and-forward '
         || 'payload. Opens for inspection; every subsystem is reachable on the bench.'
 where sku = 'AO-EDUSAT-1U';

-- Existing 0009 rows belong to the EduSat line or are shared across all of it.
update public.hardware_products set vertical = 'edusat'
 where sku in ('AO-NODE-8', 'AO-GS-STARTER') and vertical is null;

update public.hardware_products set vertical = 'shared'
 where sku in ('AO-TRAIN-2D', 'AO-TRAIN-TTT', 'AO-CURRIC-3Y', 'AO-SUPPORT-24')
   and vertical is null;

-- ---------------------------------------------------------------------------
-- Rocketry — step 01
-- ---------------------------------------------------------------------------
insert into public.hardware_products
  (sku, name, category, vertical, description, list_price_cents, is_quote_only, unit, lead_time_weeks, sort_order)
values
  ('AO-RKT-CLASS',   'Rocketry classroom set', 'rocketry', 'rocketry',
   'Thirty model airframes, motors for two flight days, launch controller and pad. '
   || 'The entry point for a secondary school with no prior programme.',
   200000, false, 'set', 6, 11),

  ('AO-RKT-MIDPOWER','Mid-power club kit', 'rocketry', 'rocketry',
   'Composite airframes, altimeter bay and barometric logger, recovery hardware. '
   || 'The step where students measure the flight instead of estimating it.',
   540000, false, 'kit', 8, 12),

  ('AO-RKT-L1',      'Level 1 certification pack', 'rocketry', 'rocketry',
   'Two 76 mm airframes, H-class motor allocation and the range-safety '
   || 'documentation an instructor needs to certify.',
   890000, false, 'pack', 10, 13),

  ('AO-RKT-RANGE',   'Range safety training, 1 day', 'training', 'rocketry',
   'Site survey, waiver process, launch procedures and abort criteria. '
   || 'Required before an institution runs its own flight days.',
   180000, false, 'engagement', 4, 14)
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------------
-- Robotics — step 02
-- ---------------------------------------------------------------------------
insert into public.hardware_products
  (sku, name, category, vertical, description, list_price_cents, is_quote_only, unit, lead_time_weeks, sort_order)
values
  ('AO-ROV-PLATFORM','Differential-drive rover platform', 'robotics', 'robotics',
   'Encoder feedback, Linux SBC with a real-time control loop, instrumented '
   || 'battery, IMU and ranging. Configured per cohort size, so quoted.',
   0, true, 'each', 12, 21),

  ('AO-ROV-ARM',     'Manipulator arm module', 'robotics', 'robotics',
   'Serial arm with joint-level current sensing, mounts to the rover platform '
   || 'or a bench fixture.',
   0, true, 'each', 12, 22),

  ('AO-ADCS-BENCH',  'Attitude control bench', 'robotics', 'robotics',
   'Air-bearing table and reaction wheel assembly. Turns the reaction-wheel '
   || 'saturation demonstration into hardware a student can stall by hand.',
   0, true, 'each', 16, 23)
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------------
-- Spaceport — step 04
-- ---------------------------------------------------------------------------
insert into public.hardware_products
  (sku, name, category, vertical, description, list_price_cents, is_quote_only, unit, lead_time_weeks, sort_order)
values
  ('AO-SP-ASSESS',   'Launch site feasibility assessment', 'launch_services', 'spaceport',
   'Azimuth and inclination analysis, range safety corridors, overflight and '
   || 'population constraints, delivered as a reviewable technical report.',
   0, true, 'engagement', null, 31),

  ('AO-SP-PROGRAMME','National capability programme', 'launch_services', 'spaceport',
   'Multi-year engagement combining site analysis, curriculum, hardware and '
   || 'staff accreditation. Scoped with the ministry or agency.',
   0, true, 'programme', null, 32)
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------------
-- CONFIRM BEFORE QUOTING
-- ---------------------------------------------------------------------------
-- Exactly two figures in this catalogue come from a published AfriOrbit
-- source: EduSat at USD 1,000 and the rocketry entry point at USD 2,000.
-- Every other list price is a placeholder chosen to be plausible for the
-- category, and several were originally scaled against the incorrect USD
-- 16,500 EduSat price this migration corrects — which means the accessory
-- prices are now out of proportion with the flagship and almost certainly
-- wrong.
--
-- They are left visible rather than quietly adjusted, because a made-up
-- number that looks deliberate is more dangerous than one that is labelled.
-- Replace them before the first quotation goes out:
--
--   AO-NODE-8, AO-GS-STARTER, AO-TRAIN-2D, AO-TRAIN-TTT, AO-CURRIC-3Y,
--   AO-SUPPORT-24, AO-RKT-MIDPOWER, AO-RKT-L1, AO-RKT-RANGE
--
-- The two confirmed figures and all quote-only items need no action.
comment on table public.hardware_products is
  'Product catalogue. Only AO-EDUSAT-1U (USD 1,000) and AO-RKT-CLASS '
  '(USD 2,000) carry prices confirmed against published AfriOrbit material; '
  'see migration 0010 for the list of placeholders to replace.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- 0009 revoked anon access to this table because list prices are commercially
-- sensitive. The new columns inherit that; restating it makes the intent
-- survive anyone reading this migration alone.
revoke all on public.hardware_products from anon;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
-- Fails the migration rather than leaving a half-seeded catalogue behind.
do $$
declare
  n_verticals int;
  edusat_price int;
begin
  select count(distinct vertical) into n_verticals
    from public.hardware_products where vertical is not null;
  if n_verticals < 5 then
    raise exception 'expected 5 verticals seeded, found %', n_verticals;
  end if;

  select list_price_cents into edusat_price
    from public.hardware_products where sku = 'AO-EDUSAT-1U';
  if edusat_price is distinct from 100000 then
    raise exception 'EduSat list price is % cents, expected 100000', edusat_price;
  end if;
end $$;


-- =============================================================================
-- =============================================================================
--
--   PART 11 OF 12   0011_real_curriculum.sql   (77,146 bytes)
--
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- AfriOrbit LMS — 0011 Real Curriculum
--
-- GENERATED FILE. Edit scripts/build-curriculum.py and re-run:
--     python3 scripts/build-curriculum.py
--
-- This replaces the placeholder curriculum from 0007 with AfriOrbit's actual
-- training material:
--
--   * Introduction to CubeSat Development — the KSA Training 2022 programme
--     (Introduction to Space Systems, Student CubeSat Development, EPS,
--     OBC & Data Handling, and the subsystem decks)
--   * SDR-IOT-project — the ESP32-S3 / SX1278 IoT edge device, its firmware
--     and its fabrication BOM
--   * Morgan-State-Rocketry-Program — the twelve-sketch avionics progression
--     and the MSU-avionics flight computer
--
-- Every lesson names its source. Where a figure or equation was an image in
-- the source deck and could not be recovered, the lesson says so rather than
-- substituting an invented one — a curriculum that quietly fabricates a
-- number is worse than one with a visible gap.
--
-- Safe to re-run: every insert is keyed on slug with ON CONFLICT DO UPDATE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Seed helpers
-- ---------------------------------------------------------------------------

create or replace function app.seed_track(
  p_slug text, p_title text, p_summary text, p_description text,
  p_level course_level, p_order int
) returns uuid language plpgsql as $fn$
declare v_id uuid;
begin
  insert into public.tracks (slug, title, summary, description, level, sort_order, is_published)
  values (p_slug, p_title, p_summary, p_description, p_level, p_order, true)
  on conflict (slug) do update
    set title = excluded.title, summary = excluded.summary,
        description = excluded.description, level = excluded.level,
        sort_order = excluded.sort_order, is_published = true,
        updated_at = now()
  returning id into v_id;
  return v_id;
end $fn$;

create or replace function app.seed_course(
  p_track uuid, p_slug text, p_title text, p_subtitle text, p_summary text,
  p_description text, p_level course_level, p_minutes int, p_order int,
  p_tags text[], p_prereqs text[], p_outcomes text[],
  p_hardware boolean, p_hardware_notes text
) returns uuid language plpgsql as $fn$
declare v_id uuid;
begin
  insert into public.courses
    (track_id, slug, title, subtitle, summary, description, level, status,
     tags, prerequisites, outcomes, estimated_minutes, requires_hardware,
     hardware_notes, sort_order, issues_certificate, published_at)
  values
    (p_track, p_slug, p_title, p_subtitle, p_summary, p_description, p_level,
     'published', p_tags, p_prereqs, p_outcomes, p_minutes, p_hardware,
     p_hardware_notes, p_order, true, now())
  on conflict (slug) do update
    set track_id = excluded.track_id, title = excluded.title,
        subtitle = excluded.subtitle, summary = excluded.summary,
        description = excluded.description, level = excluded.level,
        status = 'published', tags = excluded.tags,
        prerequisites = excluded.prerequisites, outcomes = excluded.outcomes,
        estimated_minutes = excluded.estimated_minutes,
        requires_hardware = excluded.requires_hardware,
        hardware_notes = excluded.hardware_notes,
        sort_order = excluded.sort_order, updated_at = now()
  returning id into v_id;
  return v_id;
end $fn$;

create or replace function app.seed_module(
  p_course uuid, p_slug text, p_title text, p_summary text, p_order int
) returns uuid language plpgsql as $fn$
declare v_id uuid;
begin
  insert into public.modules (course_id, slug, title, summary, sort_order)
  values (p_course, p_slug, p_title, p_summary, p_order)
  on conflict (course_id, slug) do update
    set title = excluded.title, summary = excluded.summary,
        sort_order = excluded.sort_order, updated_at = now()
  returning id into v_id;
  return v_id;
end $fn$;

create or replace function app.seed_quiz(
  p_course uuid, p_slug text, p_title text, p_instructions text
) returns uuid language plpgsql as $fn$
declare v_id uuid;
begin
  insert into public.quizzes
    (course_id, slug, title, instructions, is_graded, pass_threshold, max_attempts)
  values (p_course, p_slug, p_title, p_instructions, true, 70, 3)
  on conflict (course_id, slug) do update
    set title = excluded.title, instructions = excluded.instructions,
        updated_at = now()
  returning id into v_id;
  return v_id;
end $fn$;

create or replace function app.seed_question(
  p_quiz uuid, p_kind question_kind, p_prompt text, p_options jsonb,
  p_key jsonb, p_explanation text, p_points numeric, p_order int
) returns void language plpgsql as $fn$
begin
  delete from public.quiz_questions where quiz_id = p_quiz and sort_order = p_order;
  insert into public.quiz_questions
    (quiz_id, kind, prompt_md, options, answer_key, explanation_md, points, sort_order)
  values (p_quiz, p_kind, p_prompt, p_options, p_key, p_explanation, p_points, p_order);
end $fn$;

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

do $seed$
declare
  v_track uuid;
  v_course uuid;
  v_module uuid;
  v_quiz uuid;
begin

  -- ═══ TRACK: CubeSat Development ═══
  v_track := app.seed_track('cubesat-development', 'CubeSat Development', 'The full subsystem-by-subsystem programme: space systems, structures, thermal, power, on-board computing, communications, attitude control, payload and ground segment.',
    $md$AfriOrbit's flagship engineering track, built directly from the
*Introduction to CubeSat Development* training programme delivered
with the Kenya Space Agency.

It follows the way a CubeSat is actually built: mission and systems
engineering first, then each subsystem in the order the design
depends on it, then the ground segment that makes the spacecraft
useful. Every module ends with the arithmetic an engineer is
expected to be able to do unaided.$md$, 'intermediate', 1);

  -- ── Course: Introduction to Space Systems
  v_course := app.seed_course(v_track, 'introduction-to-space-systems', 'Introduction to Space Systems',
    'What a satellite is, how the CubeSat standard happened, and the systems engineering that holds a mission together', 'The foundation course. Satellite classification, the history that produced the CubeSat, Kenya''s place in it, and a working command of the systems engineering lifecycle.', $md$The foundation course. Satellite classification, the history that produced the CubeSat, Kenya's place in it, and a working command of the systems engineering lifecycle.

---

**Source material.** Introduction to Space Systems_1.pdf (69 slides) and Student CubeSat Development.pdf (13 slides), KSA Training 2022, presented by Obed M — Sayarilabs.$md$,
    'foundation', 180, 1,
    '{"systems-engineering","cubesat","history","lifecycle"}', '{}', '{"Classify a spacecraft by mass and name the CubeSat form factors","Explain why the CubeSat standard exists and who created it","Place any design activity in the correct NASA/ECSS mission phase","Distinguish verification from validation and say which review gates each"}',
    false, null);

  v_module := app.seed_module(v_course, 'what-is-a-satellite', 'What is a satellite?',
    'Definitions, the mass classification ladder, and the vocabulary the rest of the programme assumes.', 1);
  perform app.seed_lesson(v_module, 'definition-and-classes', 'Definition and mass classes',
    'reading', 20, 1, $md$## Where the word comes from

*Satellite* derives from the Latin **satellit** — an attendant, one who
is constantly hovering around and attending to a master. The technical
definition is deliberately plain:

> A satellite is simply a body that moves around another (usually much
> larger) body in a mathematically predictable path called an orbit.

## Classification by mass

This ladder is worth memorising, because almost every trade study you
will do refers to it:

| Class | Mass |
|---|---|
| Large satellites | More than 1,000 kg |
| Medium-sized satellites | 500–1,000 kg |
| **Small satellites** | **< 500 kg** |
| — Minisatellite | 100–500 kg |
| — Microsatellite | 10–100 kg |
| — **Nanosatellite** | **1–10 kg** |
| — Picosatellite | Less than 1 kg |
| — Femtosatellite | 10 g – 100 g |
| — Attosatellite | 1 g – 10 g |
| — Zeptosatellite | 0.1 g – 1 g |

A 1U CubeSat sits in the **nanosatellite** band. A 3U sits there too.
This matters for launch brokerage, for regulatory treatment, and for
which parts of the literature apply to you.

---

*Source: Introduction to Space Systems, KSA Training 2022.*$md$,
    true, null);
  perform app.seed_lesson(v_module, 'history-and-the-cubesat-standard', 'History, and how the CubeSat standard happened',
    'reading', 25, 2, $md$## The first satellites

**Sputnik 1** — launched 4 October 1957 by the Council of Ministers of
the USSR, principal contractor OKB 1. Mass **83 kg**, orbit
**215 × 939 km**, mission: atmospheric studies for three months. It
completed **1,440 orbits** and decayed on 4 January 1958.

**Vanguard 1** (United States, 1958) carried two continuous-wave
transmitters and monitored internal temperatures and total integrated
electron density. It is also the first solar-powered spacecraft:
**6 panels producing 1 W at 10% efficiency**.

Small satellites, in other words, *started* the space programme. The
large-satellite era came afterwards.

## Three eras

- **Early Space Era** — small spacecraft, rapid iteration.
- **Large Space Era** (roughly 1968 to the mid-1990s) — capability
  through mass and budget.
- **New Space Era** (1997 onwards) — the return of the small
  spacecraft, this time with commercial economics.

## Where CubeSats come from

The lineage runs through Stanford's **OPAL** picosatellite launcher to
**Prof. Bob Twiggs** (Stanford) and **Prof. Jordi Puig-Suari** (Cal
Poly), who defined the CubeSat standard so that student projects could
share a deployer and a ride.

The insight was not the cube. It was **standardising the interface** so
that the launch problem stopped being negotiated per mission.

## Kenya

Kenya's space history is older than most people expect. The **San Marco
/ Broglio Space Centre off Malindi** conducted orbital launches from a
sea platform from 1967 — the closest any orbital launch site has been
to the equator. That lineage runs forward to the **Kenya Space Agency**
and to **1KUNS-PF**, Kenya's first CubeSat.

## Beyond the CubeSat

The form-factor landscape now also includes **PocketQubes**, **TubeSats**
and **SunCubes** — smaller standards chasing the same idea.

---

*Source: Introduction to Space Systems, KSA Training 2022.*$md$,
    false, null);

  v_module := app.seed_module(v_course, 'systems-engineering', 'Systems engineering for a real mission',
    'The V-model, the lifecycle phases, requirements, and the review gates — as applied to a student CubeSat rather than a flagship.', 2);
  perform app.seed_lesson(v_module, 'lifecycle-and-reviews', 'The lifecycle and its review gates',
    'reading', 25, 1, $md$## Why phases exist

A mission phase is a commitment checkpoint. You are not allowed to
spend the next phase's money until a review says the previous phase is
genuinely finished. The two standards you will meet:

**ECSS-M-ST-10C** (European, used widely in CubeSat work):

| Phase | Activity | Gate |
|---|---|---|
| 0 | Mission analysis / needs identification | MCR |
| A | Feasibility | SDR |
| B | Preliminary definition | **PDR** |
| C | Detailed definition | **CDR** |
| D | Qualification and production | FRR |
| E | Utilization | — |
| F | Disposal | — |

**NASA** uses Pre-Phase A through Phase E/F with KDPs (key decision
points) and the review set SRR, **SDR/MDR**, **PDR**, **CDR**, **SIR**.

## Verification is not validation

- **Verification** — did we build the thing right? Against requirements.
- **Validation** — did we build the right thing? Against the mission need.

A CubeSat can pass every verification test and still fail validation,
which is how you end up with a spacecraft that works perfectly and
produces data nobody wanted.

---

*Source: Introduction to Space Systems, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'interfaces', 'Interface management, and Shea''s Law',
    'reading', 20, 2, $md$## The law

> **Shea's Law:** The ability to improve a design occurs primarily at
> the interfaces. This is also the prime location for screwing it up.

## Why interfaces dominate failures

Much effort is spent designing individual parts of a system —
functionality, tolerances, mean-time-between-failure. Interfaces are
often neglected and become the weak points: bottlenecks, structural
failures, erroneous function calls.

The deck's argument, condensed:

- Complex systems have many interfaces.
- Common interfaces reduce complexity.
- System architecture drives which interface types get used.
- Clear interface identification and definition reduces risk.
- **Most of the problems in systems are at the interfaces.**
- Verification of all interfaces is critical for compatibility.

## The documents

- **IRD** — Interface Requirements Document. Defines functional,
  performance, electrical, environmental, human and physical
  requirements at a boundary between two or more elements. Covers both
  logical and physical interfaces.
- **ICD** — Interface Control Document (NASA approach).
- **DSM** — Design Structure Matrix, for seeing the interface topology
  of the whole system at once.

## Team structure

The KSA programme organises a student CubeSat team as: leadership and
coordination, faculty mentors, then a **Project Management / Systems
Engineering / Team Lead** role over subsystem leads for **OBC & FSW,
COMMS, ADCS & Mission, EPS, Payload, Structures and Thermal**.

Note that interface management is the systems engineer's job precisely
because no subsystem lead owns the boundary.

---

*Source: Student CubeSat Development, KSA Training 2022.*$md$,
    false, null);

  v_quiz := app.seed_quiz(v_course, 'space-systems-check', 'Space systems fundamentals', 'Ten minutes. Every figure is drawn from the course material.');
  perform app.seed_question(v_quiz, 'single_choice', $md$A 4 kg 3U CubeSat falls into which mass class?$md$,
    '[{"id": "a", "text": "Microsatellite"}, {"id": "b", "text": "Nanosatellite"}, {"id": "c", "text": "Picosatellite"}, {"id": "d", "text": "Minisatellite"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Nanosatellites are 1–10 kg. Microsatellites are 10–100 kg; picosatellites are under 1 kg.$md$, 1, 1);
  perform app.seed_question(v_quiz, 'numeric', $md$Sputnik 1's mass, in kilograms.$md$,
    '[]'::jsonb, '{"value": 83, "tolerance": 0.5, "unit": "kg"}'::jsonb,
    $md$83 kg, in a 215 × 939 km orbit, launched 4 October 1957.$md$, 2, 2);
  perform app.seed_question(v_quiz, 'single_choice', $md$Vanguard 1's solar array produced 1 W. At what cell efficiency?$md$,
    '[{"id": "a", "text": "4%"}, {"id": "b", "text": "10%"}, {"id": "c", "text": "18%"}, {"id": "d", "text": "29%"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Six panels producing 1 W at 10% efficiency. Compare with the 29.1% single-crystalline GaAs record noted in the EPS course.$md$, 1, 3);
  perform app.seed_question(v_quiz, 'single_choice', $md$Which review gates the end of ECSS Phase B?$md$,
    '[{"id": "a", "text": "CDR"}, {"id": "b", "text": "PDR"}, {"id": "c", "text": "FRR"}, {"id": "d", "text": "MCR"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Phase B is preliminary definition and ends at PDR. CDR closes Phase C; FRR closes Phase D.$md$, 1, 4);
  perform app.seed_question(v_quiz, 'single_choice', $md$Verification asks which question?$md$,
    '[{"id": "a", "text": "Did we build the right thing?"}, {"id": "b", "text": "Did we build the thing right?"}, {"id": "c", "text": "Will the launch provider accept it?"}, {"id": "d", "text": "Is the mission affordable?"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Verification is against requirements. Validation asks whether the requirements were the right ones.$md$, 1, 5);

  -- ── Course: Electrical Power Subsystem
  v_course := app.seed_course(v_track, 'electrical-power-subsystem', 'Electrical Power Subsystem',
    'Generate, store, distribute and control — the subsystem that causes a quarter of all on-orbit failures', 'Three sessions: EPS fundamentals, the design process with real sizing arithmetic, and the hardware development flow from SPICE to a PC/104 board.', $md$Three sessions: EPS fundamentals, the design process with real sizing arithmetic, and the hardware development flow from SPICE to a PC/104 board.

---

**Source material.** EPS_COMPLETE_PDF.pdf (119 slides, three sessions), KSA Training 2022, presented by Obed M — Sayarilabs.$md$,
    'intermediate', 420, 2,
    '{"eps","power","solar","batteries","mppt","pcb"}', '{"introduction-to-space-systems"}', '{"Size a solar array and a battery from mission parameters","Build a power budget across operating modes and defend the margins","Choose between peak power tracking and direct energy transfer, with reasons","Explain the unloading function and why its absence is unrecoverable"}',
    false, null);

  v_module := app.seed_module(v_course, 'fundamentals', 'EPS fundamentals',
    'What the subsystem is for, what it is made of, and why it fails.', 1);
  perform app.seed_lesson(v_module, 'architecture', 'Architecture and the four blocks',
    'reading', 25, 1, $md$## Definition

> The Electrical Power Subsystem (EPS) provides, stores, distributes,
> and controls spacecraft electrical power.

Its seven top-level functions, as stated in the source:

1. Supply power over mission life
2. Control and distribute power
3. Support average and peak load
4. Provide convertors for AC and regulated DC power buses
5. Provide command and telemetry capability for EPS health and status
6. Protect payload against EPS failures
7. Suppress transient bus voltages and protect against bus faults

## The four blocks

```
Power Source → Energy Storage → Power Distribution → Power Regulation & Control
```

> In most cases the power distribution and power regulation and control
> unit are combined in the same hardware called the Power Control Unit
> (PCU) / PCDU.

## Why this subsystem gets special attention

The failure statistics are not subtle:

- **Over 25% of all spacecraft failures on orbit result from EPS failures.**
- Over a satellite's total life, insurance costs are nearly **33% of
  total project costs**, and about **50% of insurance claims relate to EPS**.
- A study of power-related failures 1990–2013 analysed **158 power-subsystem
  incidents**. **50%** comprised degradation or component failure.
  **51 incidents** were major — a power decrease of 50% or more of BOL,
  or loss of the satellite. Estimated total loss: **8.8 billion dollars**.

Three routes to improvement are offered: better design, additional
redundancies, improved testing procedures.

---

*Source: EPS Subsystem Design for CubeSats, Session 1 & 2, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'sources-and-cells', 'Power sources and solar cells',
    'reading', 25, 2, $md$## Choosing a source

Specific power and specific cost dominate the selection. The families,
with the efficiencies quoted in the source:

| Family | Efficiency |
|---|---|
| Thermoelectric (static) | 5–8% |
| Thermionic (static) | 10–20% |
| Rankine cycle (dynamic) | 15–20% |
| Brayton cycle (dynamic) | 20–35% |
| Stirling cycle (dynamic) | 25–30% |
| Fuel cells | 80% at low current, 50–60% at high current |

Fuel cells reach high specific power — **275 W/kg on the Space Shuttle** —
but for our class of mission:

> Often, PV sources are the only real candidates for low-power missions (<15 kW).

## Cell technology

- Crystalline silicon: 2013 record lab cell efficiency **25.6%**
- Single-crystalline GaAs: **29.1%** (2019), the highest single-junction
- Multijunction (c-Si, InGaP, GaAs, Ge, InGaAs): maximum theoretical **33.16%**;
  a European record of **39.7%** is noted
- Thin film: CdTe, CIGS, amorphous silicon (a-Si, TF-Si)

For scale: the **ISS has eight solar array wings, each 35 m × 12 m,
generating 120 kW average power each.**

---

*Source: EPS Subsystem Design for CubeSats, Session 1, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'batteries', 'Energy storage and lithium-ion',
    'reading', 25, 3, $md$## Selection characteristics

Grouped as **physical** (size, weight, configuration, operating position,
static and dynamic environments), **electrical** (voltage, current
loading, duty cycles, activation time, storage time, limits on depth of
discharge) and **programmatic** (cost, mission, reliability,
maintainability, producibility).

Energy density is quoted two ways: **gravimetric** in W·h/kg and
**volumetric** in W·h/l.

## Primary versus secondary

Primary cells — silver zinc, thermal cells, lithium sulphur dioxide —
are not rechargeable. Secondary cells are, for **thousands of cycles**.
A CubeSat uses secondary cells; the interesting question is which
chemistry.

## Three design rules worth internalising

> We desire a flat discharge curve that extends most of the capacity.

> Little overcharge quickly degrades most batteries.

> Charge imbalances degrade batteries.

The third is why cell balancing is a BMS requirement and not a nicety.

## Lithium-ion

G.N. Lewis worked on lithium in 1912. Rechargeable metallic-lithium
attempts in the 1980s failed because of *instabilities in the metallic
lithium used as anode material*. Sony commercialised the modern cell in
**1991**.

Chemistries: LiCoO₂ (LCO), LiMn₂O₄ (LMO), LiNiMnCoO₂ (NMC),
LiFePO₄ (LFP), LiNiCoAlO₂ (NCA), Li₂TiO₃ (LTO).

The workhorse cell format: the **18650** measures **18 mm diameter ×
65 mm length**, nominal **3.7 V**, and high-energy-density versions
now deliver **over 3000 mAh**.

Two limitations that shape spacecraft design:

> Requires protection circuit to prevent thermal runaway if stressed.

> No rapid charge possible at freezing temperatures (< 0 °C, < 32 °F).

The second is why battery heaters appear in the EPS block diagram.

---

*Source: EPS Subsystem Design for CubeSats, Session 1, KSA Training 2022.*$md$,
    false, null);

  v_module := app.seed_module(v_course, 'design', 'The design process',
    'Beta angle, eclipse fraction, power budgets, and the sizing procedures.', 2);
  perform app.seed_lesson(v_module, 'orbit-inputs', 'Orbit inputs: beta angle and eclipse fraction',
    'reading', 30, 1, $md$## Beta angle

**β** is the smaller angle between the Sun vector and the spacecraft's
orbit plane. It varies through the year with the right ascension of the
Sun (Γ) and with nodal regression (Ω):

$$\beta = \sin^{-1}\left(\cos\Gamma\sin\Omega\sin i + \sin\Gamma\cos\varepsilon\cos\Omega\sin i + \sin\Gamma\sin\varepsilon\cos i\right)$$

where Γ is the right ascension of the Sun and ε its declination.

## Eclipse fraction

$$F = \frac{1}{\pi}\cos^{-1}\frac{\sqrt{h^{2} + 2R_{e}h}}{(R_{e}+h)\cos\beta}$$

Three design points follow directly:

- **For LEO the maximum eclipse duration remains close to 35 minutes.**
- Orbits with **90° < i < 120°** have a lower average eclipse duration
  over the year than orbits at lower inclination.
- For a particular inclination, the range of β remains constant at any
  altitude.

That first number is the one you carry around: a LEO CubeSat has to
survive roughly **35 minutes in the dark, every orbit, forever**.

> **A note on the source.** The beta-angle and eclipse equations are
> images in the original deck and did not survive text extraction
> cleanly. The forms above are reconstructed from the variable
> definitions given in the text. Check them against the slides before
> using them in a design review.

---

*Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'power-budget', 'The power budget',
    'reading', 30, 2, $md$## The whole subsystem in one line

$$\text{Power Budget} = \text{OAP} - \text{Average Power Used}$$

**OAP** is orbit average power. Its inputs are cell efficiency η (and
*this efficiency at BOL ≠ at EOL*), effective cell area A_eff, the solar
constant C_s, and MPPT converter efficiency η_conv.

The solar constant is not a constant: **minimum 1321 W/m², mean
1358 W/m², maximum 1413 W/m²**.

## A rule of thumb, and a warning

> OAP = 60% × Power from one panel

> However, it is important to verify these results using other methods.

Use the rule to sanity-check, never to size.

## Consumption

Built from **duty cycle** (the ratio of on time to off time), the
satellite's **operating modes**, per-mode power requirements, and
**margins** — *the greater the uncertainty, the higher the margin*.

Four operating modes:

1. **Deployment** — UHF communication and EPS initialised
2. **Mission / Nominal**
3. **Safe** — payload off, batteries recharge
4. **Survival / Critical**

## The two rules that decide whether you have a spacecraft

> A CubeSat launched with a known negative power budget is 'space debris'.

> Make sure you can switch OFF non-essential subsystems and payloads.

A **positive** power budget means power generated over one orbit is
greater than or equal to power consumed over that orbit. Negative means
the reverse, and it is terminal unless the second rule was designed in.

---

*Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'power-budget-sim', 'Sandbox: size a power system',
    'simulation', 35, 3, $md$Work the arithmetic you have just read, against a real orbit.

Set an altitude and inclination and the simulator computes eclipse
fraction and duration from the geometry. Set your loads per mode and
their duty cycles and it builds the orbit average power. Then size the
array and the battery, and watch the depth of discharge move.

Three things to try:

1. **Find the negative budget.** Raise the payload duty cycle until the
   budget goes negative. Note how little it takes.
2. **Watch DoD drive battery mass.** Hold everything constant and change
   allowable depth of discharge from 20% to 40%. Cycle life falls as the
   battery gets smaller — the trade nobody mentions in a datasheet.
3. **Check the 35-minute claim.** Sweep altitude across LEO and see
   whether maximum eclipse really does stay near 35 minutes.$md$,
    false, 'power-budget');
  perform app.seed_lesson(v_module, 'array-and-battery-sizing', 'Sizing the array and the battery',
    'reading', 30, 4, $md$## Seven steps for the solar array

1. Determine requirements and constraints
2. Calculate power that must be produced by the solar array
3. Select type of solar cell and estimate power output
4. Determine BOL power production capability per unit area
5. Determine EOL power production
6. Estimate solar array area required
7. Estimate mass of the solar array

Step 2's variables: **P_e, P_d** — spacecraft power requirement during
eclipse and daylight; **T_e, T_d** — the lengths of those periods per
orbit; **X_e, X_d** — the efficiency of the path from array through
battery to load, and from array direct to load.

## Degradation, in two kinds

**Inherent degradation (I_d)** — design inefficiencies, shadowing,
temperature variations. Plus the **cosine loss**, cos θ, where θ is the
sun incidence angle.

**Life degradation** — thermal cycling in and out of eclipse,
micrometeoroid strikes, plume impingement from thrusters, material
outgassing. Budget **2–3% per year in LEO**.

Datasheet numbers are quoted at **25 °C and 1000 W/m²**. Your cells will
be at neither.

## Three steps for the battery

1. Determine energy storage requirements
2. Select type of secondary battery
3. Determine the size of the batteries (battery capacity)

The sizing variables: **P_e T_e** (average eclipse load × eclipse
duration), **N** (number of batteries), **η** (battery-to-load
efficiency), and **DoD**:

> Depth of discharge — the capacity that is discharged from a fully
> charged battery, divided by battery nominal capacity, expressed as a
> percentage.

> **Source note.** The array and battery sizing equations are images in
> the original deck and did not extract. The variable definitions above
> are quoted from the text; get the equations from the slides.

---

*Source: EPS Subsystem Design for CubeSats, Session 2, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'regulation-and-unloading', 'Regulation, and the unloading function',
    'reading', 25, 5, $md$## PPT versus DET

**Peak Power Tracking** is non-dissipative — it extracts the exact power
the spacecraft requires, up to the array's peak power.

> A PPT has advantages for missions under 5 years that require more
> power at BOL than at EOL.

**Direct Energy Transfer** is dissipative, using shunt resistors.

> A shunt-regulated subsystem has advantages: fewer parts, lower mass,
> and higher total efficiency at EOL.

## Three bus classes

- **Unregulated** — bus voltage = battery voltage
- **Quasi-regulated** — regulated during charge only; the voltage is
  about a diode drop below the battery; low efficiency and high EMI if
  used with a PPT
- **Fully regulated** — employs charge and discharge regulators; the
  most complex, with inherent low efficiency and high EMI when used with
  a PPT or boost converter

## The unloading function

This is the most important paragraph in the course.

The PCDU provides over-current protection, load management, and battery
under-voltage protection. **All subsystems and payloads must be
switched individually.** A software safety task monitors state of charge
and shuts subsystems down in priority order; a hardware absolute-minimum
battery voltage backs that task up.

> Without the Unloading Function, the spacecraft will remain in a
> negative power budget and will never recover!

Never recover. Not "will degrade". There is no ground command that fixes
a spacecraft whose radio cannot power on.

---

*Source: EPS Subsystem Design for CubeSats, Sessions 1 & 2, KSA Training 2022.*$md$,
    false, null);

  v_module := app.seed_module(v_course, 'hardware', 'Building the board',
    'From mathematical design to a manufactured PC/104 card.', 3);
  perform app.seed_lesson(v_module, 'design-flow', 'The electronic design flow',
    'reading', 25, 1, $md$## Six steps

1. **Mathematical design and calculations** — Octave, MATLAB, datasheets
2. **Circuit verification and simulation** — breadboard first, then SPICE:
   MATLAB Simulink, LTSpice, QUCS, PSPICE for TI
3. **Schematic design** — flat versus hierarchical
4. **Schematic review** — checklist-driven, and iterative
5. **Generate the schematic netlist**
6. **Generate the BOM**

## Choosing components

Manufacturer and part number, package type and size, electrical and
mechanical ratings and tolerances, operating conditions, vendor options,
active status and support, availability and stock, price, and
alternatives. Named distributors: Digi-Key, Mouser, Arrow, RS
Components, Newark.

## Standards you will actually cite

- **IPC-7351B** — generic requirements for surface mount design and land
  patterns. Used for both routing and production.
- **IPC J-STD-001** — soldering requirements.
- **IPC-6012** — board classes 1/2/3. *Class 3 is a standard requirement
  for military, medical, and aerospace equipment.*
- **IPC-2152** — implemented by the free Saturn PCB Design Toolkit.

## Form factor

> All electronic boards must measure 3.550 × 3.775 in (90 × 96 mm), and
> the electric bus must allocate four rows with 26 contacts of standard
> 0.1 inch spacing through-hole headers.

That is **PC/104**, and all the boards stack into a 1U volume.

---

*Source: EPS Subsystem Design for CubeSats, Session 3, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'cots-and-trl', 'COTS, radiation hardening and TRL',
    'reading', 20, 2, $md$## What rad-hard buys, and costs

- Rated radiation dose of **100 krad to > 1 Mrad**
- No single-event latch-up, because parasitic SCR structures are disabled
- Characterised single-event effects
- Hermetic packages
- **Low degree of integration, and mature technology — roughly 10 years
  behind cutting edge**
- No supplier stock, long lead times, high cost

## COTS

> Hardware and software that is commercially made and available to the
> general public and that requires little or no unique modifications.

And the warning that matters:

> COTS components does not always mean space qualified components.

The selection checklist: look at test results, examine problem reports,
evaluate user documentation, look at product support, check TRL.

**TRL** is *a description of the performance history of a given system,
subsystem, or component relative to a set of levels first described at
NASA HQ in the 1980s.*

## Firmware

The EPS MCU needs low power consumption, sufficient internal program
memory, a small footprint, flexible design, and suitability for the space
environment — **temperature tolerance between −40 °C and +80 °C**.

Peripherals in play: ADC for sensor, voltage and current measurement;
**PWM to drive MOSFET switching — very common in the EPS**; timers; and
a watchdog:

> If the EPS becomes unresponsive, a reset signal is the only way to
> recover normal operations. This is where a watchdog timer comes handy.

Frameworks named: **CMSIS** (vendor-independent abstraction for Arm
Cortex) and **FreeRTOS** (ported to 35 MCU platforms).

---

*Source: EPS Subsystem Design for CubeSats, Sessions 2 & 3, KSA Training 2022.*$md$,
    false, null);

  v_quiz := app.seed_quiz(v_course, 'eps-check', 'EPS design check', 'Graded. Numeric answers accept a tolerance; units are shown.');
  perform app.seed_question(v_quiz, 'numeric', $md$What percentage of all on-orbit spacecraft failures result from EPS failures, according to the course?$md$,
    '[]'::jsonb, '{"value": 25, "tolerance": 1, "unit": "%"}'::jsonb,
    $md$Over 25%. Insurance claims tell the same story: about 50% of claims relate to EPS.$md$, 2, 1);
  perform app.seed_question(v_quiz, 'numeric', $md$Maximum eclipse duration for a LEO orbit, in minutes.$md$,
    '[]'::jsonb, '{"value": 35, "tolerance": 2, "unit": "min"}'::jsonb,
    $md$Close to 35 minutes. This is the number that sizes your battery.$md$, 2, 2);
  perform app.seed_question(v_quiz, 'single_choice', $md$The solar constant's mean value is:$md$,
    '[{"id": "a", "text": "1321 W/m\u00b2"}, {"id": "b", "text": "1358 W/m\u00b2"}, {"id": "c", "text": "1413 W/m\u00b2"}, {"id": "d", "text": "1000 W/m\u00b2"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$1358 W/m² mean; 1321 minimum and 1413 maximum. 1000 W/m² is the datasheet test condition, not the space value.$md$, 1, 3);
  perform app.seed_question(v_quiz, 'single_choice', $md$A mission needs more power at beginning of life than at end of life, and runs for three years. Which regulation approach does the course favour?$md$,
    '[{"id": "a", "text": "Direct energy transfer with shunt regulation"}, {"id": "b", "text": "Peak power tracking"}, {"id": "c", "text": "Unregulated bus, no regulation"}, {"id": "d", "text": "Fully regulated bus with a boost converter"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$A PPT has advantages for missions under 5 years that require more power at BOL than at EOL.$md$, 1, 4);
  perform app.seed_question(v_quiz, 'single_choice', $md$What happens to a spacecraft with a negative power budget and no unloading function?$md$,
    '[{"id": "a", "text": "It enters safe mode and recovers when the battery recharges"}, {"id": "b", "text": "Ground control can command a reset"}, {"id": "c", "text": "It never recovers"}, {"id": "d", "text": "It sheds payload load automatically via hardware"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$Without the unloading function the spacecraft remains in a negative power budget and will never recover. Recovery requires that loads can be switched off individually.$md$, 1, 5);
  perform app.seed_question(v_quiz, 'multi_choice', $md$Which are causes of *life* degradation of a solar array, as opposed to inherent degradation?$md$,
    '[{"id": "a", "text": "Thermal cycling in and out of eclipse"}, {"id": "b", "text": "Sun incidence angle (cosine loss)"}, {"id": "c", "text": "Micrometeoroid strikes"}, {"id": "d", "text": "Shadowing from the structure"}, {"id": "e", "text": "Material outgassing"}]'::jsonb, '{"correct": ["a", "c", "e"]}'::jsonb,
    $md$Cosine loss and shadowing are inherent degradation — present from day one. Thermal cycling, micrometeoroids and outgassing accumulate, at 2–3% per year in LEO.$md$, 2, 6);
  perform app.seed_question(v_quiz, 'numeric', $md$Nominal voltage of an 18650 lithium-ion cell, in volts.$md$,
    '[]'::jsonb, '{"value": 3.7, "tolerance": 0.05, "unit": "V"}'::jsonb,
    $md$3.7 V nominal, 18 mm × 65 mm, and high-energy versions now exceed 3000 mAh.$md$, 2, 7);

  -- ── Course: On-Board Computer and Data Handling
  v_course := app.seed_course(v_track, 'onboard-computer', 'On-Board Computer and Data Handling',
    'The processor, the flight software, and the data budget that decides whether your images ever reach the ground', 'System architectures, flight software design, radiation effects on computing, and a fully worked data budget.', $md$System architectures, flight software design, radiation effects on computing, and a fully worked data budget.

---

**Source material.** KSA Training_ppt_obc.pdf (50 slides), KSA Training 2022.$md$,
    'intermediate', 240, 3,
    '{"obc","flight-software","rtos","radiation","data-budget"}', '{"introduction-to-space-systems"}', '{"Choose between centralized, ring and bus architectures with reasons","Derive flight software functional requirements from a mission requirement","Compute onboard storage and minimum downlink rate from mission parameters","Classify radiation effects and specify the right mitigation for each"}',
    false, null);

  v_module := app.seed_module(v_course, 'architecture', 'Architecture and requirements',
    'What the OBC does, how it is wired to everything else, and what space demands of it.', 1);
  perform app.seed_lesson(v_module, 'functions-and-topologies', 'Functions and system topologies',
    'reading', 25, 1, $md$## What the OBC is for

- Recording and storage of telemetry and satellite payload data
- Encoding and decoding of data packets to and from the ground station
- Processing of commands from the ground station
- Monitoring other subsystems
- Implementing watchdog functions
- Controlling the orientation of the satellite within its orbit

## Three topologies

**Centralized** — a central node connected directly with the remaining
nodes. *Best solution for small systems*; *errors will not affect other
nodes*.

**Ring** — each node connected with only two others. *Less harness and
the data bus can be kept simple*; *new nodes can be added easily*.

**Bus** — all nodes share a common data bus, managed by a protocol.
*High reliability*; *loss of one or more nodes does not affect the
communication between the remaining nodes*.

## Centralized versus distributed processing

Centralized means one OBC interfacing with all subsystems and doing all
the processing — possibly as a processor pool. Distributed means some
subsystems have their own processing power:

> A failure does not affect the complete system. Very critical functions
> should run in different processors to avoid interferences.

## What space demands

Vacuum changes thermal management. The temperature range is
**−170 °C to +120 °C**. Launch brings extreme vibration. And then:

> Hardware can't be repaired.

Which produces the rest of the requirement list: reliability, limited
resources, self-healing (*ability to recover automatically*), remote
diagnosis, fault tolerance, high computing performance, software uploads.

---

*Source: On-Board Computer and Data Handling, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'flight-software', 'Flight software',
    'reading', 30, 2, $md$## Quality attributes

Modularity, portability, extensibility, reliability, and **scalability**
— defined here specifically for *operation of nanosatellite missions in
a constellation with an increasing number of satellites*.

## Deriving requirements

The course works one example end to end. Mission requirement:

> To capture images over Nairobi area

Three flight software functional requirements follow:

1. Store and download telemetry data
2. Execute self-generated commands
3. Execute commands generated from ground satellite operators

Note that none of those mention imaging. They are what the *software*
must do so that imaging is possible.

## The component checklist

Twenty modules a complete FSW design needs: telemetry collection,
telemetry transmission, telemetry storage, fault management, watchdog
interface, command service, activity scheduler, time management,
messaging service, remote communication, communication interface,
parameter database interface, file system interface, log collection,
utilities (checksum, encoding/decoding, compression), debugging support
and testing support.

## RTOS

Kernel services: task management, I/O management, interrupt and event
handling, timer management, memory management, communication management.
Key features: safety, reliability, multitasking and speed.

## Service-oriented, not master/slave

Seven advantages are listed, ending with the one that matters:

> Reduces single point of failure: the complexity is moved from a single
> master node to several well defined services on the network.

## Code quality

> Clear code rules, code reviews and code test.

> Code should be tested by a second developer.

---

*Source: On-Board Computer and Data Handling, KSA Training 2022.*$md$,
    false, null);

  v_module := app.seed_module(v_course, 'data-and-radiation', 'Data budgets and radiation',
    'The calculation every mission does, and the environment that breaks computers.', 2);
  perform app.seed_lesson(v_module, 'data-budget', 'The data budget',
    'reading', 30, 1, $md$## Where it sits

Phase B produces five budgets: **mass, power, link, data, thermal**.
This is the data one.

It has two parts. **Telemetry packet budget** — *each sensor generates
different housekeeping data depending on the sensor's nature,
measurement accuracy and sampling rate.* **Payload data budget** — for a
camera: image sensor type (panchromatic, multispectral, hyperspectral),
resolution, frame rate, bits per pixel, compression rate.

## The worked exercise

This is reproduced from the course exactly, because it is the single
most useful calculation in the module.

> Our mission is to capture images over land to detect forest fires. The
> sensor will only be active about 30% of each orbit. Our satellite is at
> an altitude of 500 km and will have a period of 90 minutes. We have a
> 1024 × 1024 pixel detector and assume that we need 8 bits to accurately
> record each pixel. To ensure we achieve the required coverage, we will
> collect an image about every 30 seconds. Our on-board processor will
> review and reject some images with low probability of having a forest
> fire (about 95%). All of the remaining images must be down-linked
> during a 15 min pass over a ground station. To allow additional margin
> at least 3 orbits worth of data must be saved and downloaded during a
> pass.

### Method

```
Data per image      = (pixels wide) × (pixels long) × (bits per pixel)
Images saved/orbit  = (orbital period) × (image rate) × (% sensor active) × (% not rejected)
Max data bits       = (number of orbits) × (images per orbit) × (data per image)
Min data rate       = (max data bits) / (pass time)
```

### Answer

```
Data per image     = 1024 × 1024 × 8       = 8.389 × 10⁶ bits
Images per orbit   = 90 × 2 × 0.30 × 0.05  = 2.7 → 3 images
Max data bits      = 3 × 3 × 8.389 × 10⁶   = 7.55 × 10⁷ bits
Max data bytes     = 7.55 × 10⁷ / 8        = 9.437 × 10⁶ bytes
Min data rate      = 7.55 × 10⁷ / 900 s    = 8.389 × 10⁴ bits/s
```

### Two things to notice

The **500 km altitude is never used**. It is there to make the problem
feel real, and to see whether you notice. Real requirement documents do
this constantly.

And **2.7 rounds up to 3**, not down. You size storage for the worst
case, not the average.

---

*Source: On-Board Computer and Data Handling, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'radiation', 'Radiation effects and error handling',
    'reading', 25, 2, $md$## Two families

**Long-term accumulative**

- **TID** — total ionizing dose. *Cumulative long term ionizing damage
  due to protons and electrons.* Ionization creates electron-hole pairs;
  accumulated positive charge builds up in insulators and oxides.
  Effects: threshold voltage shift, leakage current, functional failures.
  Mitigation: shielding.
- **DDD** — displacement damage dose. *Cumulative long term non-ionizing
  damage due to protons, electrons and neutrons.* Affects opto-couplers,
  solar cells, CCDs, linear bipolar devices. Mitigation: shielding.

**Short-term / transient**

- **SEE** — single event effects, which *result from ionization by a
  single charged particle passage through a MOS transistor and through
  the junction of a bipolar transistor*. Non-destructive: **single event
  upset (SEU)**. Destructive: **single event latch-up (SEL)**.

Mitigation for SEE happens at three levels: parts level (*maximize
critical charge required for an upset*), circuit level (*on-board error
detection and correction*), system level (*add filters to suppress
propagation of fast transients*).

## Designing around COTS

> COTS microcontrollers do not support internal error detection and
> handling. Protection mechanism has to be implemented with external
> hardware.

> If the processor crashes, a watchdog timer can detect the event and
> reset the system.

> A triple redundancy allows the detection and correction of an error.

Memory error detection: parity, EDAC code, CRC at block level, multiple
copies of data.

**FRAM** is worth knowing: *more tolerant to radiation than FLASH cells.
It uses 99% less power than a DRAM memory and has a higher temperature
operation range.*

## Test before you fly

Four tests named: command execution test; **day-in-the-life test**,
where a typical 24-hour on-orbit period is simulated; end-to-end
communications test; and a **complete power system charge cycle**, where
the battery is discharged to full depth of discharge through satellite
operations and then recharged using the solar panels.

---

*Source: On-Board Computer and Data Handling, KSA Training 2022.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'data-budget-sim', 'Sandbox: data budget',
    'simulation', 25, 3, $md$The forest-fire exercise, parameterised. Change the detector size, the
rejection rate, the pass length and the number of orbits stored, and
watch storage and required downlink rate move.

Then answer the question the exercise sets up but does not ask: at what
point does your **link budget** stop being able to deliver the data rate
your **data budget** demands? That intersection is where mission design
actually happens.$md$,
    false, 'data-budget');

  v_quiz := app.seed_quiz(v_course, 'obc-check', 'OBC and data handling check', 'Graded. The data budget questions use the forest-fire mission from the course.');
  perform app.seed_question(v_quiz, 'numeric', $md$Using the course's forest-fire mission, how many bits does one 1024 × 1024, 8-bit image contain? Answer in millions of bits.$md$,
    '[]'::jsonb, '{"value": 8.389, "tolerance": 0.05, "unit": "Mbit"}'::jsonb,
    $md$1024 × 1024 × 8 = 8.389 × 10⁶ bits.$md$, 2, 1);
  perform app.seed_question(v_quiz, 'numeric', $md$Same mission: the minimum downlink rate, in kbit/s.$md$,
    '[]'::jsonb, '{"value": 83.89, "tolerance": 2, "unit": "kbit/s"}'::jsonb,
    $md$7.55 × 10⁷ bits over a 15-minute (900 s) pass = 8.389 × 10⁴ bit/s.$md$, 2, 2);
  perform app.seed_question(v_quiz, 'single_choice', $md$In that exercise, the 500 km altitude is:$md$,
    '[{"id": "a", "text": "Used to compute the orbital period"}, {"id": "b", "text": "Used to compute the pass duration"}, {"id": "c", "text": "Not used in the calculation at all"}, {"id": "d", "text": "Used to compute the image footprint"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$It is never used. The period is given directly as 90 minutes and the pass as 15 minutes. Spotting unused givens is part of the skill.$md$, 1, 3);
  perform app.seed_question(v_quiz, 'single_choice', $md$A single charged particle causes a bit to flip in RAM, with no permanent damage. This is:$md$,
    '[{"id": "a", "text": "TID"}, {"id": "b", "text": "DDD"}, {"id": "c", "text": "SEU"}, {"id": "d", "text": "SEL"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$A single event upset — non-destructive. A latch-up (SEL) is the destructive single-event case.$md$, 1, 4);
  perform app.seed_question(v_quiz, 'single_choice', $md$Which mitigation is appropriate for total ionizing dose?$md$,
    '[{"id": "a", "text": "Triple modular redundancy"}, {"id": "b", "text": "Shielding"}, {"id": "c", "text": "Watchdog timer"}, {"id": "d", "text": "CRC at block level"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$TID and DDD are cumulative and answered with shielding. Redundancy, watchdogs and CRC address single-event effects, which shielding cannot stop.$md$, 1, 5);
  perform app.seed_question(v_quiz, 'single_choice', $md$The operating temperature range the course states for the space environment:$md$,
    '[{"id": "a", "text": "\u221240 \u00b0C to +85 \u00b0C"}, {"id": "b", "text": "\u221255 \u00b0C to +125 \u00b0C"}, {"id": "c", "text": "\u2212170 \u00b0C to +120 \u00b0C"}, {"id": "d", "text": "0 \u00b0C to +70 \u00b0C"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$−170 °C to +120 °C. Note the EPS course separately requires the EPS MCU to tolerate −40 °C to +80 °C, which is the component spec rather than the environment.$md$, 1, 6);

  -- ═══ TRACK: Satellite-to-IoT ═══
  v_track := app.seed_track('satellite-to-iot', 'Satellite-to-IoT', 'LoRa, the SX1278, edge device design and the store-and-forward architecture that connects remote sensors to a spacecraft.',
    $md$The commercial heart of the EduSat programme. A ground sensor with
a 100 mW radio and no infrastructure, a satellite passing overhead
for ten minutes, and a link that has to close.

Built from AfriOrbit's own SDR-IoT edge device: an ESP32-S3 with an
Ai-Thinker Ra-02 (Semtech SX1278) at 433 MHz, a BME280, an IP5306
power path and a microSD store. You will work with the real board's
configuration, not a generic tutorial.$md$, 'intermediate', 2);

  -- ── Course: LoRa for Satellite IoT
  v_course := app.seed_course(v_track, 'lora-for-satellite-iot', 'LoRa for Satellite IoT',
    'Spreading factors, airtime, and the configuration on AfriOrbit''s own edge device', 'How LoRa trades data rate for range, what that costs in airtime, and how the SX1278 on the AfriOrbit IoT Edge Device is actually configured.', $md$How LoRa trades data rate for range, what that costs in airtime, and how the SX1278 on the AfriOrbit IoT Edge Device is actually configured.

---

**Source material.** AfriOrbit SDR-IOT-project: Software/IoTEdgeDevice/LoraV1 firmware, include/Comms/sx1278_pinouts.md, and Fab Files BOM. Plus SX1276/77/78/79 datasheet.$md$,
    'intermediate', 180, 1,
    '{"lora","sx1278","rf","iot","esp32"}', '{}', '{"Predict airtime from spreading factor, bandwidth, coding rate and payload","Explain why a longer-range link carries less data per day, quantitatively","Read and modify the real LoRa configuration on the AfriOrbit edge device"}',
    true, 'Works fully in simulation. To complete the optional bench exercises you need an AfriOrbit IoT Edge Device or any ESP32 with an SX1278 / Ra-02 module.');

  v_module := app.seed_module(v_course, 'physical-layer', 'The LoRa physical layer',
    'Chirp spread spectrum, and the four knobs that decide everything.', 1);
  perform app.seed_lesson(v_module, 'the-four-knobs', 'Spreading factor, bandwidth, coding rate, power',
    'reading', 30, 1, $md$## What you actually control

LoRa gives you four parameters, and every link decision is some
combination of them.

**Spreading factor (SF7–SF12).** Each step up roughly doubles airtime
and adds about 2.5 dB of link budget. Higher SF reaches further and
carries less.

**Bandwidth (125 / 250 / 500 kHz).** Wider is faster and less sensitive.

**Coding rate (4/5 to 4/8).** Forward error correction. More redundancy
survives more interference and costs more airtime.

**Transmit power.** On the Ra-02, up to about 20 dBm.

## The trade, in numbers

From AfriOrbit's own LoRa notes:

| Configuration | Approximate data rate |
|---|---|
| SF7, 500 kHz | ≈ 300 kbps |
| SF12, 125 kHz | ≈ 0.29 kbps |

That is a factor of about **a thousand** between the fastest and the
longest-reaching configuration on the same radio.

## Expected range

Also from the project's notes:

| Environment | Range |
|---|---|
| Urban | 5–10 km |
| Suburban | 10–20 km |
| Rural, line of sight | 20–30+ km |

## The longest-range recipe

The project documents this configuration explicitly:

> BW 125 kHz, SF12, CR 4/5, 17–20 dBm, AGC on

## Packet overhead

Every packet carries **8 bytes of preamble + 1 byte header + 2 bytes CRC
= 11 bytes of overhead**. On a 20-byte payload that is a 55% tax. The
project's own worked figure: a **266-byte packet takes 7.31 seconds** to
transmit at the long-range settings.

Seven and a third seconds. For one packet. That number is why duty-cycle
regulations exist and why satellite IoT is a scheduling problem before it
is a radio problem.

---

*Source: AfriOrbit SDR-IOT-project, `include/Comms/sx1278_pinouts.md`.*$md$,
    true, null);
  perform app.seed_lesson(v_module, 'airtime-sim', 'Sandbox: airtime and link trade',
    'simulation', 30, 2, $md$Compute airtime with the Semtech formula, for any combination of the
four knobs.

Three exercises:

1. **Reproduce the project's number.** Set 266 bytes, SF12, 125 kHz,
   CR 4/5, and confirm you get about 7.31 seconds.
2. **Find the duty-cycle wall.** At 1% duty cycle, how many 20-byte
   messages per hour can one node send at SF12? At SF7?
3. **Size a network.** If a satellite is overhead for 10 minutes and 200
   nodes all want to report, which spreading factors can possibly work?
   This is where the coverage simulator's contention model comes from.$md$,
    false, 'lora-airtime');

  v_module := app.seed_module(v_course, 'the-real-device', 'The AfriOrbit IoT Edge Device',
    'The actual board: what is on it, how it is wired, and how the firmware configures it.', 2);
  perform app.seed_lesson(v_module, 'hardware', 'The hardware',
    'reading', 25, 1, $md$## What is on the board

From the project's fabrication BOM:

| Role | Part |
|---|---|
| Microcontroller | **ESP32-S3-WROOM-1-N16R8** (16 MB flash, 8 MB PSRAM) |
| Radio | **Ai-Thinker Ra-02**, based on **Semtech SX1278**, 410–525 MHz, SPI, U.FL |
| Power management | **IP5306** battery management |
| Regulator | **AMS1117-3.3** (1 A, 3.3 V, SOT-223) |
| Environmental sensor | **Bosch BME280** — humidity, pressure, temperature, LGA-8 |
| Storage | Hirose **DM3D-SF** microSD socket |
| ESD protection | **SP0503BAHT**, 5.5 V standoff, 3 channels |
| RTC crystal | **WE-XTAL-85SMX**, 32.768 kHz |

Four copper layers — the fabrication outputs include separate `GND` and
`PWR` gerbers alongside `F_Cu` and `B_Cu`.

## How the radio is wired

Taken from the PCB netlist, which is the authoritative source:

| ESP32-S3 pin | Net |
|---|---|
| IO9 | CS_LORA |
| IO11 | MOSI_LORA |
| IO12 | SCLK_LORA |
| IO13 | MISO_LORA |
| IO14 | RESET |
| IO3 | IRQ1 (DIO0 — RxDone/TxDone) |
| IO41 / IO42 | IRQ2 / IRQ3 (DIO1 / DIO2) |

The microSD is on a **separate SPI bus** — IO35/36/37 with CS on IO10 —
in 1-bit SPI mode, not 4-bit SDIO.

## A caution that is itself the lesson

The project's README files and the firmware and the PCB **do not all
agree** about pin assignments. The README for the SD card documents
GPIO 12/13/11/10; the firmware uses 36/37/35/10; the PCB agrees with the
firmware.

When documentation and hardware disagree, the hardware is right. Read the
netlist. This happens on real projects constantly, and being the engineer
who checks is worth more than being the engineer who assumes.

---

*Source: AfriOrbit SDR-IOT-project, `Fab Files v1/BOM.csv` and `IoT Edge Device V1.kicad_pcb`.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'firmware-config', 'The firmware''s radio configuration',
    'reading', 25, 2, $md$## The defaults, as shipped

From `include/Comms/LoraComms.h`:

```cpp
struct LoRaBaseConfig {
  long frequency       = 433E6;   // Hz
  int  spreadingFactor = 7;
  long signalBandwidth = 500E3;   // Hz
  int  codingRate      = 5;       // 4/5
  int  syncWord        = 0x12;
  bool invertIQ        = false;
  int  preambleLength  = 8;
  bool enableCRC       = false;
};
```

Transmit adds `txPower = 2` dBm, `currentLimit = 100` mA,
`overCurrentProtection = 150` mA. Receive adds `gain = -1` (AGC),
`continousMode = false`, `rssiThreshold = -100` dBm.

## Read that configuration critically

This is the **fastest, shortest-range** corner of the trade space:
SF7 at 500 kHz. Compare it against the long-range recipe in the previous
module — BW 125 kHz, SF12, 17–20 dBm — and note that the shipped default
is the opposite of it, at **2 dBm** transmit power.

That is a sensible bench default and a poor field default. Knowing which
you are looking at is the point of this lesson.

Two more things the code tells you, if you read the comments:

- `begin()` hardcodes `LoRa.begin(433E6)` in the receive path with an
  inline `// @TODO: use _frequency`. The configurable frequency is not
  actually plumbed through on that branch.
- `receive()` carries the comment *"Current implementation has numerous
  losses. Some messages get lost"*.

Both are honest notes from the author, and both are real work items.
Reading a codebase for its TODOs is a skill.

## Frequency, and a discrepancy worth resolving

The firmware and the hardware use **433 MHz**. The repository README
states *868 MHz for Africa*. These cannot both be right for a deployed
system, and the answer depends on national spectrum regulation — in
Kenya, on the Communications Authority's licence-exempt allocations.

Resolving that is a real engineering task, not a documentation tidy-up.

---

*Source: AfriOrbit SDR-IOT-project firmware.*$md$,
    false, null);

  v_quiz := app.seed_quiz(v_course, 'lora-check', 'LoRa configuration check', 'Graded. All figures come from AfriOrbit''s own project documentation.');
  perform app.seed_question(v_quiz, 'single_choice', $md$Moving from SF7 to SF12 at fixed bandwidth does what to airtime?$md$,
    '[{"id": "a", "text": "Roughly halves it"}, {"id": "b", "text": "Leaves it unchanged"}, {"id": "c", "text": "Roughly doubles it per step, so ~32\u00d7 overall"}, {"id": "d", "text": "Increases it by about 25%"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$Each spreading factor step roughly doubles airtime. Five steps is about 32×, which is why the data rate falls from ~300 kbps to ~0.29 kbps.$md$, 1, 1);
  perform app.seed_question(v_quiz, 'numeric', $md$Total per-packet overhead in LoRa, in bytes, per the project notes.$md$,
    '[]'::jsonb, '{"value": 11, "tolerance": 0, "unit": "bytes"}'::jsonb,
    $md$8-byte preamble + 1-byte header + 2-byte CRC = 11 bytes.$md$, 2, 2);
  perform app.seed_question(v_quiz, 'single_choice', $md$The Ra-02 module on the AfriOrbit edge device is based on which Semtech part?$md$,
    '[{"id": "a", "text": "SX1262"}, {"id": "b", "text": "SX1278"}, {"id": "c", "text": "SX1301"}, {"id": "d", "text": "SX1280"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Ai-Thinker Ra-02, based on the SX1278, 410–525 MHz — which is why the board runs at 433 MHz.$md$, 1, 3);
  perform app.seed_question(v_quiz, 'single_choice', $md$The shipped firmware defaults to SF7 at 500 kHz and 2 dBm. This configuration is:$md$,
    '[{"id": "a", "text": "Optimised for maximum range"}, {"id": "b", "text": "Optimised for throughput and short range \u2014 a bench default"}, {"id": "c", "text": "The configuration required by regulation"}, {"id": "d", "text": "Optimised for lowest power consumption"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$It is the fast, short-range corner. The project's own long-range recipe is the opposite: 125 kHz, SF12, 17–20 dBm.$md$, 1, 4);
  perform app.seed_question(v_quiz, 'single_choice', $md$The README, the firmware and the PCB disagree about SD card pin assignments. Which is authoritative?$md$,
    '[{"id": "a", "text": "The README, because it is documentation"}, {"id": "b", "text": "The firmware, because it runs"}, {"id": "c", "text": "The PCB netlist, because it is the physical wiring"}, {"id": "d", "text": "Whichever was committed most recently"}]'::jsonb, '{"correct": "c"}'::jsonb,
    $md$The copper decides. Firmware can be changed to match it; documentation is just a claim about it. Here the firmware happens to agree with the PCB and the README does not.$md$, 1, 5);

  -- ═══ TRACK: Rocketry Avionics ═══
  v_track := app.seed_track('rocketry-avionics', 'Rocketry Avionics', 'From blinking an LED to a flight computer that logs a full trajectory — the twelve-step firmware ladder used on the Morgan State rocketry programme.',
    $md$The entry rung of the capability ladder, and the fastest way to put
a working engineering loop in front of a student: predict, build,
fly, measure, explain the discrepancy.

The firmware progression is AfriOrbit's actual Morgan State
University avionics course — twelve sketches, each adding exactly
one concept, ending in a CSV data logger flying on an ESP32 with a
BMP280 and an MPU6050.$md$, 'foundation', 3);

  -- ── Course: Flight Computer Firmware
  v_course := app.seed_course(v_track, 'flight-computer-firmware', 'Flight Computer Firmware',
    'Twelve steps from a blinking LED to a data logger that survives a flight', 'AfriOrbit''s Morgan State University avionics progression, one concept per step, ending in a working CSV flight recorder on an ESP32 with a BMP280 and an MPU6050.', $md$AfriOrbit's Morgan State University avionics progression, one concept per step, ending in a working CSV flight recorder on an ESP32 with a BMP280 and an MPU6050.

---

**Source material.** AfriOrbit Morgan-State-Rocketry-Program: Avionics-Software/Source Code (12 sketches) and avionics-hardware (MSU-avionics v0.1 by Edwin Mwiti, 2024).$md$,
    'foundation', 300, 1,
    '{"arduino","esp32","sensors","i2c","datalogging","rocketry"}', '{}', '{"Write non-blocking firmware using millis() rather than delay()","Discover and address I2C devices without being told their addresses","Configure a BMP280 and an MPU6050 and read calibrated values","Build a CSV data logger with a stable schema and a fail-fast startup"}',
    true, 'An ESP32 development board, a BMP280 breakout, an MPU6050 breakout and an SD card module will complete every exercise. The AfriOrbit MSU-avionics board integrates all of it.');

  v_module := app.seed_module(v_course, 'foundations', 'Foundations',
    'Output, input, and the single most important lesson in embedded timing.', 1);
  perform app.seed_lesson(v_module, 'the-ladder', 'How this course works',
    'reading', 15, 1, $md$## Twelve sketches, one idea each

This is not a tour of the Arduino API. It is a ladder, and each rung
adds exactly one concept:

| # | Sketch | The one new idea |
|---|---|---|
| 1 | LEDBlink_Test | Digital output |
| 2 | LED_OnKeypress | Digital input, debounce, latched state |
| 3 | LED_Millis_Test | **Non-blocking timing** |
| 4 | Simple_Buzzer_Test | A second actuator type |
| 5 | Jingle_Bells_Keypress | `tone()`, and multi-file sketches |
| 6 | I2CScanner | Bus discovery |
| 7 | BMP280_Test | First sensor driver |
| 8 | MPU6050_Test | Second sensor, verbose |
| 9 | MPU6050_Simplified | Refactoring away scaffolding |
| 10 | SD_Detection | Storage detection |
| 11 | SD_FileWrite_Test | File I/O |
| 12 | Simple_Integrated_Software | **Integration** |

## Two idioms you will see throughout

```cpp
Serial.begin(115200);
while (!Serial) delay(10);
```

and the fail-fast guard:

```cpp
if (!sensor.begin()) {
  Serial.println("Sensor not found");
  while (1) delay(10);
}
```

That second pattern is deliberate. A flight computer that boots with a
dead sensor and flies anyway produces a log full of zeros and a wasted
flight. Better to refuse to arm.

---

*Source: AfriOrbit Morgan-State-Rocketry-Program.*$md$,
    true, null);
  perform app.seed_lesson(v_module, 'non-blocking', 'Why delay() will ruin your flight computer',
    'reading', 25, 2, $md$## The problem, made concrete

Sketch 3 blinks two LEDs — one at 100 ms, one at 300 ms. Try to write
that with `delay()` and you cannot. The two intervals do not divide into
a single sleep.

```cpp
const unsigned long BLINK_INTERVAL  = 100;
const unsigned long BLINK_INTERVAL2 = 300;

unsigned long previousMillis  = 0;
unsigned long previousMillis2 = 0;

void loop() {
  unsigned long now = millis();

  if (now - previousMillis >= BLINK_INTERVAL) {
    previousMillis = now;
    digitalWrite(LED, !digitalRead(LED));
  }
  if (now - previousMillis2 >= BLINK_INTERVAL2) {
    previousMillis2 = now;
    digitalWrite(LED2, !digitalRead(LED2));
  }
}
```

## Why this is the rocketry lesson, not a style preference

At apogee your flight computer needs to detect a pressure inflection,
fire a recovery charge, and keep logging. If it is inside a `delay(500)`
when apogee happens, it misses it.

The subtraction form `now - previous >= interval` also survives the
`millis()` rollover at about 49 days, which the naive
`now >= previous + interval` does not. Not a concern on a two-minute
flight; a real concern on a ground station.

---

*Source: Sketch 3, `LED_Millis_Test.ino`.*$md$,
    false, null);

  v_module := app.seed_module(v_course, 'sensors', 'Sensors and storage',
    'Find the devices, read them properly, and write the data somewhere it survives.', 2);
  perform app.seed_lesson(v_module, 'i2c-discovery', 'Finding devices on the bus',
    'reading', 20, 1, $md$## Why the scanner comes before the drivers

Sketch 6 is an I2C scanner, and it is deliberately placed **before** any
sensor library. You are meant to find the addresses yourself:

```cpp
for (address = 1; address < 127; address++) {
  Wire.beginTransmission(address);
  error = Wire.endTransmission();
  if (error == 0) {
    Serial.print("I2C device found at address 0x");
    ...
  }
}
```

On this hardware you will find two:

- **0x76** — BMP280 (pressure and temperature)
- **0x68** — MPU6050 (accelerometer and gyroscope)

Both sensors share one bus. That is why the scanner matters: when a
sensor stops responding in the field, the scanner tells you in seconds
whether it is a wiring problem or a software problem.

## A note on 0x76 versus 0x77

The BMP280 has two possible addresses selected by the SDO pin. The
AfriOrbit firmware calls `bmp.begin(0x76)` explicitly. The library's
alternate constant is present in the source but commented out. If your
breakout ties SDO high, you need 0x77 and the scanner will tell you.

---

*Source: Sketch 6 `I2CScanner.ino`, sketch 7 `BMP280_Test.ino`.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'configuring-sensors', 'Configuring the BMP280 and MPU6050',
    'reading', 30, 2, $md$## BMP280 — oversampling and filtering

```cpp
bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                Adafruit_BMP280::SAMPLING_X2,     // temperature
                Adafruit_BMP280::SAMPLING_X16,    // pressure
                Adafruit_BMP280::FILTER_X16,
                Adafruit_BMP280::STANDBY_MS_500);
```

Pressure gets 16× oversampling and temperature 2×, because altitude
resolution depends on pressure precision and only weakly on temperature.
The IIR filter at ×16 suppresses the pressure spikes that airflow over a
vent hole produces.

## Altitude needs a reference

```cpp
bmp.readAltitude(1026.25);   // sea-level pressure, hPa
```

That argument is **local sea-level pressure on the day**, not a
constant. Get it wrong by 10 hPa and your altitude is out by roughly
80 m. Before every flight, read the local QNH and update it.

## MPU6050 — ranges

```cpp
mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
mpu.setGyroRange(MPU6050_RANGE_500_DEG);
mpu.setFilterBandwidth(MPU6050_BAND_5_HZ);
```

**±8 g** is chosen because a model rocket's boost phase routinely exceeds
4 g — the EPS course's flight-profile figures show peak accelerations
around 9 g on a mid-power motor. Set ±2 g and your boost data clips flat,
and clipped data cannot be un-clipped afterwards.

**500 °/s** covers the roll rates a finned rocket reaches.

**5 Hz filter bandwidth** is aggressive. It smooths vibration nicely and
it will also smooth out fast transients you might care about. Worth
revisiting once you have a flight's data.

---

*Source: Sketches 7, 8 and 9.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'integration', 'The integrated data logger',
    'reading', 30, 3, $md$## The capstone

Sketch 12 combines both sensors and the SD card into a flight recorder.

```
Time,Accel_X,Accel_Y,Accel_Z,Gyro_X,Gyro_Y,Gyro_Z,Temp_C,Pressure_hPa
```

Header written once with `FILE_WRITE`, rows appended with `FILE_APPEND`,
timestamp from `millis()`, pressure converted with `/100.0F` to hPa,
logging at 1 Hz.

## Three things to change before you fly it

**1 Hz is too slow.** A 500 m flight lasts about 12 seconds to apogee.
At 1 Hz you get twelve data points on the way up. You want 50–100 Hz
through boost and coast.

**`millis()` resets on brownout.** If the battery sags on ignition and
the ESP32 resets, your time column restarts at zero and you will not
notice until you plot it.

**The file is opened and closed every row.** Safe against power loss,
expensive in time. At 100 Hz you will need to buffer and flush
periodically instead — and then decide what you are willing to lose.

Those three are the actual engineering content of this course. The wiring
is easy; deciding what to log, how fast, and what to sacrifice is not.

## The board this runs on

AfriOrbit's **MSU-avionics v0.1** (Edwin Mwiti, June 2024) carries an
**ESP32-WROOM-32-N4**, a **CP2102** USB-UART bridge, an **AMS1117-3.3**
regulator, an **LM2596S-12** buck converter, **16 MB of W25Q128 SPI
flash**, an **XT60** battery connector, a buzzer, three status LEDs, and
2.54 mm sockets for the BMP280 and MPU6050 breakouts.

Note there is **no SD socket** on v0.1 — it logs to onboard flash and
exposes a 6-pin *dump header* for post-flight retrieval. The SD sketches
target a breadboard setup. The schematic also carries two honest TODOs
from its author: *use a power MUX IC*, and *add XBee HP 900 MHz for
telemetry*.

---

*Source: `Simple_Integrated_Software.ino` and `avionics-hardware/`.*$md$,
    false, null);
  perform app.seed_lesson(v_module, 'flight-sim', 'Sandbox: predict the flight you are about to log',
    'simulation', 30, 4, $md$Before you fly, predict. Choose a motor class and an airframe and the
simulator returns apogee, maximum velocity, max-Q, rail-exit velocity,
stability margin and descent rate — plus a flight-card verdict naming
anything that would stop the flight.

Then fly it, log it with the firmware from this course, and explain the
discrepancy. That loop — predict, measure, explain — is the entire point
of the rocketry programme.

Use the trade curve underneath to answer one question before you buy
motors: **impulse doubles with every motor letter, so why doesn't
altitude?**$md$,
    false, 'flight');

  v_quiz := app.seed_quiz(v_course, 'avionics-check', 'Flight computer check', 'Graded. Everything here refers to the AfriOrbit avionics firmware.');
  perform app.seed_question(v_quiz, 'single_choice', $md$Why does the I2C scanner come before the sensor drivers in the progression?$md$,
    '[{"id": "a", "text": "Because Wire.h must be initialised before any sensor library"}, {"id": "b", "text": "So students discover the device addresses themselves rather than being told"}, {"id": "c", "text": "Because the BMP280 will not respond until scanned"}, {"id": "d", "text": "To set the I2C bus speed"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$It is a pedagogical choice. It also gives students the first tool they will reach for when a sensor stops responding in the field.$md$, 1, 1);
  perform app.seed_question(v_quiz, 'single_choice', $md$The firmware addresses the BMP280 at 0x76. What determines whether it is 0x76 or 0x77?$md$,
    '[{"id": "a", "text": "The library version"}, {"id": "b", "text": "The state of the SDO pin"}, {"id": "c", "text": "Whether it shares the bus with an MPU6050"}, {"id": "d", "text": "The supply voltage"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$SDO selects between the two addresses. Tie it high and you need 0x77 — which the scanner would have told you.$md$, 1, 2);
  perform app.seed_question(v_quiz, 'single_choice', $md$Why is the accelerometer set to ±8 g rather than ±2 g?$md$,
    '[{"id": "a", "text": "\u00b12 g would clip during boost, and clipped data cannot be recovered"}, {"id": "b", "text": "\u00b18 g gives better resolution"}, {"id": "c", "text": "\u00b12 g is not supported by the MPU6050"}, {"id": "d", "text": "\u00b18 g uses less power"}]'::jsonb, '{"correct": "a"}'::jsonb,
    $md$Peak boost acceleration on a mid-power motor runs around 9 g. Range is a trade against resolution, and clipping is unrecoverable while noise is not.$md$, 1, 3);
  perform app.seed_question(v_quiz, 'numeric', $md$The integrated logger samples at 1 Hz. For a flight reaching apogee in about 12 seconds, roughly how many data points does that give you on the way up?$md$,
    '[]'::jsonb, '{"value": 12, "tolerance": 2, "unit": "samples"}'::jsonb,
    $md$About twelve. Far too few to resolve boost, burnout and apogee — which is why raising the rate is the first change to make.$md$, 2, 4);
  perform app.seed_question(v_quiz, 'single_choice', $md$`bmp.readAltitude(1026.25)` — what is that argument?$md$,
    '[{"id": "a", "text": "The launch site elevation in metres"}, {"id": "b", "text": "Local sea-level pressure in hPa, which must be updated per flight"}, {"id": "c", "text": "A calibration constant fixed for the sensor"}, {"id": "d", "text": "The expected apogee in metres"}]'::jsonb, '{"correct": "b"}'::jsonb,
    $md$Local QNH in hectopascals. A 10 hPa error moves your altitude by roughly 80 m, so it is a pre-flight step, not a constant.$md$, 1, 5);

end $seed$;

-- ---------------------------------------------------------------------------
-- Retire the placeholder curriculum from 0007
-- ---------------------------------------------------------------------------
-- Unpublished rather than deleted: any learner who already enrolled keeps
-- their progress and certificate, and an admin can inspect what was replaced.
update public.courses set status = 'archived', updated_at = now()
 where slug in (select slug from public.courses)
   and slug not in ('introduction-to-space-systems', 'electrical-power-subsystem', 'onboard-computer', 'lora-for-satellite-iot', 'flight-computer-firmware')
   and status = 'published';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
-- A seed that silently drops half its content looks exactly like one that
-- worked. These counts are generated from the source data, so a mismatch
-- fails the migration rather than shipping a half-empty catalogue.
do $verify$
declare n int;
begin
  select count(*) into n from public.tracks where is_published;
  if n < 3 then raise exception 'expected >= 3 tracks, found %', n; end if;
  select count(*) into n from public.courses where status = 'published';
  if n <> 5 then raise exception 'expected 5 published courses, found %', n; end if;
  select count(*) into n from public.modules;
  if n < 11 then raise exception 'expected >= 11 modules, found %', n; end if;
  select count(*) into n from public.lessons;
  if n < 29 then raise exception 'expected >= 29 lessons, found %', n; end if;
  select count(*) into n from public.quiz_questions;
  if n < 28 then raise exception 'expected >= 28 questions, found %', n; end if;

  -- Every simulation lesson must name a sandbox, or it renders as an empty box.
  select count(*) into n from public.lessons
   where kind = 'simulation' and (simulation_key is null or simulation_key = '');
  if n > 0 then raise exception '% simulation lesson(s) have no simulation_key', n; end if;

  raise notice 'Curriculum seeded: % tracks, % courses, % modules, % lessons, % questions',
    3, 5, 11, 29, 28;
end $verify$;


-- =============================================================================
-- =============================================================================
--
--   PART 12 OF 12   0012_enrolled_access_survives_archive.sql   (5,374 bytes)
--
-- =============================================================================
-- =============================================================================

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
