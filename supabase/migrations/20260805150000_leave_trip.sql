-- Leave group: promote another owner when needed, or delete the trip if last member.

-- Direct membership deletes must not remove the sole owner except via leave_trip /
-- delete_trip_as_owner (which set tripledger.deleting_trip).
create or replace function public.tg_prevent_sole_owner_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_count integer;
  v_other_count integer;
begin
  if current_setting('tripledger.deleting_trip', true) = old.trip_id then
    return old;
  end if;

  -- leave_trip promotes before deleting the owner row; allow when another owner exists
  -- or when this delete is not an owner row.
  if old.role = 'owner' then
    select count(*) into v_owner_count
    from public.trip_members
    where trip_id = old.trip_id and role = 'owner' and user_id <> old.user_id;
    if v_owner_count = 0 then
      select count(*) into v_other_count
      from public.trip_members
      where trip_id = old.trip_id and user_id <> old.user_id;
      if v_other_count > 0 then
        raise exception 'Owner must transfer ownership before leaving';
      end if;
      -- Last member: only leave_trip (which deletes the trip) or delete_trip_as_owner
      -- should tear down. Block raw DELETE of the sole membership row.
      if current_setting('tripledger.leaving_trip', true) is distinct from old.trip_id then
        raise exception 'Sole owner cannot leave the trip';
      end if;
    end if;
  end if;
  return old;
end;
$$;

create or replace function public.leave_trip(p_trip_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_other_count integer;
  v_promote uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.role into v_role
  from public.trip_members m
  where m.trip_id = p_trip_id and m.user_id = v_uid;

  if v_role is null then
    -- Already left / no access — idempotent for outbox retries.
    if not exists (select 1 from public.trips t where t.id = p_trip_id) then
      return jsonb_build_object('action', 'deleted');
    end if;
    return jsonb_build_object('action', 'left');
  end if;

  select count(*) into v_other_count
  from public.trip_members
  where trip_id = p_trip_id and user_id <> v_uid;

  if v_other_count = 0 then
    perform set_config('tripledger.deleting_trip', p_trip_id, true);
    perform set_config('tripledger.leaving_trip', p_trip_id, true);
    delete from public.trips where id = p_trip_id;
    return jsonb_build_object('action', 'deleted');
  end if;

  if v_role = 'owner' then
    select m.user_id into v_promote
    from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id <> v_uid
    order by m.joined_at asc, m.user_id asc
    limit 1;

    if v_promote is null then
      raise exception 'No member available to promote';
    end if;

    update public.trip_members
    set role = 'owner'
    where trip_id = p_trip_id and user_id = v_promote;

    perform set_config('tripledger.leaving_trip', p_trip_id, true);
    delete from public.trip_members
    where trip_id = p_trip_id and user_id = v_uid;

    return jsonb_build_object(
      'action', 'left',
      'promoted_user_id', v_promote
    );
  end if;

  perform set_config('tripledger.leaving_trip', p_trip_id, true);
  delete from public.trip_members
  where trip_id = p_trip_id and user_id = v_uid;

  return jsonb_build_object('action', 'left');
end;
$$;

grant execute on function public.leave_trip(text) to authenticated;
