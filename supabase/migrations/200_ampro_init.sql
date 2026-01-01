-- AmProProject schema (separate Supabase project)
-- NOTE: Intended for a dedicated Supabase project so AmPro dancers cannot log into HUB3.

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Enums
do $$ begin
  if not exists (select 1 from pg_type where typname = 'ampro_application_status') then
    create type public.ampro_application_status as enum ('pending', 'accepted', 'rejected', 'maybe');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ampro_update_visibility') then
    create type public.ampro_update_visibility as enum ('accepted_only');
  end if;
end $$;

-- Updated-at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Roles: which users are company admins vs dancers.
create table if not exists public.ampro_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.ampro_user_roles enable row level security;

-- Users can see their own role row.
drop policy if exists "ampro_user_roles_select_own" on public.ampro_user_roles;
create policy "ampro_user_roles_select_own"
on public.ampro_user_roles
for select
to authenticated
using (user_id = auth.uid());

-- Only admins can manage roles.
drop policy if exists "ampro_user_roles_admin_insert" on public.ampro_user_roles;
create policy "ampro_user_roles_admin_insert"
on public.ampro_user_roles
for insert
to authenticated
with check (
  exists (
    select 1 from public.ampro_user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  )
);

drop policy if exists "ampro_user_roles_admin_update" on public.ampro_user_roles;
create policy "ampro_user_roles_admin_update"
on public.ampro_user_roles
for update
to authenticated
using (
  exists (
    select 1 from public.ampro_user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.ampro_user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  )
);

drop policy if exists "ampro_user_roles_admin_delete" on public.ampro_user_roles;
create policy "ampro_user_roles_admin_delete"
on public.ampro_user_roles
for delete
to authenticated
using (
  exists (
    select 1 from public.ampro_user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  )
);

-- Dancer profiles
create table if not exists public.ampro_dancer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ampro_dancer_profiles_set_updated_at on public.ampro_dancer_profiles;
create trigger ampro_dancer_profiles_set_updated_at
before update on public.ampro_dancer_profiles
for each row execute function public.set_updated_at();

alter table public.ampro_dancer_profiles enable row level security;

drop policy if exists "ampro_dancer_profiles_select_own" on public.ampro_dancer_profiles;
create policy "ampro_dancer_profiles_select_own"
on public.ampro_dancer_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "ampro_dancer_profiles_insert_own" on public.ampro_dancer_profiles;
create policy "ampro_dancer_profiles_insert_own"
on public.ampro_dancer_profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "ampro_dancer_profiles_update_own" on public.ampro_dancer_profiles;
create policy "ampro_dancer_profiles_update_own"
on public.ampro_dancer_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "ampro_dancer_profiles_admin_all" on public.ampro_dancer_profiles;
create policy "ampro_dancer_profiles_admin_all"
on public.ampro_dancer_profiles
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- Locations (admin-managed)
create table if not exists public.ampro_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ampro_locations_set_updated_at on public.ampro_locations;
create trigger ampro_locations_set_updated_at
before update on public.ampro_locations
for each row execute function public.set_updated_at();

alter table public.ampro_locations enable row level security;

