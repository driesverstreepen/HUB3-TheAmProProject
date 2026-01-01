-- Fix: infinite recursion detected in policy for relation "ampro_availability_requests"
-- Cause: circular RLS dependencies between requests <-> request_dates <-> request_date_users.
-- Solution: rewrite user-facing SELECT policies to avoid referencing the parent table from child-table policies.

-- Requests: user can see a request if:
-- - it is visible AND they are assigned to any date, OR
-- - they already have at least one response for any date of this request (so they can re-consult later).

drop policy if exists "ampro_availability_requests_select_assigned" on public.ampro_availability_requests;
create policy "ampro_availability_requests_select_assigned"
on public.ampro_availability_requests
for select
to authenticated
using (
  (
    is_visible = true
    and exists (
      select 1
      from public.ampro_availability_request_dates d
      join public.ampro_availability_request_date_users du on du.request_date_id = d.id
      where d.request_id = id and du.user_id = auth.uid()
    )
  )
  or exists (
    select 1
    from public.ampro_availability_request_dates d
    join public.ampro_availability_responses r on r.request_date_id = d.id
    where d.request_id = id and r.user_id = auth.uid()
  )
);

-- Dates: user can see a date if:
-- - they are assigned to it, OR
-- - they already responded to it.
-- No reference to requests table here (breaks recursion).

drop policy if exists "ampro_availability_request_dates_select_assigned" on public.ampro_availability_request_dates;
create policy "ampro_availability_request_dates_select_assigned"
on public.ampro_availability_request_dates
for select
to authenticated
using (
  exists (
    select 1
    from public.ampro_availability_request_date_users du
    where du.request_date_id = id and du.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.ampro_availability_responses r
    where r.request_date_id = id and r.user_id = auth.uid()
  )
);

-- Date-user assignment rows: user can see their own assignment rows.
-- No reference to requests table here (breaks recursion).

drop policy if exists "ampro_availability_request_date_users_select_self" on public.ampro_availability_request_date_users;
create policy "ampro_availability_request_date_users_select_self"
on public.ampro_availability_request_date_users
for select
to authenticated
using (user_id = auth.uid());
