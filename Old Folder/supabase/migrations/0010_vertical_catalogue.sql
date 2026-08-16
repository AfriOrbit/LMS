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
