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
