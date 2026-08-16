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
