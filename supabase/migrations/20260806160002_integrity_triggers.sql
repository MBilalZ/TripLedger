-- Integrity helpers and table triggers
-- Apply in timestamp order on an empty public schema.

-- ---------------------------------------------------------------------------
-- Integrity helpers + triggers
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
create trigger trips_settings_bump_settlement
  before update on public.trips
  for each row execute function public.tg_trips_settings_bump_settlement();

drop trigger if exists trip_members_prevent_sole_owner_leave on public.trip_members;
create trigger trip_members_prevent_sole_owner_leave
  before delete on public.trip_members
  for each row execute function public.tg_prevent_sole_owner_leave();

