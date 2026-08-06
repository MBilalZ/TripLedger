-- Push enqueue helpers and triggers
-- Apply in timestamp order on an empty public schema.

-- ---------------------------------------------------------------------------
-- Push enqueue helpers + triggers
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_trip_push_event(
  p_trip_id text,
  p_event_type text,
  p_title text,
  p_body text,
  p_actor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_events (
    trip_id, event_type, actor_user_id, title, body
  ) values (
    p_trip_id, p_event_type, p_actor_user_id, p_title, p_body
  );
end;
$$;

create or replace function public.trg_push_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip text;
  v_name text;
  v_desc text;
begin
  v_trip := coalesce(new.trip_id, old.trip_id);
  select name into v_name from public.trips where id = v_trip;
  v_desc := coalesce(new.description, 'Expense');
  perform public.enqueue_trip_push_event(
    v_trip,
    'expense',
    coalesce(v_name, 'TripLedger'),
    'New expense: ' || left(v_desc, 80),
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists expenses_push_notify on public.expenses;
create trigger expenses_push_notify
  after insert on public.expenses
  for each row
  execute function public.trg_push_expense();

create or replace function public.trg_push_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.trips where id = new.trip_id;
  perform public.enqueue_trip_push_event(
    new.trip_id,
    'member',
    coalesce(v_name, 'TripLedger'),
    'A member joined the trip',
    new.user_id
  );
  return new;
end;
$$;

drop trigger if exists trip_members_push_notify on public.trip_members;
create trigger trip_members_push_notify
  after insert on public.trip_members
  for each row
  execute function public.trg_push_member();

create or replace function public.trg_push_adjustment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.trips where id = new.trip_id;
  perform public.enqueue_trip_push_event(
    new.trip_id,
    'adjustment',
    coalesce(v_name, 'TripLedger'),
    'Adjustment added',
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists adjustments_push_notify on public.adjustments;
create trigger adjustments_push_notify
  after insert on public.adjustments
  for each row
  execute function public.trg_push_adjustment();

create or replace function public.trg_push_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.trips where id = new.trip_id;
  perform public.enqueue_trip_push_event(
    new.trip_id,
    'settlement',
    coalesce(v_name, 'TripLedger'),
    'Settlement updated',
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists settlement_push_notify on public.trip_settlement_snapshots;
create trigger settlement_push_notify
  after insert or update on public.trip_settlement_snapshots
  for each row
  execute function public.trg_push_settlement();

