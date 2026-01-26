-- Migration: auto-mark invite claim as paid for free programs
-- If a program has no price set (price IS NULL or <= 0), claiming an invite link should
-- create/update the related ampro_application with paid=true and payment_received_at=now().

BEGIN;

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
  v_price integer;
  v_free boolean := false;
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

  -- Determine whether this is a "free" program (no price configured).
  select p.price into v_price
  from public.ampro_programmas p
  where p.id = v_invite.performance_id;

  v_free := v_price is null or v_price <= 0;

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
  -- For free programs, also mark as paid at claim time (idempotent).
  insert into public.ampro_applications(
    performance_id,
    user_id,
    status,
    answers_json,
    paid,
    payment_received_at
  )
  values (
    v_invite.performance_id,
    p_user_id,
    'accepted',
    '{}'::jsonb,
    v_free,
    case when v_free then now() else null end
  )
  on conflict (performance_id, user_id)
  do update set
    status = 'accepted',
    updated_at = now(),
    paid = case when v_free then true else public.ampro_applications.paid end,
    payment_received_at = case
      when v_free and public.ampro_applications.payment_received_at is null then now()
      else public.ampro_applications.payment_received_at
    end;

  insert into public.ampro_roster(performance_id, user_id)
  values (v_invite.performance_id, p_user_id)
  on conflict (performance_id, user_id) do nothing;

  return v_invite.performance_id;
end;
$$;

COMMIT;
