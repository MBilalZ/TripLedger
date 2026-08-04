-- Tighten money-table RLS: expenses / expense_splits are member-SELECT only;
-- writes go through security-definer RPCs. pool_members keeps member CRUD
-- (pool editing) but uses explicit policies instead of FOR ALL.

-- ---------------------------------------------------------------------------
-- expenses / expense_splits: SELECT only for members
-- ---------------------------------------------------------------------------
drop policy if exists expenses_all on public.expenses;
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (public.is_trip_member(trip_id));

drop policy if exists expense_splits_all on public.expense_splits;
drop policy if exists expense_splits_select on public.expense_splits;
create policy expense_splits_select on public.expense_splits
  for select using (public.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- pool_members: explicit member CRUD (still required for pool editing)
-- ---------------------------------------------------------------------------
drop policy if exists pool_members_all on public.pool_members;
drop policy if exists pool_members_select on public.pool_members;
drop policy if exists pool_members_insert on public.pool_members;
drop policy if exists pool_members_update on public.pool_members;
drop policy if exists pool_members_delete on public.pool_members;

create policy pool_members_select on public.pool_members
  for select using (public.is_trip_member(trip_id));
create policy pool_members_insert on public.pool_members
  for insert with check (public.is_trip_member(trip_id));
create policy pool_members_update on public.pool_members
  for update using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));
create policy pool_members_delete on public.pool_members
  for delete using (public.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- remove_participant: soft-delete + cascade cleanup (expense_splits locked)
-- ---------------------------------------------------------------------------
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

grant execute on function public.remove_participant(text) to authenticated;
