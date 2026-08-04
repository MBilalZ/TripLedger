-- Production hardening: RBAC, integrity, money checks, atomic RPCs, join rate limits

-- ---------------------------------------------------------------------------
-- Rate limiting for join
-- ---------------------------------------------------------------------------
create table if not exists public.rpc_rate_limits (
  key text not null,
  window_start timestamptz not null,
  hit_count integer not null default 0,
  primary key (key, window_start)
);

alter table public.rpc_rate_limits enable row level security;
-- No policies: only security definer functions touch this table.

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

-- ---------------------------------------------------------------------------
-- Money: bigint + CHECKs + text length
-- ---------------------------------------------------------------------------
alter table public.expenses
  alter column amount_paisa type bigint;

alter table public.adjustments
  alter column amount_paisa type bigint;

alter table public.pool_members
  alter column exact_paisa type bigint;

alter table public.expense_splits
  alter column exact_paisa type bigint;

alter table public.trips
  drop constraint if exists trips_name_len,
  drop constraint if exists trips_transfer_mode_check,
  drop constraint if exists trips_settlement_rounding_check,
  drop constraint if exists trips_currency_check;

alter table public.trips
  add constraint trips_name_len check (char_length(trim(name)) between 1 and 120),
  add constraint trips_transfer_mode_check check (transfer_mode in ('minimize', 'settle_to_one')),
  add constraint trips_settlement_rounding_check check (settlement_rounding in ('rupee', 'none')),
  add constraint trips_currency_check check (currency = 'PKR');

alter table public.participants
  drop constraint if exists participants_display_name_len;

alter table public.participants
  add constraint participants_display_name_len
    check (char_length(trim(display_name)) between 1 and 80);

alter table public.pools
  drop constraint if exists pools_name_len,
  drop constraint if exists pools_split_mode_check;

alter table public.pools
  add constraint pools_name_len check (char_length(trim(name)) between 1 and 80),
  add constraint pools_split_mode_check
    check (split_mode in ('shares', 'equal', 'percent', 'exact'));

alter table public.expenses
  drop constraint if exists expenses_amount_positive,
  drop constraint if exists expenses_description_len,
  drop constraint if exists expenses_category_len,
  drop constraint if exists expenses_notes_len,
  drop constraint if exists expenses_split_mode_check;

alter table public.expenses
  add constraint expenses_amount_positive check (amount_paisa > 0),
  add constraint expenses_description_len check (char_length(trim(description)) between 1 and 200),
  add constraint expenses_category_len check (char_length(category) between 1 and 60),
  add constraint expenses_notes_len check (char_length(notes) <= 2000),
  add constraint expenses_split_mode_check
    check (split_mode is null or split_mode in ('shares', 'equal', 'percent', 'exact'));

alter table public.adjustments
  drop constraint if exists adjustments_amount_positive,
  drop constraint if exists adjustments_reason_len;

alter table public.adjustments
  add constraint adjustments_amount_positive check (amount_paisa > 0),
  add constraint adjustments_reason_len check (char_length(reason) <= 500);

alter table public.pool_members
  drop constraint if exists pool_members_shares_check,
  drop constraint if exists pool_members_percent_check,
  drop constraint if exists pool_members_exact_check;

alter table public.pool_members
  add constraint pool_members_shares_check check (shares >= 0),
  add constraint pool_members_percent_check check (percent_bps >= 0),
  add constraint pool_members_exact_check check (exact_paisa >= 0);

alter table public.expense_splits
  drop constraint if exists expense_splits_shares_check,
  drop constraint if exists expense_splits_percent_check,
  drop constraint if exists expense_splits_exact_check;

alter table public.expense_splits
  add constraint expense_splits_shares_check check (shares >= 0),
  add constraint expense_splits_percent_check check (percent_bps >= 0),
  add constraint expense_splits_exact_check check (exact_paisa >= 0);

