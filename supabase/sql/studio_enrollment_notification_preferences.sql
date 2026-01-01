-- Per-studio notification preferences for studio owner/admin users
create table if not exists public.studio_enrollment_notification_preferences (
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  disable_all boolean not null default false,
  -- 'none' | 'in_app' | 'push'
  enrollment_channel text not null default 'push',
  updated_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);

create index if not exists studio_enrollment_notification_preferences_user_id_idx
  on public.studio_enrollment_notification_preferences (user_id);

alter table public.studio_enrollment_notification_preferences enable row level security;

-- Only owner/admin of that studio can see/manage their own preference row.
-- Owner can be either in studio_members(role=owner) or studios.eigenaar_id.

drop policy if exists "studio_enroll_notif_select_own" on public.studio_enrollment_notification_preferences;
create policy "studio_enroll_notif_select_own"
  on public.studio_enrollment_notification_preferences for select
  using (
    auth.uid() = user_id
    and (
      exists (
        select 1 from public.studio_members sm
        where sm.studio_id = studio_enrollment_notification_preferences.studio_id
          and sm.user_id = auth.uid()
          and sm.role in ('owner','admin')
      )
      or exists (
        select 1 from public.studios s
        where s.id = studio_enrollment_notification_preferences.studio_id
          and s.eigenaar_id = auth.uid()
      )
    )
  );

drop policy if exists "studio_enroll_notif_insert_own" on public.studio_enrollment_notification_preferences;
create policy "studio_enroll_notif_insert_own"
  on public.studio_enrollment_notification_preferences for insert
  with check (
    auth.uid() = user_id
    and (
      exists (
        select 1 from public.studio_members sm
        where sm.studio_id = studio_enrollment_notification_preferences.studio_id
          and sm.user_id = auth.uid()
          and sm.role in ('owner','admin')
      )
      or exists (
        select 1 from public.studios s
        where s.id = studio_enrollment_notification_preferences.studio_id
          and s.eigenaar_id = auth.uid()
      )
    )
  );

drop policy if exists "studio_enroll_notif_update_own" on public.studio_enrollment_notification_preferences;
create policy "studio_enroll_notif_update_own"
  on public.studio_enrollment_notification_preferences for update
  using (
    auth.uid() = user_id
    and (
      exists (
        select 1 from public.studio_members sm
        where sm.studio_id = studio_enrollment_notification_preferences.studio_id
          and sm.user_id = auth.uid()
          and sm.role in ('owner','admin')
      )
      or exists (
        select 1 from public.studios s
        where s.id = studio_enrollment_notification_preferences.studio_id
          and s.eigenaar_id = auth.uid()
      )
    )
  );
