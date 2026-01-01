-- AmPro: track new auth users in AmPro tables and assign default role

-- 1) Keep a lightweight user row for AmPro (separate from auth.users)
create table if not exists public.ampro_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.ampro_users enable row level security;

create policy "ampro_users_select_own"
on public.ampro_users
for select
to authenticated
using (user_id = auth.uid());

create policy "ampro_users_admin_select"
on public.ampro_users
for select
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- 2) On new auth user: create ampro_users row, default role + empty profile
create or replace function public.ampro_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.ampro_users(user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;

  insert into public.ampro_user_roles(user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  insert into public.ampro_dancer_profiles(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS ampro_on_auth_user_created ON auth.users;
create trigger ampro_on_auth_user_created
after insert on auth.users
for each row execute function public.ampro_handle_new_auth_user();