-- ---------------------------------------------------------------------------
-- Soft delete + audit columns
-- ---------------------------------------------------------------------------
alter table public.participants
  add column if not exists deleted_at timestamptz,
  add column if not exists created_by uuid references auth.users (id),
  add column if not exists updated_by uuid references auth.users (id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.pools
  add column if not exists deleted_at timestamptz,
  add column if not exists created_by uuid references auth.users (id),
  add column if not exists updated_by uuid references auth.users (id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.expenses
  add column if not exists voided boolean not null default false,
  add column if not exists created_by uuid references auth.users (id),
  add column if not exists updated_by uuid references auth.users (id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.adjustments
  add column if not exists deleted_at timestamptz,
  add column if not exists created_by uuid references auth.users (id),
  add column if not exists updated_by uuid references auth.users (id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.trips
  add column if not exists settlement_generation bigint not null default 0;

-- ---------------------------------------------------------------------------
-- Settlement snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.trip_settlement_snapshots (
  trip_id text primary key references public.trips (id) on delete cascade,
  facts_hash text not null,
  result jsonb not null,
  consistency_ok boolean not null,
  computed_at timestamptz not null default now(),
  engine_version text not null default '1'
);

alter table public.trip_settlement_snapshots enable row level security;

-- ---------------------------------------------------------------------------
-- Expense receipts metadata
-- ---------------------------------------------------------------------------
create table if not exists public.expense_receipts (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  expense_id text not null references public.expenses (id) on delete cascade,
  storage_path text not null,
  content_type text not null default 'application/octet-stream',
  byte_size integer not null default 0 check (byte_size >= 0 and byte_size <= 10485760),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists expense_receipts_trip_id_idx on public.expense_receipts (trip_id);
create index if not exists expense_receipts_expense_id_idx on public.expense_receipts (expense_id);

alter table public.expense_receipts enable row level security;

-- ---------------------------------------------------------------------------
-- Cross-trip integrity helpers
-- ---------------------------------------------------------------------------
create or replace function public.assert_same_trip_participant(
  p_trip_id text,
  p_participant_id text,
  p_label text default 'participant'
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.participants p
    where p.id = p_participant_id
      and p.trip_id = p_trip_id
      and p.deleted_at is null
  ) then
    raise exception '% does not belong to this trip', p_label;
  end if;
end;
$$;

create or replace function public.assert_same_trip_pool(
  p_trip_id text,
  p_pool_id text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.pools p
    where p.id = p_pool_id
      and p.trip_id = p_trip_id
      and p.deleted_at is null
  ) then
    raise exception 'Pool does not belong to this trip';
  end if;
end;
$$;

create or replace function public.tg_expenses_same_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_same_trip_pool(new.trip_id, new.pool_id);
  perform public.assert_same_trip_participant(new.trip_id, new.paid_by_id, 'Payer');
  return new;
end;
$$;

create or replace function public.tg_expense_splits_same_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_trip text;
begin
  select trip_id into v_expense_trip from public.expenses where id = new.expense_id;
  if v_expense_trip is null or v_expense_trip <> new.trip_id then
    raise exception 'Expense split trip mismatch';
  end if;
  perform public.assert_same_trip_participant(new.trip_id, new.participant_id);
  return new;
end;
$$;

create or replace function public.tg_pool_members_same_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_same_trip_pool(new.trip_id, new.pool_id);
  perform public.assert_same_trip_participant(new.trip_id, new.participant_id);
  return new;
end;
$$;

create or replace function public.tg_adjustments_same_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_same_trip_participant(new.trip_id, new.from_id, 'From');
  perform public.assert_same_trip_participant(new.trip_id, new.to_id, 'To');
  return new;
end;
$$;

create or replace function public.tg_bump_settlement_generation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id text;
begin
  v_trip_id := coalesce(new.trip_id, old.trip_id);
  if v_trip_id is not null then
    update public.trips
    set settlement_generation = settlement_generation + 1,
        updated_at = now()
    where id = v_trip_id;
    delete from public.trip_settlement_snapshots where trip_id = v_trip_id;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.tg_block_owner_participant_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.trip_members m
    where m.participant_id = old.id and m.role = 'owner'
  ) then
    raise exception 'Cannot delete a participant linked to a trip owner';
  end if;
  return old;
end;
$$;

create or replace function public.tg_set_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;
    new.updated_by := auth.uid();
    new.updated_at := now();
  elsif tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_same_trip on public.expenses;
create trigger expenses_same_trip
  before insert or update on public.expenses
  for each row execute function public.tg_expenses_same_trip();

drop trigger if exists expense_splits_same_trip on public.expense_splits;
create trigger expense_splits_same_trip
  before insert or update on public.expense_splits
  for each row execute function public.tg_expense_splits_same_trip();

drop trigger if exists pool_members_same_trip on public.pool_members;
create trigger pool_members_same_trip
  before insert or update on public.pool_members
  for each row execute function public.tg_pool_members_same_trip();

drop trigger if exists adjustments_same_trip on public.adjustments;
create trigger adjustments_same_trip
  before insert or update on public.adjustments
  for each row execute function public.tg_adjustments_same_trip();

drop trigger if exists participants_block_owner_delete on public.participants;
create trigger participants_block_owner_delete
  before delete on public.participants
  for each row execute function public.tg_block_owner_participant_delete();

drop trigger if exists participants_audit on public.participants;
create trigger participants_audit
  before insert or update on public.participants
  for each row execute function public.tg_set_audit_fields();

drop trigger if exists pools_audit on public.pools;
create trigger pools_audit
  before insert or update on public.pools
  for each row execute function public.tg_set_audit_fields();

drop trigger if exists expenses_audit on public.expenses;
create trigger expenses_audit
  before insert or update on public.expenses
  for each row execute function public.tg_set_audit_fields();

drop trigger if exists adjustments_audit on public.adjustments;
create trigger adjustments_audit
  before insert or update on public.adjustments
  for each row execute function public.tg_set_audit_fields();

drop trigger if exists expenses_bump_settlement on public.expenses;
create trigger expenses_bump_settlement
  after insert or update or delete on public.expenses
  for each row execute function public.tg_bump_settlement_generation();

drop trigger if exists expense_splits_bump_settlement on public.expense_splits;
create trigger expense_splits_bump_settlement
  after insert or update or delete on public.expense_splits
  for each row execute function public.tg_bump_settlement_generation();

drop trigger if exists adjustments_bump_settlement on public.adjustments;
create trigger adjustments_bump_settlement
  after insert or update or delete on public.adjustments
  for each row execute function public.tg_bump_settlement_generation();

drop trigger if exists pools_bump_settlement on public.pools;
create trigger pools_bump_settlement
  after insert or update or delete on public.pools
  for each row execute function public.tg_bump_settlement_generation();

drop trigger if exists pool_members_bump_settlement on public.pool_members;
create trigger pool_members_bump_settlement
  after insert or update or delete on public.pool_members
  for each row execute function public.tg_bump_settlement_generation();

drop trigger if exists participants_bump_settlement on public.participants;
create trigger participants_bump_settlement
  after insert or update or delete on public.participants
  for each row execute function public.tg_bump_settlement_generation();

drop trigger if exists trips_settings_bump_settlement on public.trips;
create or replace function public.tg_trips_settings_bump_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.transfer_mode is distinct from new.transfer_mode
     or old.settlement_rounding is distinct from new.settlement_rounding
     or old.settlement_hub_id is distinct from new.settlement_hub_id then
    new.settlement_generation := old.settlement_generation + 1;
    delete from public.trip_settlement_snapshots where trip_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trips_settings_bump_settlement
  before update on public.trips
  for each row execute function public.tg_trips_settings_bump_settlement();

-- ---------------------------------------------------------------------------
-- Join RPC: caps, rate limit, name length
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
      true, 1, 0, 0
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

-- ---------------------------------------------------------------------------
-- Atomic RPCs
-- ---------------------------------------------------------------------------
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

  insert into public.trips (
    id, name, currency, transfer_mode, settlement_rounding,
    settlement_hub_id, created_by
  ) values (
    p_trip_id, v_name, 'PKR', p_transfer_mode, p_settlement_rounding,
    null, v_uid
  );

  insert into public.participants (id, trip_id, display_name, user_id, created_by)
  values (p_participant_id, p_trip_id, v_owner, v_uid, v_uid);

  insert into public.trip_members (trip_id, user_id, participant_id, role)
  values (p_trip_id, v_uid, p_participant_id, 'owner');

  return jsonb_build_object(
    'trip_id', p_trip_id,
    'participant_id', p_participant_id
  );
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

grant execute on function public.create_trip_with_owner(text, text, text, text, text, text) to authenticated;
grant execute on function public.create_expense_with_splits(jsonb, jsonb) to authenticated;
grant execute on function public.revise_expense_with_splits(text, jsonb, jsonb) to authenticated;
grant execute on function public.add_participant_with_pool_members(jsonb, jsonb) to authenticated;
grant execute on function public.void_expense(text, text) to authenticated;
grant execute on function public.upsert_settlement_snapshot(text, text, jsonb, boolean, text) to authenticated;
grant execute on function public.join_trip_with_token(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS policy updates
-- ---------------------------------------------------------------------------
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips
  for update using (public.is_trip_owner(id));

drop policy if exists trip_members_insert_owner on public.trip_members;
create policy trip_members_insert_owner on public.trip_members
  for insert with check (
    public.is_trip_owner(trip_id)
    and role = 'member'
  );

drop policy if exists trip_members_delete on public.trip_members;
create policy trip_members_delete on public.trip_members
  for delete using (
    public.is_trip_owner(trip_id)
    or user_id = auth.uid()
  );

-- Prevent sole owner from leaving via a constraint trigger on delete
create or replace function public.tg_prevent_sole_owner_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_count integer;
begin
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

drop trigger if exists trip_members_prevent_sole_owner_leave on public.trip_members;
create trigger trip_members_prevent_sole_owner_leave
  before delete on public.trip_members
  for each row execute function public.tg_prevent_sole_owner_leave();

drop policy if exists participants_delete on public.participants;
create policy participants_delete on public.participants
  for delete using (public.is_trip_owner(trip_id));

drop policy if exists invites_select on public.trip_invites;
create policy invites_select on public.trip_invites
  for select using (public.is_trip_owner(trip_id));

drop policy if exists settlement_snapshots_select on public.trip_settlement_snapshots;
create policy settlement_snapshots_select on public.trip_settlement_snapshots
  for select using (public.is_trip_member(trip_id));

drop policy if exists expense_receipts_select on public.expense_receipts;
create policy expense_receipts_select on public.expense_receipts
  for select using (public.is_trip_member(trip_id));

drop policy if exists expense_receipts_insert on public.expense_receipts;
create policy expense_receipts_insert on public.expense_receipts
  for insert with check (
    public.is_trip_member(trip_id) and created_by = auth.uid()
  );

drop policy if exists expense_receipts_delete on public.expense_receipts;
create policy expense_receipts_delete on public.expense_receipts
  for delete using (
    public.is_trip_owner(trip_id) or created_by = auth.uid()
  );

-- Soft-delete aware selects: filter deleted in app; allow members to update soft-delete fields
drop policy if exists participants_select on public.participants;
create policy participants_select on public.participants
  for select using (public.is_trip_member(trip_id));

drop policy if exists pools_all on public.pools;
create policy pools_select on public.pools
  for select using (public.is_trip_member(trip_id));
create policy pools_insert on public.pools
  for insert with check (public.is_trip_member(trip_id));
create policy pools_update on public.pools
  for update using (public.is_trip_member(trip_id));
create policy pools_delete on public.pools
  for delete using (public.is_trip_owner(trip_id));

drop policy if exists adjustments_all on public.adjustments;
create policy adjustments_select on public.adjustments
  for select using (public.is_trip_member(trip_id));
create policy adjustments_insert on public.adjustments
  for insert with check (public.is_trip_member(trip_id));
create policy adjustments_update on public.adjustments
  for update using (public.is_trip_member(trip_id));
create policy adjustments_delete on public.adjustments
  for delete using (public.is_trip_member(trip_id));

-- Storage bucket for receipts (private)
insert into storage.buckets (id, name, public, file_size_limit)
values ('receipts', 'receipts', false, 5242880)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists receipts_storage_select on storage.objects;
create policy receipts_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_trip_member((storage.foldername(name))[1])
  );

drop policy if exists receipts_storage_insert on storage.objects;
create policy receipts_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.is_trip_member((storage.foldername(name))[1])
  );

drop policy if exists receipts_storage_delete on storage.objects;
create policy receipts_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (
      public.is_trip_owner((storage.foldername(name))[1])
      or owner = auth.uid()
    )
  );

do $$ begin
  alter publication supabase_realtime add table public.trip_settlement_snapshots;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.expense_receipts;
exception when duplicate_object then null;
end $$;
