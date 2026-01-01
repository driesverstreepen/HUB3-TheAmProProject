-- Per-user notification preferences
create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  disable_all boolean not null default false,
  -- 'all' | 'workshops'
  new_programs_scope text not null default 'all',
  -- 'none' | 'in_app' | 'push'
  new_programs_channel text not null default 'push',
  -- 'none' | 'in_app' | 'push'
  program_updates_channel text not null default 'push',
  updated_at timestamptz not null default now()
);

alter table public.user_notification_preferences enable row level security;

drop policy if exists "user_notification_preferences_select_own" on public.user_notification_preferences;
create policy "user_notification_preferences_select_own"
  on public.user_notification_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "user_notification_preferences_upsert_own" on public.user_notification_preferences;
create policy "user_notification_preferences_upsert_own"
  on public.user_notification_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_notification_preferences_update_own" on public.user_notification_preferences;
create policy "user_notification_preferences_update_own"
  on public.user_notification_preferences for update
  using (auth.uid() = user_id);
