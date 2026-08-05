-- Exact email existence for auth-sign-in (service_role only).
-- Avoids GoTrue admin listUsers false positives / pagination gaps.

create or replace function public.auth_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = auth, public
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
  );
$$;

revoke all on function public.auth_email_exists(text) from public;
revoke all on function public.auth_email_exists(text) from anon;
revoke all on function public.auth_email_exists(text) from authenticated;
grant execute on function public.auth_email_exists(text) to service_role;
