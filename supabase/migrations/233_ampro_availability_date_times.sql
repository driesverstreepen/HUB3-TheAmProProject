-- Allow admins to optionally set a time window per availability date.

alter table if exists public.ampro_availability_request_dates
  add column if not exists start_time time;

alter table if exists public.ampro_availability_request_dates
  add column if not exists end_time time;
