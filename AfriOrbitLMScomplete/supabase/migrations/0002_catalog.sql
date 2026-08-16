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
