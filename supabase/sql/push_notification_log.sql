-- Log table to avoid sending duplicate push notifications
-- Run this in Supabase SQL editor.

create table if not exists public.push_notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  lesson_id uuid references public.lessons(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  scheduled_for timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists push_notification_log_user_kind_lesson_key
  on public.push_notification_log(user_id, kind, lesson_id);

create index if not exists push_notification_log_kind_idx
  on public.push_notification_log(kind);

alter table public.push_notification_log enable row level security;

drop policy if exists "push_notification_log_select_own" on public.push_notification_log;
create policy "push_notification_log_select_own"
  on public.push_notification_log for select
  using (auth.uid() = user_id);
