-- Notifications + Push subscriptions + Preferences (AMPRO)

-- Notifications table (may already exist). This is used by NotificationBell/NotificationsPanel.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  action_type text,
  action_data jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- Add scope for app-specific filtering (AMPRO uses scope='ampro'). Safe if table exists.
alter table if exists public.notifications
  add column if not exists scope text not null default 'global';

create index if not exists notifications_user_id_created_at_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_id_read_created_at_idx
  on public.notifications(user_id, read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
on public.notifications
for delete
to authenticated
using (user_id = auth.uid());

-- Push subscriptions (web push). Keep schema compatible with existing API + dispatch code.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
on public.push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
on public.push_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
on public.push_subscriptions
for delete
to authenticated
using (user_id = auth.uid());

-- User notification preferences (existing API: /api/notification-preferences)
-- Channel values: none / in_app / push
create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  disable_all boolean not null default false,
  new_programs_scope text not null default 'all' check (new_programs_scope in ('all','workshops')),
  new_programs_channel text not null default 'push' check (new_programs_channel in ('none','in_app','push')),
  program_updates_channel text not null default 'push' check (program_updates_channel in ('none','in_app','push')),
  updated_at timestamptz not null default now()
);

-- AMPRO preference columns (added idempotently)
alter table if exists public.user_notification_preferences
  add column if not exists ampro_notes_channel text not null default 'in_app' check (ampro_notes_channel in ('none','in_app','push'));

alter table if exists public.user_notification_preferences
  add column if not exists ampro_corrections_channel text not null default 'in_app' check (ampro_corrections_channel in ('none','in_app','push'));

alter table if exists public.user_notification_preferences
  add column if not exists ampro_availability_channel text not null default 'in_app' check (ampro_availability_channel in ('none','in_app','push'));

alter table public.user_notification_preferences enable row level security;

drop policy if exists "user_notification_preferences_select_own" on public.user_notification_preferences;
create policy "user_notification_preferences_select_own"
on public.user_notification_preferences
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_notification_preferences_upsert_own" on public.user_notification_preferences;
create policy "user_notification_preferences_upsert_own"
on public.user_notification_preferences
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_notification_preferences_update_own" on public.user_notification_preferences;
create policy "user_notification_preferences_update_own"
on public.user_notification_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Grants (safe/idempotent)
grant select, insert, update, delete on table public.notifications to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert, update on table public.user_notification_preferences to authenticated;
