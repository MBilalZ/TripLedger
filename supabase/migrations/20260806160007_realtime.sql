-- Realtime publication
-- Apply in timestamp order on an empty public schema.

-- ---------------------------------------------------------------------------
-- Realtime (idempotent)
-- ---------------------------------------------------------------------------

do $$ begin
  alter publication supabase_realtime add table public.trips;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.participants;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.pools;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.pool_members;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.expenses;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.expense_splits;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.adjustments;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.trip_members;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.trip_settlement_snapshots;
exception when duplicate_object then null;
end $$;
