-- Extensions + core tables/indexes
-- Apply in timestamp order on an empty public schema.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

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
  created_by uuid not null references auth.users (id),
  settlement_generation bigint not null default 0,
  constraint trips_name_len check (char_length(trim(name)) between 1 and 120),
  constraint trips_transfer_mode_check check (transfer_mode in ('minimize', 'settle_to_one')),
  constraint trips_settlement_rounding_check check (settlement_rounding in ('rupee', 'none')),
  constraint trips_currency_check check (currency = 'PKR')
);

create table if not exists public.participants (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  display_name text not null,
  user_id uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint participants_display_name_len
    check (char_length(trim(display_name)) between 1 and 80)
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
  split_mode text not null default 'shares',
  deleted_at timestamptz,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint pools_name_len check (char_length(trim(name)) between 1 and 80),
  constraint pools_split_mode_check
    check (split_mode in ('shares', 'equal', 'percent', 'exact'))
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
  exact_paisa bigint not null default 0,
  unique (pool_id, participant_id),
  constraint pool_members_shares_check check (shares >= 0),
  constraint pool_members_percent_check check (percent_bps >= 0),
  constraint pool_members_exact_check check (exact_paisa >= 0)
);

create table if not exists public.expenses (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  pool_id text not null references public.pools (id),
  description text not null,
  category text not null default 'Misc',
  amount_paisa bigint not null,
  paid_by_id text not null references public.participants (id),
  date text not null,
  notes text not null default '',
  superseded_by_id text,
  created_at timestamptz not null default now(),
  split_mode text,
  removed boolean not null default false,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint expenses_amount_positive check (amount_paisa > 0),
  constraint expenses_description_len check (char_length(trim(description)) between 1 and 200),
  constraint expenses_category_len check (char_length(category) between 1 and 60),
  constraint expenses_notes_len check (char_length(notes) <= 2000),
  constraint expenses_split_mode_check
    check (split_mode is null or split_mode in ('shares', 'equal', 'percent', 'exact'))
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
  exact_paisa bigint not null default 0,
  unique (expense_id, participant_id),
  constraint expense_splits_shares_check check (shares >= 0),
  constraint expense_splits_percent_check check (percent_bps >= 0),
  constraint expense_splits_exact_check check (exact_paisa >= 0)
);

create table if not exists public.adjustments (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  from_id text not null references public.participants (id),
  to_id text not null references public.participants (id),
  amount_paisa bigint not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  adjustment_group_id text,
  deleted_at timestamptz,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint adjustments_amount_positive check (amount_paisa > 0),
  constraint adjustments_reason_len check (char_length(reason) <= 500)
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

create table if not exists public.trip_settlement_snapshots (
  trip_id text primary key references public.trips (id) on delete cascade,
  facts_hash text not null,
  result jsonb not null,
  consistency_ok boolean not null,
  computed_at timestamptz not null default now(),
  engine_version text not null default '1'
);

create table if not exists public.rpc_rate_limits (
  key text not null,
  window_start timestamptz not null,
  hit_count integer not null default 0,
  primary key (key, window_start)
);

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

