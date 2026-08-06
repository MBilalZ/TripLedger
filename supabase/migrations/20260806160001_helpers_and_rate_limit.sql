-- RLS helper functions + rate limiting
-- Apply in timestamp order on an empty public schema.

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_trip_member(p_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_owner(p_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------

create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer default 3600
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  insert into public.rpc_rate_limits (key, window_start, hit_count)
  values (p_key, v_window, 1)
  on conflict (key, window_start)
  do update set hit_count = public.rpc_rate_limits.hit_count + 1
  returning hit_count into v_count;

  if v_count > p_max then
    raise exception 'RATE_LIMIT: Too many attempts. Try again later.';
  end if;
end;
$$;

