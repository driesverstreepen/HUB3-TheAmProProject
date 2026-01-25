-- AmPro: reusable program invite links (group chat friendly)

create table if not exists public.ampro_program_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  performance_id uuid not null references public.ampro_programmas(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer,
  uses_count integer not null default 0,
  revoked_at timestamptz,
  note text,
  check (max_uses is null or max_uses >= 1),
  check (uses_count >= 0)
);

create index if not exists ampro_program_invites_performance_id_idx
  on public.ampro_program_invites(performance_id);

create table if not exists public.ampro_program_invite_claims (
  invite_id uuid not null references public.ampro_program_invites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);

create index if not exists ampro_program_invite_claims_user_id_idx
  on public.ampro_program_invite_claims(user_id);

alter table public.ampro_program_invites enable row level security;
alter table public.ampro_program_invite_claims enable row level security;

-- Lock down direct access. These links should be used via server APIs.
revoke all on table public.ampro_program_invites from anon, authenticated;
revoke all on table public.ampro_program_invite_claims from anon, authenticated;

-- Admin-only read access (optional but handy for debugging in SQL editor)
drop policy if exists "ampro_program_invites_admin_select" on public.ampro_program_invites;
create policy "ampro_program_invites_admin_select"
on public.ampro_program_invites
for select
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

drop policy if exists "ampro_program_invite_claims_admin_select" on public.ampro_program_invite_claims;
create policy "ampro_program_invite_claims_admin_select"
on public.ampro_program_invite_claims
for select
to authenticated
using (
  exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
);

-- Claim function: idempotent per user; optionally enforces expires/max uses.
create or replace function public.claim_ampro_program_invite(
  p_token text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.ampro_program_invites%rowtype;
  v_inserted_claim boolean := false;
begin
  if p_token is null or length(trim(p_token)) < 20 then
    raise exception 'Invalid token';
  end if;
  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  select * into v_invite
  from public.ampro_program_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'Invite revoked';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Invite expired';
  end if;

  -- If the user already claimed this invite, succeed without consuming another use.
  insert into public.ampro_program_invite_claims(invite_id, user_id)
  values (v_invite.id, p_user_id)
  on conflict do nothing;

  get diagnostics v_inserted_claim = row_count;

  if v_inserted_claim then
    -- Enforce max_uses only when a *new* user claims.
    if v_invite.max_uses is not null and v_invite.uses_count >= v_invite.max_uses then
      raise exception 'Invite max uses reached';
    end if;

    update public.ampro_program_invites
    set uses_count = uses_count + 1
    where id = v_invite.id;
  end if;

  -- Ensure minimal AmPro rows exist for older users (pre-trigger era).
  insert into public.ampro_users(user_id, email)
  values (p_user_id, null)
  on conflict (user_id) do nothing;

  insert into public.ampro_user_roles(user_id, role)
  values (p_user_id, 'user')
  on conflict (user_id) do nothing;

  insert into public.ampro_dancer_profiles(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  -- Auto-enroll / accept.
  insert into public.ampro_applications(performance_id, user_id, status, answers_json)
  values (v_invite.performance_id, p_user_id, 'accepted', '{}'::jsonb)
  on conflict (performance_id, user_id)
  do update set status = 'accepted', updated_at = now();

  insert into public.ampro_roster(performance_id, user_id)
  values (v_invite.performance_id, p_user_id)
  on conflict (performance_id, user_id) do nothing;

  return v_invite.performance_id;
end;
$$;

-- Only callable by the service_role key.
revoke execute on function public.claim_ampro_program_invite(text, uuid) from public;
grant execute on function public.claim_ampro_program_invite(text, uuid) to service_role;
