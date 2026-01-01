-- Availability requests: admin defines which dates/users need an answer for a performance.

create table if not exists public.ampro_availability_requests (
  id uuid primary key default gen_random_uuid(),
  performance_id uuid not null unique references public.ampro_programmas(id) on delete cascade,
  is_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ampro_availability_requests_set_updated_at on public.ampro_availability_requests;
create trigger ampro_availability_requests_set_updated_at
before update on public.ampro_availability_requests
for each row execute function public.set_updated_at();

create table if not exists public.ampro_availability_request_dates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ampro_availability_requests(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (request_id, day)
);

create table if not exists public.ampro_availability_request_date_users (
  request_date_id uuid not null references public.ampro_availability_request_dates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_date_id, user_id)
);

create table if not exists public.ampro_availability_responses (
  request_date_id uuid not null references public.ampro_availability_request_dates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('yes','no','maybe')) default 'maybe',
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (request_date_id, user_id)
);

drop trigger if exists ampro_availability_responses_set_updated_at on public.ampro_availability_responses;
create trigger ampro_availability_responses_set_updated_at
before update on public.ampro_availability_responses
for each row execute function public.set_updated_at();

alter table public.ampro_availability_requests enable row level security;
alter table public.ampro_availability_request_dates enable row level security;
alter table public.ampro_availability_request_date_users enable row level security;
alter table public.ampro_availability_responses enable row level security;

-- Grants
grant select, insert, update, delete on table public.ampro_availability_requests to authenticated;
grant select, insert, update, delete on table public.ampro_availability_request_dates to authenticated;
grant select, insert, update, delete on table public.ampro_availability_request_date_users to authenticated;
grant select, insert, update, delete on table public.ampro_availability_responses to authenticated;

-- Admin full access

drop policy if exists "ampro_availability_requests_admin_all" on public.ampro_availability_requests;
create policy "ampro_availability_requests_admin_all"
on public.ampro_availability_requests
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

drop policy if exists "ampro_availability_request_dates_admin_all" on public.ampro_availability_request_dates;
create policy "ampro_availability_request_dates_admin_all"
on public.ampro_availability_request_dates
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

drop policy if exists "ampro_availability_request_date_users_admin_all" on public.ampro_availability_request_date_users;
create policy "ampro_availability_request_date_users_admin_all"
on public.ampro_availability_request_date_users
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

drop policy if exists "ampro_availability_responses_admin_all" on public.ampro_availability_responses;
create policy "ampro_availability_responses_admin_all"
on public.ampro_availability_responses
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- User read access (only if visible AND assigned)

drop policy if exists "ampro_availability_requests_select_assigned" on public.ampro_availability_requests;
create policy "ampro_availability_requests_select_assigned"
on public.ampro_availability_requests
for select
to authenticated
using (
  is_visible = true
  and exists (
    select 1
    from public.ampro_availability_request_dates d
    join public.ampro_availability_request_date_users du on du.request_date_id = d.id
    where d.request_id = id and du.user_id = auth.uid()
  )
);

drop policy if exists "ampro_availability_request_dates_select_assigned" on public.ampro_availability_request_dates;
create policy "ampro_availability_request_dates_select_assigned"
on public.ampro_availability_request_dates
for select
to authenticated
using (
  exists (
    select 1
    from public.ampro_availability_requests r
    join public.ampro_availability_request_date_users du on du.request_date_id = id
    where r.id = request_id and r.is_visible = true and du.user_id = auth.uid()
  )
);

drop policy if exists "ampro_availability_request_date_users_select_self" on public.ampro_availability_request_date_users;
create policy "ampro_availability_request_date_users_select_self"
on public.ampro_availability_request_date_users
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.ampro_availability_request_dates d
    join public.ampro_availability_requests r on r.id = d.request_id
    where d.id = request_date_id and r.is_visible = true
  )
);

-- Users manage their own responses, only if they are assigned.

drop policy if exists "ampro_availability_responses_select_own" on public.ampro_availability_responses;
create policy "ampro_availability_responses_select_own"
on public.ampro_availability_responses
for select
to authenticated
using (user_id = auth.uid());

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
    join public.ampro_availability_requests r on r.id = d.request_id
    where du.request_date_id = request_date_id and du.user_id = auth.uid() and r.is_visible = true
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
    join public.ampro_availability_requests r on r.id = d.request_id
    where du.request_date_id = request_date_id and du.user_id = auth.uid() and r.is_visible = true
  )
);
