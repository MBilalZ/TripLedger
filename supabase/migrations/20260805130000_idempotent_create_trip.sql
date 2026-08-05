-- Idempotent create_trip_with_owner for outbox retries (same client trip id).

create or replace function public.create_trip_with_owner(
  p_trip_id text,
  p_name text,
  p_participant_id text,
  p_owner_display_name text,
  p_transfer_mode text default 'minimize',
  p_settlement_rounding text default 'rupee'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(p_name);
  v_owner text := trim(p_owner_display_name);
  v_existing public.trips%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Trip name must be 1–120 characters';
  end if;
  if char_length(v_owner) < 1 or char_length(v_owner) > 80 then
    raise exception 'Display name must be 1–80 characters';
  end if;
  if p_transfer_mode not in ('minimize', 'settle_to_one') then
    raise exception 'Invalid transfer mode';
  end if;
  if p_settlement_rounding not in ('rupee', 'none') then
    raise exception 'Invalid settlement rounding';
  end if;

  select * into v_existing from public.trips where id = p_trip_id;
  if found then
    if not public.is_trip_member(p_trip_id) then
      raise exception 'Trip id already exists';
    end if;
    return jsonb_build_object(
      'trip_id', p_trip_id,
      'participant_id', p_participant_id,
      'idempotent', true
    );
  end if;

  insert into public.trips (
    id, name, currency, transfer_mode, settlement_rounding,
    settlement_hub_id, created_by
  ) values (
    p_trip_id, v_name, 'PKR', p_transfer_mode, p_settlement_rounding,
    null, v_uid
  );

  insert into public.participants (id, trip_id, display_name, user_id, created_by)
  values (p_participant_id, p_trip_id, v_owner, v_uid, v_uid)
  on conflict (id) do update set
    display_name = excluded.display_name,
    user_id = coalesce(public.participants.user_id, excluded.user_id),
    updated_by = v_uid,
    updated_at = now();

  insert into public.trip_members (trip_id, user_id, participant_id, role)
  values (p_trip_id, v_uid, p_participant_id, 'owner')
  on conflict (trip_id, user_id) do update set
    participant_id = excluded.participant_id,
    role = excluded.role;

  return jsonb_build_object(
    'trip_id', p_trip_id,
    'participant_id', p_participant_id
  );
end;
$$;

grant execute on function public.create_trip_with_owner(text, text, text, text, text, text) to authenticated;
