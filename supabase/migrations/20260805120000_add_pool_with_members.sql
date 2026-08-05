-- Atomic pool create with members (idempotent upserts for outbox retries).

create or replace function public.add_pool_with_members(
  p_pool jsonb,
  p_members jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id text := p_pool->>'trip_id';
  v_member jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_trip_member(v_trip_id) then
    raise exception 'Not a trip member';
  end if;

  insert into public.pools (id, trip_id, name, split_mode, created_by)
  values (
    p_pool->>'id',
    v_trip_id,
    trim(p_pool->>'name'),
    coalesce(nullif(p_pool->>'split_mode', ''), 'shares'),
    auth.uid()
  )
  on conflict (id) do update set
    name = excluded.name,
    split_mode = excluded.split_mode,
    deleted_at = null,
    updated_by = auth.uid(),
    updated_at = now();

  for v_member in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb))
  loop
    insert into public.pool_members (
      id, trip_id, pool_id, participant_id, included, shares, percent_bps, exact_paisa
    ) values (
      v_member->>'id',
      v_trip_id,
      v_member->>'pool_id',
      v_member->>'participant_id',
      coalesce((v_member->>'included')::boolean, true),
      coalesce((v_member->>'shares')::integer, 1),
      coalesce((v_member->>'percent_bps')::integer, 0),
      coalesce((v_member->>'exact_paisa')::bigint, 0)
    )
    on conflict (id) do update set
      included = excluded.included,
      shares = excluded.shares,
      percent_bps = excluded.percent_bps,
      exact_paisa = excluded.exact_paisa;
  end loop;
end;
$$;

grant execute on function public.add_pool_with_members(jsonb, jsonb) to authenticated;
