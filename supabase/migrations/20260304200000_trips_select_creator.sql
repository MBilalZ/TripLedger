-- Allow trip creators to SELECT their trip before trip_members exists
-- (fixes participants insert RLS chicken-and-egg on create).

drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select using (
    public.is_trip_member(id) or created_by = auth.uid()
  );
