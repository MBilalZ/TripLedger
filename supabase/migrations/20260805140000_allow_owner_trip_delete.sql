-- Allow hard-deleting a trip (CASCADE) without sole-owner / owner-participant triggers blocking.

create or replace function public.tg_block_owner_participant_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Whole-trip teardown sets this GUC for the transaction.
  if current_setting('tripledger.deleting_trip', true) = old.trip_id then
    return old;
  end if;
  if exists (
    select 1 from public.trip_members m
    where m.participant_id = old.id and m.role = 'owner'
  ) then
    raise exception 'Cannot delete a participant linked to a trip owner';
  end if;
  return old;
end;
$$;

create or replace function public.tg_prevent_sole_owner_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_count integer;
begin
  if current_setting('tripledger.deleting_trip', true) = old.trip_id then
    return old;
  end if;
  if old.role = 'owner' then
    select count(*) into v_owner_count
    from public.trip_members
    where trip_id = old.trip_id and role = 'owner' and user_id <> old.user_id;
    if v_owner_count = 0 then
      raise exception 'Sole owner cannot leave the trip';
    end if;
  end if;
  return old;
end;
$$;

create or replace function public.delete_trip_as_owner(p_trip_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_trip_owner(p_trip_id) then
    raise exception 'Only the owner can delete this trip';
  end if;

  perform set_config('tripledger.deleting_trip', p_trip_id, true);
  delete from public.trips where id = p_trip_id;
end;
$$;

grant execute on function public.delete_trip_as_owner(text) to authenticated;
