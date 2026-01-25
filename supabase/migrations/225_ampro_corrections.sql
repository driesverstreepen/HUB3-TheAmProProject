-- AmPro: corrections per program (admin-managed)

create table if not exists public.ampro_corrections (
  id uuid primary key default gen_random_uuid(),
  performance_id uuid not null references public.ampro_programmas(id) on delete cascade,
  correction_date date not null,
  body text not null,
  visible_to_accepted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ampro_corrections_performance_id_idx
  on public.ampro_corrections(performance_id);

create index if not exists ampro_corrections_performance_date_idx
  on public.ampro_corrections(performance_id, correction_date desc, created_at desc);

alter table public.ampro_corrections enable row level security;

-- Keep updated_at fresh on updates.
drop trigger if exists ampro_corrections_set_updated_at on public.ampro_corrections;
create trigger ampro_corrections_set_updated_at
before update on public.ampro_corrections
for each row execute function public.set_updated_at();

-- Accepted dancers can see only corrections explicitly marked visible.
drop policy if exists "ampro_corrections_select_accepted" on public.ampro_corrections;
create policy "ampro_corrections_select_accepted"
on public.ampro_corrections
for select
to authenticated
using (
  visible_to_accepted = true
  and exists (
    select 1 from public.ampro_roster r
    where r.performance_id = performance_id
      and r.user_id = auth.uid()
  )
);

-- Admins can manage everything.
drop policy if exists "ampro_corrections_admin_all" on public.ampro_corrections;
create policy "ampro_corrections_admin_all"
on public.ampro_corrections
for all
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
)
with check (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- Grants (safe/idempotent)
-- (keep explicit grants to ensure PostgREST can access when RLS allows)
grant select on table public.ampro_corrections to authenticated;
grant insert, update, delete on table public.ampro_corrections to authenticated;
