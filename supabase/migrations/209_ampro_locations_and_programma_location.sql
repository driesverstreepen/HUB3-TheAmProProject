-- AmPro: locations + link to programmas

-- Locations
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

-- Admin full control.
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

-- Link locations to programmas (single primary location)
alter table public.ampro_programmas
  add column if not exists location_id uuid;

-- Add FK constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.ampro_programmas'::regclass
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%location_id%'
      AND pg_get_constraintdef(c.oid) ILIKE '%ampro_locations%'
  ) THEN
    alter table public.ampro_programmas
      add constraint ampro_programmas_location_id_fkey
      foreign key (location_id)
      references public.ampro_locations(id)
      on delete set null;
  END IF;
END $$;

create index if not exists ampro_programmas_location_id_idx on public.ampro_programmas(location_id);
