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
