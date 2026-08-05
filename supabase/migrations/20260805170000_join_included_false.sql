-- Join grants trip access only. New members stay out of cost splits until
-- included under Pools (shares=1 remains as dormant default for SplitMatrix).

create or replace function public.join_trip_with_token(
  p_token text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.trip_invites%rowtype;
  v_participant_id text;
  v_pool record;
  v_name text := trim(p_display_name);
  v_member_count integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'Display name must be 1–80 characters';
  end if;

  perform public.check_rate_limit('join:' || v_uid::text, 10, 3600);

  select * into v_invite
  from public.trip_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'Invite has been revoked';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Invite has expired';
  end if;

  if exists (
    select 1 from public.trip_members
    where trip_id = v_invite.trip_id and user_id = v_uid
  ) then
    return jsonb_build_object(
      'trip_id', v_invite.trip_id,
      'already_member', true
    );
  end if;

  select count(*) into v_member_count
  from public.trip_members
  where trip_id = v_invite.trip_id;

  if v_member_count >= 50 then
    raise exception 'Trip is full (max 50 members)';
  end if;

  v_participant_id := 'p_' || gen_random_uuid()::text;

  insert into public.participants (id, trip_id, display_name, user_id, created_by)
  values (v_participant_id, v_invite.trip_id, v_name, v_uid, v_uid);

  insert into public.trip_members (trip_id, user_id, participant_id, role)
  values (v_invite.trip_id, v_uid, v_participant_id, 'member');

  update public.profiles
  set display_name = v_name
  where user_id = v_uid;

  for v_pool in
    select id from public.pools
    where trip_id = v_invite.trip_id and deleted_at is null
  loop
    insert into public.pool_members (
      id, trip_id, pool_id, participant_id, included, shares, percent_bps, exact_paisa
    ) values (
      'pm_' || gen_random_uuid()::text,
      v_invite.trip_id,
      v_pool.id,
      v_participant_id,
      false, 1, 0, 0
    )
    on conflict (pool_id, participant_id) do nothing;
  end loop;

  update public.trips set updated_at = now() where id = v_invite.trip_id;

  return jsonb_build_object(
    'trip_id', v_invite.trip_id,
    'participant_id', v_participant_id,
    'already_member', false
  );
end;
$$;
