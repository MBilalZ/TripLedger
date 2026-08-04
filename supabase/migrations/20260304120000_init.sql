-- TripLedger shared trips schema (Supabase / Postgres)
-- Apply via Supabase SQL editor or `supabase db push`

create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id text primary key,
  name text not null,
  currency text not null default 'PKR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  transfer_mode text not null default 'minimize',
  settlement_rounding text not null default 'rupee',
  settlement_hub_id text,
  created_by uuid not null references auth.users (id)
);

create table if not exists public.participants (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  display_name text not null,
  user_id uuid references auth.users (id) on delete set null
);

create index if not exists participants_trip_id_idx on public.participants (trip_id);

create table if not exists public.trip_members (
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  participant_id text not null references public.participants (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.pools (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  name text not null,
  split_mode text not null default 'shares'
);

create index if not exists pools_trip_id_idx on public.pools (trip_id);

create table if not exists public.pool_members (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  pool_id text not null references public.pools (id) on delete cascade,
  participant_id text not null references public.participants (id) on delete cascade,
  included boolean not null default true,
  shares integer not null default 1,
  percent_bps integer not null default 0,
  exact_paisa integer not null default 0,
  unique (pool_id, participant_id)
);

create table if not exists public.expenses (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  pool_id text not null references public.pools (id),
  description text not null,
  category text not null default 'Misc',
  amount_paisa integer not null,
  paid_by_id text not null references public.participants (id),
  date text not null,
  notes text not null default '',
  superseded_by_id text,
  created_at timestamptz not null default now(),
  split_mode text
);

create index if not exists expenses_trip_id_idx on public.expenses (trip_id);

create table if not exists public.expense_splits (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  expense_id text not null references public.expenses (id) on delete cascade,
  participant_id text not null references public.participants (id) on delete cascade,
  included boolean not null default true,
  shares integer not null default 1,
  percent_bps integer not null default 0,
  exact_paisa integer not null default 0,
  unique (expense_id, participant_id)
);

create table if not exists public.adjustments (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  from_id text not null references public.participants (id),
  to_id text not null references public.participants (id),
  amount_paisa integer not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  adjustment_group_id text
);

create index if not exists adjustments_trip_id_idx on public.adjustments (trip_id);
create index if not exists adjustments_group_idx on public.adjustments (adjustment_group_id);

create table if not exists public.trip_invites (
  token text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists trip_invites_trip_id_idx on public.trip_invites (trip_id);

-- Helpers
create or replace function public.is_trip_member(p_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
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
    where m.trip_id = p_trip_id and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Ensure profile row on signup / anonymous auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', null))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Join via invite token
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
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if trim(p_display_name) = '' then
    raise exception 'Display name is required';
  end if;

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

  v_participant_id := 'p_' || gen_random_uuid()::text;

  insert into public.participants (id, trip_id, display_name, user_id)
  values (v_participant_id, v_invite.trip_id, trim(p_display_name), v_uid);

  insert into public.trip_members (trip_id, user_id, participant_id, role)
  values (v_invite.trip_id, v_uid, v_participant_id, 'member');

  update public.profiles
  set display_name = trim(p_display_name)
  where user_id = v_uid;

  for v_pool in
    select id from public.pools where trip_id = v_invite.trip_id
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

grant execute on function public.join_trip_with_token(text, text) to authenticated;
grant execute on function public.is_trip_member(text) to authenticated;
grant execute on function public.is_trip_owner(text) to authenticated;

-- RLS
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

create policy profiles_select_own on public.profiles
  for select using (user_id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (user_id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert with check (user_id = auth.uid());

create policy trips_select on public.trips
  for select using (
    public.is_trip_member(id) or created_by = auth.uid()
  );
create policy trips_insert on public.trips
  for insert with check (created_by = auth.uid());
create policy trips_update on public.trips
  for update using (public.is_trip_member(id));
create policy trips_delete on public.trips
  for delete using (public.is_trip_owner(id));

create policy trip_members_select on public.trip_members
  for select using (public.is_trip_member(trip_id));
create policy trip_members_insert_owner on public.trip_members
  for insert with check (
    public.is_trip_owner(trip_id) or user_id = auth.uid()
  );
create policy trip_members_delete on public.trip_members
  for delete using (public.is_trip_owner(trip_id));

create policy participants_select on public.participants
  for select using (public.is_trip_member(trip_id));
create policy participants_insert on public.participants
  for insert with check (
    public.is_trip_member(trip_id)
    or exists (
      select 1 from public.trips t
      where t.id = trip_id and t.created_by = auth.uid()
    )
  );
create policy participants_update on public.participants
  for update using (public.is_trip_member(trip_id));
create policy participants_delete on public.participants
  for delete using (public.is_trip_member(trip_id));

create policy pools_all on public.pools
  for all using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create policy pool_members_all on public.pool_members
  for all using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create policy expenses_all on public.expenses
  for all using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create policy expense_splits_all on public.expense_splits
  for all using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create policy adjustments_all on public.adjustments
  for all using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create policy invites_select on public.trip_invites
  for select using (public.is_trip_member(trip_id));
create policy invites_insert on public.trip_invites
  for insert with check (public.is_trip_owner(trip_id) and created_by = auth.uid());
create policy invites_update on public.trip_invites
  for update using (public.is_trip_owner(trip_id));

-- Realtime
alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.pools;
alter publication supabase_realtime add table public.pool_members;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.expense_splits;
alter publication supabase_realtime add table public.adjustments;
alter publication supabase_realtime add table public.trip_members;
