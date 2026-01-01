-- Add locking controls for availability responses.

alter table if exists public.ampro_availability_requests
  add column if not exists responses_locked boolean not null default false;

alter table if exists public.ampro_availability_requests
  add column if not exists responses_lock_at date;

-- Update user-facing select policies so users can always re-consult their request
-- once they have responded, even if admin later hides the request.

drop policy if exists "ampro_availability_requests_select_assigned" on public.ampro_availability_requests;
create policy "ampro_availability_requests_select_assigned"
on public.ampro_availability_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.ampro_availability_request_dates d
    join public.ampro_availability_request_date_users du on du.request_date_id = d.id
    where d.request_id = id and du.user_id = auth.uid()
  )
  and (
    is_visible = true
    or exists (
      select 1
      from public.ampro_availability_request_dates d
      join public.ampro_availability_responses r on r.request_date_id = d.id
      where d.request_id = id and r.user_id = auth.uid()
    )
  )
);

-- Allow users to read the dates if they are assigned and either visible OR they already responded.

drop policy if exists "ampro_availability_request_dates_select_assigned" on public.ampro_availability_request_dates;
create policy "ampro_availability_request_dates_select_assigned"
on public.ampro_availability_request_dates
for select
to authenticated
using (
  exists (
    select 1
    from public.ampro_availability_requests req
    join public.ampro_availability_request_date_users du on du.request_date_id = id
    where req.id = request_id and du.user_id = auth.uid()
  )
  and (
    exists (select 1 from public.ampro_availability_requests req where req.id = request_id and req.is_visible = true)
    or exists (
      select 1
      from public.ampro_availability_responses r
      where r.request_date_id = id and r.user_id = auth.uid()
    )
  )
);

-- Users manage their own responses, only if they are assigned and NOT locked.

drop policy if exists "ampro_availability_responses_insert_own_assigned" on public.ampro_availability_responses;
create policy "ampro_availability_responses_insert_own_assigned"
on public.ampro_availability_responses
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.ampro_availability_request_date_users du
    join public.ampro_availability_request_dates d on d.id = du.request_date_id
    join public.ampro_availability_requests req on req.id = d.request_id
    where du.request_date_id = request_date_id
      and du.user_id = auth.uid()
      and (
        req.responses_locked = false
        and (req.responses_lock_at is null or current_date <= req.responses_lock_at)
      )
      and req.is_visible = true
  )
);

drop policy if exists "ampro_availability_responses_update_own_assigned" on public.ampro_availability_responses;
create policy "ampro_availability_responses_update_own_assigned"
on public.ampro_availability_responses
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.ampro_availability_request_date_users du
    join public.ampro_availability_request_dates d on d.id = du.request_date_id
    join public.ampro_availability_requests req on req.id = d.request_id
    where du.request_date_id = request_date_id
      and du.user_id = auth.uid()
      and (
        req.responses_locked = false
        and (req.responses_lock_at is null or current_date <= req.responses_lock_at)
      )
      and (req.is_visible = true or exists (
        select 1 from public.ampro_availability_responses rr
        where rr.request_date_id = request_date_id and rr.user_id = auth.uid()
      ))
  )
);