drop policy if exists "ampro_locations_admin_all" on public.ampro_locations;
create policy "ampro_locations_admin_all"
on public.ampro_locations
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- Programs (publicly visible list) — can represent performances, workshops, etc.
create table if not exists public.ampro_programmas (
  id uuid primary key default gen_random_uuid(),
  program_type text not null default 'performance' check (program_type in ('performance','workshop')),
  location_id uuid references public.ampro_locations(id) on delete set null,
  title text not null,
  description text,
  is_public boolean not null default true,
  applications_open boolean not null default true,
  application_deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ampro_performances_set_updated_at on public.ampro_programmas;
create trigger ampro_performances_set_updated_at
before update on public.ampro_programmas
for each row execute function public.set_updated_at();

alter table public.ampro_programmas enable row level security;

-- Anyone (anon/authenticated) can view public performances.
drop policy if exists "ampro_performances_select_public" on public.ampro_programmas;
create policy "ampro_performances_select_public"
on public.ampro_programmas
for select
to anon, authenticated
using (is_public = true);

-- Admin full control.
drop policy if exists "ampro_performances_admin_all" on public.ampro_programmas;
create policy "ampro_performances_admin_all"
on public.ampro_programmas
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- Forms (company-built forms for applications)
create table if not exists public.ampro_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fields_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ampro_forms_set_updated_at on public.ampro_forms;
create trigger ampro_forms_set_updated_at
before update on public.ampro_forms
for each row execute function public.set_updated_at();

alter table public.ampro_forms enable row level security;

-- Forms are admin-managed; dancers may need to read a form to apply.
drop policy if exists "ampro_forms_select_authenticated" on public.ampro_forms;
create policy "ampro_forms_select_authenticated"
on public.ampro_forms
for select
to authenticated
using (true);

drop policy if exists "ampro_forms_admin_write" on public.ampro_forms;
create policy "ampro_forms_admin_write"
on public.ampro_forms
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- Map performance -> form (optional, supports per-performance form)
create table if not exists public.ampro_performance_forms (
  performance_id uuid primary key references public.ampro_programmas(id) on delete cascade,
  form_id uuid not null references public.ampro_forms(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.ampro_performance_forms enable row level security;

drop policy if exists "ampro_performance_forms_select_public_perf" on public.ampro_performance_forms;
create policy "ampro_performance_forms_select_public_perf"
on public.ampro_performance_forms
for select
to anon, authenticated
using (
  exists (
    select 1 from public.ampro_programmas p
    where p.id = performance_id and p.is_public = true
  )
);

drop policy if exists "ampro_performance_forms_admin_write" on public.ampro_performance_forms;
create policy "ampro_performance_forms_admin_write"
on public.ampro_performance_forms
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- Applications
create table if not exists public.ampro_applications (
  id uuid primary key default gen_random_uuid(),
  performance_id uuid not null references public.ampro_programmas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.ampro_application_status not null default 'pending',
  answers_json jsonb not null default '{}'::jsonb,
  admin_notes text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (performance_id, user_id)
);

drop trigger if exists ampro_applications_set_updated_at on public.ampro_applications;
create trigger ampro_applications_set_updated_at
before update on public.ampro_applications
for each row execute function public.set_updated_at();

alter table public.ampro_applications enable row level security;

-- Dancers can create their own application (for public performances).
drop policy if exists "ampro_applications_insert_own" on public.ampro_applications;
create policy "ampro_applications_insert_own"
on public.ampro_applications
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.ampro_programmas p where p.id = performance_id and p.is_public = true)
);

-- Dancers can view their own applications.
drop policy if exists "ampro_applications_select_own" on public.ampro_applications;
create policy "ampro_applications_select_own"
on public.ampro_applications
for select
to authenticated
using (user_id = auth.uid());

-- Dancers can edit their own answers while pending.
drop policy if exists "ampro_applications_update_own_pending" on public.ampro_applications;
create policy "ampro_applications_update_own_pending"
on public.ampro_applications
for update
to authenticated
using (user_id = auth.uid() and status = 'pending')
with check (user_id = auth.uid() and status = 'pending');

-- Admin can view/manage all applications.
drop policy if exists "ampro_applications_admin_all" on public.ampro_applications;
create policy "ampro_applications_admin_all"
on public.ampro_applications
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- Roster: accepted dancers per performance.
create table if not exists public.ampro_roster (
  performance_id uuid not null references public.ampro_programmas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_name text,
  added_at timestamptz not null default now(),
  primary key (performance_id, user_id)
);

alter table public.ampro_roster enable row level security;

-- Dancers can see their own roster row.
drop policy if exists "ampro_roster_select_own" on public.ampro_roster;
create policy "ampro_roster_select_own"
on public.ampro_roster
for select
to authenticated
using (user_id = auth.uid());

-- Admin can manage roster.
drop policy if exists "ampro_roster_admin_all" on public.ampro_roster;
create policy "ampro_roster_admin_all"
on public.ampro_roster
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- Updates (info for accepted dancers)
create table if not exists public.ampro_updates (
  id uuid primary key default gen_random_uuid(),
  performance_id uuid not null references public.ampro_programmas(id) on delete cascade,
  title text not null,
  body text not null,
  visibility public.ampro_update_visibility not null default 'accepted_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ampro_updates_set_updated_at on public.ampro_updates;
create trigger ampro_updates_set_updated_at
before update on public.ampro_updates
for each row execute function public.set_updated_at();

alter table public.ampro_updates enable row level security;

-- Accepted dancers (roster members) can read updates for performances they are in.
drop policy if exists "ampro_updates_select_accepted" on public.ampro_updates;
create policy "ampro_updates_select_accepted"
on public.ampro_updates
for select
to authenticated
using (
  exists (
    select 1 from public.ampro_roster r
    where r.performance_id = performance_id and r.user_id = auth.uid()
  )
);

-- Admin manages updates.
drop policy if exists "ampro_updates_admin_all" on public.ampro_updates;
create policy "ampro_updates_admin_all"
on public.ampro_updates
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- Availability (simple table-style replacement for Google Sheet)
create table if not exists public.ampro_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  performance_id uuid references public.ampro_programmas(id) on delete set null,
  day date not null,
  start_time time,
  end_time time,
  available boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, performance_id, day, start_time, end_time)
);

drop trigger if exists ampro_availability_set_updated_at on public.ampro_availability;
create trigger ampro_availability_set_updated_at
before update on public.ampro_availability
for each row execute function public.set_updated_at();

alter table public.ampro_availability enable row level security;

-- Dancers manage their own availability.
drop policy if exists "ampro_availability_select_own" on public.ampro_availability;
create policy "ampro_availability_select_own"
on public.ampro_availability
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "ampro_availability_insert_own" on public.ampro_availability;
create policy "ampro_availability_insert_own"
on public.ampro_availability
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "ampro_availability_update_own" on public.ampro_availability;
create policy "ampro_availability_update_own"
on public.ampro_availability
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "ampro_availability_delete_own" on public.ampro_availability;
create policy "ampro_availability_delete_own"
on public.ampro_availability
for delete
to authenticated
using (user_id = auth.uid());

-- Admin can read all availability.
drop policy if exists "ampro_availability_admin_select" on public.ampro_availability;
create policy "ampro_availability_admin_select"
on public.ampro_availability
for select
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);
