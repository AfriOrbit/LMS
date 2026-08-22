-- ============================================================================
-- Registration monitoring — paste any block into the Supabase SQL editor.
--
-- WHERE REGISTRATION DATA ACTUALLY GOES
--
-- A signup writes to TWO tables, and knowing which is which saves a lot of
-- confusion:
--
--   auth.users      Supabase's own table. Email, hashed password, email
--                   confirmation timestamp, MFA factors. Managed entirely by
--                   Supabase Auth — never write to it directly.
--
--   public.profiles Ours. Created automatically by the app.handle_new_user()
--                   trigger the instant a row lands in auth.users, carrying the
--                   name, organisation, country and job title the person typed
--                   on the form. This is the table to read, edit and report on.
--
-- The trigger also decides the starting role: the very FIRST account ever
-- created becomes admin/active so the instance is never left without an owner.
-- Everyone after that starts learner/pending.
--
-- A third table, public.audit_log, records the 'auth.register' event with a
-- SALTED HASH of the IP rather than the address itself — useful for incident
-- review without becoming a database of learners' home addresses. That hash is
-- derived from IP_HASH_SALT; change the salt and old hashes stop matching.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Who registered, most recent first. The everyday view.
-- ---------------------------------------------------------------------------
select
  p.created_at                                    as registered_at,
  p.full_name,
  p.email,
  p.organization,
  p.country,
  p.job_title,
  p.role,
  p.status,
  u.email_confirmed_at is not null                as email_confirmed,
  p.mfa_enabled,
  p.last_seen_at
from public.profiles p
join auth.users u on u.id = p.id
order by p.created_at desc
limit 100;


-- ---------------------------------------------------------------------------
-- 2. Waiting on you.
--
-- With REGISTRATION_MODE=approval (the default) a new account sits at
-- 'pending' until an admin activates it. Nobody is emailed about this
-- automatically, so this query is the queue — check it, or people wait
-- indefinitely without knowing why.
-- ---------------------------------------------------------------------------
select
  p.created_at as registered_at,
  now() - p.created_at as waiting_for,
  p.full_name,
  p.email,
  p.organization,
  p.country,
  u.email_confirmed_at is not null as email_confirmed
from public.profiles p
join auth.users u on u.id = p.id
where p.status = 'pending'
order by p.created_at;


-- ---------------------------------------------------------------------------
-- 3. Signups per day for the last 30 days, with the drop-off.
--
-- `confirmed` counts people who clicked the link in the email. A large gap
-- between the two columns means the confirmation email is not arriving — check
-- Supabase → Authentication → Emails, and the Redirect URLs, before assuming
-- people simply lost interest.
-- ---------------------------------------------------------------------------
select
  date_trunc('day', p.created_at)::date            as day,
  count(*)                                         as registered,
  count(*) filter (where u.email_confirmed_at is not null) as confirmed,
  count(*) filter (where p.status = 'active')      as activated
from public.profiles p
join auth.users u on u.id = p.id
where p.created_at > now() - interval '30 days'
group by 1
order by 1 desc;


-- ---------------------------------------------------------------------------
-- 4. Stuck at the email step for more than 24 hours.
--
-- These people registered and never confirmed. Usually a deliverability
-- problem rather than a change of mind, especially if they cluster on one
-- email domain.
-- ---------------------------------------------------------------------------
select
  p.created_at as registered_at,
  p.email,
  split_part(p.email::text, '@', 2) as email_domain,
  p.full_name
from public.profiles p
join auth.users u on u.id = p.id
where u.email_confirmed_at is null
  and p.created_at < now() - interval '24 hours'
order by p.created_at desc;


-- ---------------------------------------------------------------------------
-- 5. Where they are coming from.
-- ---------------------------------------------------------------------------
select
  coalesce(nullif(trim(country), ''), '(not given)')      as country,
  coalesce(nullif(trim(organization), ''), '(not given)') as organization,
  count(*) as people
from public.profiles
group by 1, 2
order by people desc, country
limit 50;


-- ---------------------------------------------------------------------------
-- 6. One person's full story — registration through to certificates.
--    Replace the address.
-- ---------------------------------------------------------------------------
select
  p.*,
  u.email_confirmed_at,
  u.last_sign_in_at,
  (select count(*) from public.enrollments  e where e.user_id = p.id) as enrolments,
  (select count(*) from public.certificates c where c.user_id = p.id) as certificates
from public.profiles p
join auth.users u on u.id = p.id
where p.email = 'someone@example.org';


-- ---------------------------------------------------------------------------
-- 7. The audit trail for registrations.
--
-- ip_hash is a salted hash, not an address. Two rows sharing a hash came from
-- the same IP, which is what you want for spotting a burst of fake signups —
-- but the address itself is not recoverable from it, by design.
-- ---------------------------------------------------------------------------
select
  created_at,
  actor_email,
  action,
  ip_hash,
  metadata
from public.audit_log
where action = 'auth.register'
order by created_at desc
limit 100;


-- ---------------------------------------------------------------------------
-- 8. Approve someone.
--
-- Prefer Admin → Users in the app: it writes an audit entry and this does not.
-- Use this only when the app is unreachable.
-- ---------------------------------------------------------------------------
-- update public.profiles
--    set status = 'active', approved_at = now()
--  where email = 'someone@example.org';
