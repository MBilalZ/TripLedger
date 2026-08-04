-- Web Push subscriptions + event outbox for trip activity notifications

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.push_events (
  id bigint generated always as identity primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'expense',
      'member',
      'adjustment',
      'settlement'
    )
  ),
  actor_user_id uuid,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists push_events_unprocessed_idx
  on public.push_events (created_at)
  where processed_at is null;

alter table public.push_events enable row level security;
-- No client policies: only security definer / service role.

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

-- Drain helper for edge function (service role)
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

grant execute on function public.claim_push_events(integer) to service_role;
