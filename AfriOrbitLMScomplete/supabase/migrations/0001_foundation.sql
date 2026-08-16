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
