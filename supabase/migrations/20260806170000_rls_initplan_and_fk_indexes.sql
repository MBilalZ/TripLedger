-- Fix Supabase database linter findings:
-- 1) auth_rls_initplan: wrap auth.uid() in (select auth.uid()) for RLS
-- 2) unindexed_foreign_keys: add covering indexes on FK columns
-- Unused-index INFO findings are intentionally left alone.

-- ---------------------------------------------------------------------------
-- RLS helpers: initplan-friendly auth.uid()
-- ---------------------------------------------------------------------------

create or replace function public.is_trip_member(p_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_trip_owner(p_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS policies flagged by auth_rls_initplan
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (user_id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (user_id = (select auth.uid()));
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (user_id = (select auth.uid()));

drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select using (
    public.is_trip_member(id) or created_by = (select auth.uid())
  );
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips
  for insert with check (created_by = (select auth.uid()));

drop policy if exists trip_members_delete on public.trip_members;
create policy trip_members_delete on public.trip_members
  for delete using (
    public.is_trip_owner(trip_id)
    or user_id = (select auth.uid())
  );

drop policy if exists participants_insert on public.participants;
create policy participants_insert on public.participants
  for insert with check (
    public.is_trip_member(trip_id)
    or exists (
      select 1 from public.trips t
      where t.id = trip_id and t.created_by = (select auth.uid())
    )
  );

drop policy if exists invites_insert on public.trip_invites;
create policy invites_insert on public.trip_invites
  for insert with check (public.is_trip_owner(trip_id) and created_by = (select auth.uid()));

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Covering indexes for unindexed foreign keys
-- ---------------------------------------------------------------------------

create index if not exists adjustments_created_by_idx on public.adjustments (created_by);
create index if not exists adjustments_from_id_idx on public.adjustments (from_id);
create index if not exists adjustments_to_id_idx on public.adjustments (to_id);
create index if not exists adjustments_updated_by_idx on public.adjustments (updated_by);

create index if not exists expense_splits_participant_id_idx on public.expense_splits (participant_id);
create index if not exists expense_splits_trip_id_idx on public.expense_splits (trip_id);

create index if not exists expenses_created_by_idx on public.expenses (created_by);
create index if not exists expenses_paid_by_id_idx on public.expenses (paid_by_id);
create index if not exists expenses_pool_id_idx on public.expenses (pool_id);
create index if not exists expenses_updated_by_idx on public.expenses (updated_by);

create index if not exists participants_created_by_idx on public.participants (created_by);
create index if not exists participants_updated_by_idx on public.participants (updated_by);
create index if not exists participants_user_id_idx on public.participants (user_id);

create index if not exists pool_members_participant_id_idx on public.pool_members (participant_id);
create index if not exists pool_members_trip_id_idx on public.pool_members (trip_id);

create index if not exists pools_created_by_idx on public.pools (created_by);
create index if not exists pools_updated_by_idx on public.pools (updated_by);

create index if not exists push_events_trip_id_idx on public.push_events (trip_id);

create index if not exists trip_invites_created_by_idx on public.trip_invites (created_by);

create index if not exists trip_members_participant_id_idx on public.trip_members (participant_id);
create index if not exists trip_members_user_id_idx on public.trip_members (user_id);

create index if not exists trips_created_by_idx on public.trips (created_by);
