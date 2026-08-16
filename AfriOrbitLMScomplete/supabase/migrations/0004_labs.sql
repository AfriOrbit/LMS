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
