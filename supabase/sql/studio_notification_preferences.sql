-- Per-studio notification preferences per team member
-- Channels: 'none' | 'in_app' | 'push'
create table if not exists public.studio_notification_preferences (
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  disable_all boolean not null default false,

  -- Events
  enrollment_channel text not null default 'push',
  replacement_requests_channel text not null default 'push',

  updated_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);

create index if not exists studio_notification_preferences_user_id_idx
  on public.studio_notification_preferences (user_id);

alter table public.studio_notification_preferences enable row level security;

-- Any studio team member can manage their own preference row.
-- (Owner can be either in studio_members or studios.eigenaar_id fallback.)

drop policy if exists "studio_notification_preferences_select_own" on public.studio_notification_preferences;
create policy "studio_notification_preferences_select_own"
  on public.studio_notification_preferences for select
  using (
    auth.uid() = user_id
    and (
      exists (
        select 1 from public.studio_members sm
        where sm.studio_id = studio_notification_preferences.studio_id
          and sm.user_id = auth.uid()
      )
      or exists (
        select 1 from public.studios s
        where s.id = studio_notification_preferences.studio_id
          and s.eigenaar_id = auth.uid()
      )
    )
  );

drop policy if exists "studio_notification_preferences_insert_own" on public.studio_notification_preferences;
create policy "studio_notification_preferences_insert_own"
  on public.studio_notification_preferences for insert
  with check (
    auth.uid() = user_id
    and (
      exists (
        select 1 from public.studio_members sm
        where sm.studio_id = studio_notification_preferences.studio_id
          and sm.user_id = auth.uid()
      )
      or exists (
        select 1 from public.studios s
        where s.id = studio_notification_preferences.studio_id
          and s.eigenaar_id = auth.uid()
      )
    )
  );

drop policy if exists "studio_notification_preferences_update_own" on public.studio_notification_preferences;
create policy "studio_notification_preferences_update_own"
  on public.studio_notification_preferences for update
  using (
    auth.uid() = user_id
    and (
      exists (
        select 1 from public.studio_members sm
        where sm.studio_id = studio_notification_preferences.studio_id
          and sm.user_id = auth.uid()
      )
      or exists (
        select 1 from public.studios s
        where s.id = studio_notification_preferences.studio_id
          and s.eigenaar_id = auth.uid()
      )
    )
  );
