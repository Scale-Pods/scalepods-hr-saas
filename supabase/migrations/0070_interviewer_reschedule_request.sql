-- 0070_interviewer_reschedule_request.sql
-- Token-gated interviewer reschedule request links and RPCs

create extension if not exists "pgcrypto" with schema extensions;

create table if not exists public.interviewer_reschedule_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  round_instance_id uuid not null references public.round_instances(id) on delete cascade,
  interviewer_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  requested_at timestamptz,
  reschedule_reason text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_interviewer_reschedule_links_ri
  on public.interviewer_reschedule_links(round_instance_id);

alter table public.interviewer_reschedule_links enable row level security;
-- No client policy: access is strictly via token-gated SECURITY DEFINER RPCs or service_role.

-- 1. Generate a secure reschedule-request link for an interviewer
create or replace function public.create_interviewer_reschedule_link(
  p_round_instance_id uuid,
  p_expires_hours int default 168
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_round public.round_instances%rowtype;
  v_cr public.campaign_rounds%rowtype;
  v_interviewer_email text;
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_link_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select * into v_round from public.round_instances where id = p_round_instance_id;
  if not found or v_round.round_type <> 'human_interview' then
    raise exception 'invalid_round' using detail = 'Round instance not found or not a human interview.';
  end if;

  select * into v_cr
  from public.campaign_rounds
  where campaign_id = v_round.campaign_id and round_number = v_round.round_number;

  v_interviewer_email := coalesce(
    nullif(btrim(v_cr.interviewer_email), ''),
    (select tm.email from public.team_members tm where tm.id = v_cr.assigned_team_member_id),
    ''
  );

  if v_interviewer_email = '' then
    raise exception 'interviewer_not_found' using detail = 'Assigned interviewer email not found.';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token_hash := encode(sha256(v_token::bytea), 'hex');
  v_expires_at := now() + make_interval(hours => coalesce(p_expires_hours, 168));

  insert into public.interviewer_reschedule_links (
    account_id,
    application_id,
    round_instance_id,
    interviewer_email,
    token_hash,
    expires_at
  ) values (
    v_round.account_id,
    v_round.application_id,
    v_round.id,
    lower(btrim(v_interviewer_email)),
    v_token_hash,
    v_expires_at
  )
  returning id into v_link_id;

  return jsonb_build_object(
    'link_id', v_link_id,
    'token', v_token,
    'expires_at', v_expires_at,
    'interviewer_email', lower(btrim(v_interviewer_email))
  );
end;
$$;

revoke all on function public.create_interviewer_reschedule_link(uuid, int) from public, anon, authenticated;
grant execute on function public.create_interviewer_reschedule_link(uuid, int) to service_role;

-- 2. Retrieve interview context for the interviewer reschedule-request page
create or replace function public.get_interviewer_reschedule_context(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.interviewer_reschedule_links%rowtype;
  v_round public.round_instances%rowtype;
  v_app public.applications%rowtype;
  v_cand public.candidates%rowtype;
  v_campaign public.campaigns%rowtype;
  v_account public.accounts%rowtype;
  v_status text;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'invalid_token' using detail = 'Reschedule token is required.';
  end if;

  select * into v_link
  from public.interviewer_reschedule_links
  where token_hash = encode(sha256(p_token::bytea), 'hex');

  if not found then
    raise exception 'reschedule_link_not_found' using detail = 'This reschedule link does not exist or is invalid.';
  end if;

  select * into v_round from public.round_instances where id = v_link.round_instance_id;
  if v_link.application_id is not null then
    select * into v_app from public.applications where id = v_link.application_id;
  end if;
  select * into v_cand from public.candidates where id = v_round.candidate_id;
  select * into v_campaign from public.campaigns where id = v_round.campaign_id;
  select * into v_account from public.accounts where id = v_link.account_id;

  v_status := case
    when v_link.requested_at is not null then 'already_requested'
    when v_link.revoked_at is not null then 'revoked'
    when v_link.expires_at <= now() then 'expired'
    when v_round.id is null or v_round.status <> 'scheduled' or v_campaign.id is null or v_campaign.status <> 'open' then 'not_scheduled'
    else 'active'
  end;

  return jsonb_build_object(
    'is_valid', (v_status = 'active'),
    'status', v_status,
    'round_instance_id', v_round.id,
    'candidate_name', coalesce(v_app.candidate_name, v_cand.name, 'Candidate'),
    'candidate_email', coalesce(v_app.candidate_email, v_cand.email, ''),
    'role_title', coalesce(v_campaign.name, 'Interview'),
    'company_name', coalesce(v_account.company_name, v_account.name, 'ScalePods'),
    'round_number', v_round.round_number,
    'scheduled_at', v_round.scheduled_at,
    'timezone', coalesce(v_account.timezone, 'Asia/Kolkata'),
    'interviewer_email', v_link.interviewer_email,
    'expires_at', v_link.expires_at,
    'requested_at', v_link.requested_at,
    'reschedule_reason', v_link.reschedule_reason
  );
end;
$$;

revoke all on function public.get_interviewer_reschedule_context(text) from public;
grant execute on function public.get_interviewer_reschedule_context(text) to anon, authenticated, service_role;

-- 3. Confirm interviewer reschedule request and issue a fresh candidate booking token
create or replace function public.request_interviewer_reschedule(
  p_token text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.interviewer_reschedule_links%rowtype;
  v_round public.round_instances%rowtype;
  v_app public.applications%rowtype;
  v_cand public.candidates%rowtype;
  v_campaign public.campaigns%rowtype;
  v_account public.accounts%rowtype;
  v_booking_token text;
  v_booking_token_hash text;
  v_booking_expires_at timestamptz;
  v_clean_reason text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'invalid_token' using detail = 'Reschedule token is required.';
  end if;

  select * into v_link
  from public.interviewer_reschedule_links
  where token_hash = encode(sha256(p_token::bytea), 'hex')
  for update;

  if not found then
    raise exception 'reschedule_link_not_found' using detail = 'This reschedule link does not exist.';
  end if;

  if v_link.requested_at is not null then
    raise exception 'reschedule_already_requested' using detail = 'A reschedule request has already been sent for this link.';
  end if;

  if v_link.revoked_at is not null then
    raise exception 'reschedule_link_revoked' using detail = 'This reschedule link has been revoked.';
  end if;

  if v_link.expires_at <= now() then
    raise exception 'reschedule_link_expired' using detail = 'This reschedule link has expired.';
  end if;

  select * into v_round from public.round_instances where id = v_link.round_instance_id;
  if not found or v_round.status <> 'scheduled' then
    raise exception 'round_not_scheduled' using detail = 'This interview is no longer scheduled.';
  end if;

  select * into v_campaign from public.campaigns where id = v_round.campaign_id;
  if not found or v_campaign.status <> 'open' then
    raise exception 'job_closed' using detail = 'This campaign is no longer open.';
  end if;

  if v_link.application_id is not null then
    select * into v_app from public.applications where id = v_link.application_id;
  end if;
  select * into v_cand from public.candidates where id = v_round.candidate_id;
  select * into v_account from public.accounts where id = v_link.account_id;

  v_clean_reason := nullif(btrim(coalesce(p_reason, '')), '');

  update public.interviewer_reschedule_links
  set requested_at = now(),
      reschedule_reason = v_clean_reason
  where id = v_link.id;

  -- Generate fresh candidate booking token for /book/{id}?tok=...&mode=reschedule
  v_booking_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_booking_token_hash := encode(sha256(v_booking_token::bytea), 'hex');
  v_booking_expires_at := greatest(
    now() + interval '7 days',
    least(coalesce(v_round.deadline_at, now() + interval '7 days'), now() + interval '14 days')
  );

  insert into public.candidate_access_tokens (
    account_id,
    resource_type,
    resource_id,
    token_hash,
    expires_at
  ) values (
    v_link.account_id,
    'booking',
    v_round.id,
    v_booking_token_hash,
    v_booking_expires_at
  );

  return jsonb_build_object(
    'success', true,
    'account_id', v_link.account_id,
    'candidate_id', v_round.candidate_id,
    'candidate_name', coalesce(v_app.candidate_name, v_cand.name, 'Candidate'),
    'candidate_email', coalesce(v_app.candidate_email, v_cand.email, ''),
    'candidate_phone', coalesce(v_app.candidate_phone, v_cand.phone, ''),
    'campaign_id', v_round.campaign_id,
    'role_title', coalesce(v_campaign.name, 'Interview'),
    'company_name', coalesce(v_account.company_name, v_account.name, 'ScalePods'),
    'round_instance_id', v_round.id,
    'round_number', v_round.round_number,
    'scheduled_at', v_round.scheduled_at,
    'timezone', coalesce(v_account.timezone, 'Asia/Kolkata'),
    'interviewer_email', v_link.interviewer_email,
    'booking_token', v_booking_token,
    'reason', v_clean_reason
  );
end;
$$;

revoke all on function public.request_interviewer_reschedule(text, text) from public, anon, authenticated;
grant execute on function public.request_interviewer_reschedule(text, text) to service_role;
