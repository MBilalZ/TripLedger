-- Grants + RLS policies
-- Apply in timestamp order on an empty public schema.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant execute on function public.is_trip_member(text) to authenticated;
grant execute on function public.is_trip_owner(text) to authenticated;
grant execute on function public.join_trip_with_token(text, text) to authenticated;
grant execute on function public.create_trip_with_owner(text, text, text, text, text, text) to authenticated;
grant execute on function public.delete_trip_as_owner(text) to authenticated;
grant execute on function public.leave_trip(text) to authenticated;
grant execute on function public.create_expense_with_splits(jsonb, jsonb) to authenticated;
grant execute on function public.revise_expense_with_splits(text, jsonb, jsonb) to authenticated;
grant execute on function public.void_expense(text, text) to authenticated;
grant execute on function public.add_participant_with_pool_members(jsonb, jsonb) to authenticated;
grant execute on function public.add_pool_with_members(jsonb, jsonb) to authenticated;
grant execute on function public.remove_participant(text) to authenticated;
grant execute on function public.upsert_settlement_snapshot(text, text, jsonb, boolean, text) to authenticated;
grant execute on function public.claim_push_events(integer) to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.participants enable row level security;
alter table public.trip_members enable row level security;
alter table public.pools enable row level security;
alter table public.pool_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.adjustments enable row level security;
alter table public.trip_invites enable row level security;
alter table public.trip_settlement_snapshots enable row level security;
alter table public.rpc_rate_limits enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_events enable row level security;
-- rpc_rate_limits / push_events: no client policies (security definer / service role only).

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (user_id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (user_id = auth.uid());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (user_id = auth.uid());

drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select using (
    public.is_trip_member(id) or created_by = auth.uid()
  );
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips
  for insert with check (created_by = auth.uid());
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips
  for update using (public.is_trip_owner(id));
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips
  for delete using (public.is_trip_owner(id));

drop policy if exists trip_members_select on public.trip_members;
create policy trip_members_select on public.trip_members
  for select using (public.is_trip_member(trip_id));
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

drop policy if exists participants_select on public.participants;
create policy participants_select on public.participants
  for select using (public.is_trip_member(trip_id));
drop policy if exists participants_insert on public.participants;
create policy participants_insert on public.participants
  for insert with check (
    public.is_trip_member(trip_id)
    or exists (
      select 1 from public.trips t
      where t.id = trip_id and t.created_by = auth.uid()
    )
  );
drop policy if exists participants_update on public.participants;
create policy participants_update on public.participants
  for update using (public.is_trip_member(trip_id));
drop policy if exists participants_delete on public.participants;
create policy participants_delete on public.participants
  for delete using (public.is_trip_owner(trip_id));

drop policy if exists pools_select on public.pools;
create policy pools_select on public.pools
  for select using (public.is_trip_member(trip_id));
drop policy if exists pools_insert on public.pools;
create policy pools_insert on public.pools
  for insert with check (public.is_trip_member(trip_id));
drop policy if exists pools_update on public.pools;
create policy pools_update on public.pools
  for update using (public.is_trip_member(trip_id));
drop policy if exists pools_delete on public.pools;
create policy pools_delete on public.pools
  for delete using (public.is_trip_owner(trip_id));

drop policy if exists pool_members_select on public.pool_members;
create policy pool_members_select on public.pool_members
  for select using (public.is_trip_member(trip_id));
drop policy if exists pool_members_insert on public.pool_members;
create policy pool_members_insert on public.pool_members
  for insert with check (public.is_trip_member(trip_id));
drop policy if exists pool_members_update on public.pool_members;
create policy pool_members_update on public.pool_members
  for update using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));
drop policy if exists pool_members_delete on public.pool_members;
create policy pool_members_delete on public.pool_members
  for delete using (public.is_trip_member(trip_id));

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (public.is_trip_member(trip_id));

drop policy if exists expense_splits_select on public.expense_splits;
create policy expense_splits_select on public.expense_splits
  for select using (public.is_trip_member(trip_id));

drop policy if exists adjustments_select on public.adjustments;
create policy adjustments_select on public.adjustments
  for select using (public.is_trip_member(trip_id));
drop policy if exists adjustments_insert on public.adjustments;
create policy adjustments_insert on public.adjustments
  for insert with check (public.is_trip_member(trip_id));
drop policy if exists adjustments_update on public.adjustments;
create policy adjustments_update on public.adjustments
  for update using (public.is_trip_member(trip_id));
drop policy if exists adjustments_delete on public.adjustments;
create policy adjustments_delete on public.adjustments
  for delete using (public.is_trip_member(trip_id));

drop policy if exists invites_select on public.trip_invites;
create policy invites_select on public.trip_invites
  for select using (public.is_trip_owner(trip_id));
drop policy if exists invites_insert on public.trip_invites;
create policy invites_insert on public.trip_invites
  for insert with check (public.is_trip_owner(trip_id) and created_by = auth.uid());
drop policy if exists invites_update on public.trip_invites;
create policy invites_update on public.trip_invites
  for update using (public.is_trip_owner(trip_id));

drop policy if exists settlement_snapshots_select on public.trip_settlement_snapshots;
create policy settlement_snapshots_select on public.trip_settlement_snapshots
  for select using (public.is_trip_member(trip_id));

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

