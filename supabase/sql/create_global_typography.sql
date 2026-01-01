-- Global typography configuration for HUB3
-- Run this in Supabase SQL editor.

create table if not exists public.global_typography (
  key text primary key,
  config jsonb not null,
  updated_at timestamptz null,
  updated_by uuid null
);

-- Optional: lock down via RLS (service role bypasses RLS)
alter table public.global_typography enable row level security;

-- No policies by default. Super-admin updates happen through server API using service role.
