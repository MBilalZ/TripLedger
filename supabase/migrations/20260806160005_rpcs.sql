-- Application RPCs
-- Apply in timestamp order on an empty public schema.

-- ---------------------------------------------------------------------------
-- RPCs (final versions)
-- ---------------------------------------------------------------------------

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

create or replace function public.create_expense_with_splits(
  p_expense jsonb,
  p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id text := p_expense->>'trip_id';
  v_split jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_trip_member(v_trip_id) then
    raise exception 'Not a trip member';
  end if;

  insert into public.expenses (
    id, trip_id, pool_id, description, category, amount_paisa,
    paid_by_id, date, notes, superseded_by_id, split_mode, voided, created_by
  ) values (
    p_expense->>'id',
    v_trip_id,
    p_expense->>'pool_id',
    p_expense->>'description',
    coalesce(p_expense->>'category', 'Misc'),
    (p_expense->>'amount_paisa')::bigint,
    p_expense->>'paid_by_id',
    p_expense->>'date',
    coalesce(p_expense->>'notes', ''),
    p_expense->>'superseded_by_id',
    nullif(p_expense->>'split_mode', ''),
    coalesce((p_expense->>'voided')::boolean, false),
    auth.uid()
  );

  for v_split in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb))
  loop
    insert into public.expense_splits (
      id, trip_id, expense_id, participant_id, included, shares, percent_bps, exact_paisa
    ) values (
      v_split->>'id',
      v_trip_id,
      v_split->>'expense_id',
      v_split->>'participant_id',
      coalesce((v_split->>'included')::boolean, true),
      coalesce((v_split->>'shares')::integer, 1),
      coalesce((v_split->>'percent_bps')::integer, 0),
      coalesce((v_split->>'exact_paisa')::bigint, 0)
    );
  end loop;
end;
$$;

create or replace function public.revise_expense_with_splits(
  p_old_expense_id text,
  p_expense jsonb,
  p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id text := p_expense->>'trip_id';
  v_split jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_trip_member(v_trip_id) then
    raise exception 'Not a trip member';
  end if;

  if not exists (
    select 1 from public.expenses e
    where e.id = p_old_expense_id and e.trip_id = v_trip_id
  ) then
    raise exception 'Expense not found';
  end if;

  insert into public.expenses (
    id, trip_id, pool_id, description, category, amount_paisa,
    paid_by_id, date, notes, superseded_by_id, split_mode, voided, created_by
  ) values (
    p_expense->>'id',
    v_trip_id,
    p_expense->>'pool_id',
    p_expense->>'description',
    coalesce(p_expense->>'category', 'Misc'),
    (p_expense->>'amount_paisa')::bigint,
    p_expense->>'paid_by_id',
    p_expense->>'date',
    coalesce(p_expense->>'notes', ''),
    null,
    nullif(p_expense->>'split_mode', ''),
    false,
    auth.uid()
  );

  update public.expenses
  set superseded_by_id = p_expense->>'id',
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_old_expense_id;

  delete from public.expense_splits where expense_id = p_old_expense_id;

  for v_split in select * from jsonb_array_elements(coalesce(p_splits, '[]'::jsonb))
  loop
    insert into public.expense_splits (
      id, trip_id, expense_id, participant_id, included, shares, percent_bps, exact_paisa
    ) values (
      v_split->>'id',
      v_trip_id,
      v_split->>'expense_id',
      v_split->>'participant_id',
      coalesce((v_split->>'included')::boolean, true),
      coalesce((v_split->>'shares')::integer, 1),
      coalesce((v_split->>'percent_bps')::integer, 0),
      coalesce((v_split->>'exact_paisa')::bigint, 0)
    );
  end loop;
end;
$$;

create or replace function public.void_expense(
  p_expense_id text,
  p_trip_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_trip_member(p_trip_id) then
    raise exception 'Not a trip member';
  end if;

  update public.expenses
  set voided = true,
      superseded_by_id = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_expense_id and trip_id = p_trip_id;

  delete from public.expense_splits where expense_id = p_expense_id;
end;
$$;

create or replace function public.add_participant_with_pool_members(
  p_participant jsonb,
  p_members jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id text := p_participant->>'trip_id';
  v_member jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_trip_member(v_trip_id) then
    raise exception 'Not a trip member';
  end if;

  insert into public.participants (id, trip_id, display_name, user_id, created_by)
  values (
    p_participant->>'id',
    v_trip_id,
    trim(p_participant->>'display_name'),
    nullif(p_participant->>'user_id', '')::uuid,
    auth.uid()
  );

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
    );
  end loop;
end;
$$;

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

create or replace function public.remove_participant(p_participant_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select trip_id into v_trip_id
  from public.participants
  where id = p_participant_id and deleted_at is null;

  if v_trip_id is null then
    raise exception 'Participant not found';
  end if;

  if not public.is_trip_member(v_trip_id) then
    raise exception 'Not a trip member';
  end if;

  delete from public.pool_members where participant_id = p_participant_id;
  delete from public.expense_splits where participant_id = p_participant_id;
  delete from public.trip_members where participant_id = p_participant_id;

  update public.participants
  set deleted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_participant_id;
end;
$$;

create or replace function public.upsert_settlement_snapshot(
  p_trip_id text,
  p_facts_hash text,
  p_result jsonb,
  p_consistency_ok boolean,
  p_engine_version text default '1'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_trip_member(p_trip_id) then
    raise exception 'Not a trip member';
  end if;

  insert into public.trip_settlement_snapshots (
    trip_id, facts_hash, result, consistency_ok, computed_at, engine_version
  ) values (
    p_trip_id, p_facts_hash, p_result, p_consistency_ok, now(), p_engine_version
  )
  on conflict (trip_id) do update set
    facts_hash = excluded.facts_hash,
    result = excluded.result,
    consistency_ok = excluded.consistency_ok,
    computed_at = excluded.computed_at,
    engine_version = excluded.engine_version;
end;
$$;

create or replace function public.claim_push_events(p_limit integer default 50)
returns setof public.push_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select e.id
    from public.push_events e
    where e.processed_at is null
    order by e.created_at
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  update public.push_events e
  set processed_at = now()
  from claimed
  where e.id = claimed.id
  returning e.*;
end;
$$;

