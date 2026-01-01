-- Table for storing followed studios per user
create table if not exists public.user_followed_studios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  studio_id uuid not null references public.studios(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, studio_id)
);

create index if not exists user_followed_studios_user_id_idx
  on public.user_followed_studios (user_id);

create index if not exists user_followed_studios_studio_id_idx
  on public.user_followed_studios (studio_id);

alter table public.user_followed_studios enable row level security;

drop policy if exists "user_followed_studios_select_own" on public.user_followed_studios;
create policy "user_followed_studios_select_own"
  on public.user_followed_studios for select
  using (auth.uid() = user_id);

drop policy if exists "user_followed_studios_insert_own" on public.user_followed_studios;
create policy "user_followed_studios_insert_own"
  on public.user_followed_studios for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_followed_studios_delete_own" on public.user_followed_studios;
create policy "user_followed_studios_delete_own"
  on public.user_followed_studios for delete
  using (auth.uid() = user_id);
