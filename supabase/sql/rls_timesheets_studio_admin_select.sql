-- Allow studio owners/admins to view all timesheets for their studio (including drafts)
-- Assumptions:
-- - `timesheets` has columns: `studio_id`, `teacher_id`, `status`, ...
-- - `studio_members` has columns: `studio_id`, `user_id`, `role`
-- - `studio_members` RLS allows users to read their own membership rows (e.g. user_id = auth.uid())

-- Ensure RLS is enabled (only needed once)
alter table public.timesheets enable row level security;

-- Optional: remove/replace older policies if they conflict
-- drop policy if exists timesheets_teacher_view on public.timesheets;

create policy timesheets_studio_admin_view
on public.timesheets
for select
to authenticated
using (
  exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = timesheets.studio_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin')
  )
);

-- Keep (or add) a teacher self-view policy if desired:
-- Teachers can view their own timesheets (draft + confirmed)
-- create policy timesheets_teacher_view
-- on public.timesheets
-- for select
-- to authenticated
-- using (teacher_id = auth.uid());
