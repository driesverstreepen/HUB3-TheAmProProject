-- Allow admins to optionally set a location per availability date.

alter table if exists public.ampro_availability_request_dates
  add column if not exists location_id uuid references public.ampro_locations(id) on delete set null;

create index if not exists ampro_availability_request_dates_location_id_idx
  on public.ampro_availability_request_dates(location_id);
