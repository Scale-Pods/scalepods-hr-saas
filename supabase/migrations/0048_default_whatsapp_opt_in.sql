-- 0048_default_whatsapp_opt_in.sql
-- Change default WhatsApp opt-in status to true across applications table and intake/contact functions

-- 1. Alter applications table default
alter table public.applications
  alter column whatsapp_opt_in set default true;

-- 2. Update existing applications to be opted in by default
update public.applications
  set whatsapp_opt_in = true
  where whatsapp_opt_in is false or whatsapp_opt_in is null;

-- 3. Update create_application_intake function
create or replace function public.create_application_intake(
  p_campaign_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_resume_path text,
  p_whatsapp_opt_in boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
  v_campaign public.campaigns%rowtype;
  v_candidate_id uuid;
  v_application public.applications%rowtype;
  v_email text := lower(btrim(p_candidate_email));
  v_normalized_email text;
  v_round_count integer;
  v_voice_round_count integer;
begin
  if v_account_id is null and coalesce(auth.role(), '') = 'service_role' then
    select account_id into v_account_id
    from public.campaigns
    where id = p_campaign_id;
  end if;

  if v_account_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id;

  if not found or v_campaign.account_id <> v_account_id then
    raise exception 'campaign_not_found' using errcode = 'P0002';
  end if;

  if v_campaign.status <> 'open' then
    raise exception 'campaign_closed' using errcode = '22023';
  end if;

  select count(*), count(*) filter (where round_type = 'ai_voice_call')
  into v_round_count, v_voice_round_count
  from public.campaign_rounds
  where campaign_id = p_campaign_id;

  if coalesce(v_round_count, 0) = 0 then
    raise exception 'campaign_has_no_rounds' using errcode = '22023';
  end if;

  if coalesce(v_voice_round_count, 0) > 0 and nullif(btrim(p_candidate_phone), '') is null then
    raise exception 'phone_required' using errcode = '22023';
  end if;

  if nullif(btrim(p_candidate_name), '') is null or v_email is null or nullif(btrim(p_resume_path), '') is null then
    raise exception 'candidate_fields_required' using errcode = '22023';
  end if;

  v_normalized_email := lower(
    regexp_replace(split_part(v_email, '@', 1), '[+].*', '')
    || '@' || split_part(v_email, '@', 2)
  );

  insert into public.candidates (account_id, name, email, phone)
  values (v_account_id, btrim(p_candidate_name), v_email, nullif(btrim(p_candidate_phone), ''))
  on conflict (account_id, email) do update
  set name = excluded.name,
      phone = coalesce(excluded.phone, public.candidates.phone),
      updated_at = now()
  returning id into v_candidate_id;

  if exists (
    select 1
    from public.applications a
    where a.campaign_id = p_campaign_id
      and a.normalized_email = v_normalized_email
  ) then
    raise exception 'candidate_already_uploaded' using errcode = '23505';
  end if;

  insert into public.applications (
    account_id, campaign_id, candidate_id, candidate_name, candidate_email,
    candidate_phone, resume_path, whatsapp_opt_in, status, current_stage
  ) values (
    v_account_id, p_campaign_id, v_candidate_id, btrim(p_candidate_name), v_email,
    nullif(btrim(p_candidate_phone), ''), btrim(p_resume_path), coalesce(p_whatsapp_opt_in, true),
    'active', 'needs_review'
  ) returning * into v_application;

  return to_jsonb(v_application);
end;
$$;

revoke all on function public.create_application_intake(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_application_intake(uuid, text, text, text, text, boolean) to authenticated, service_role;

-- 4. Update update_application_contact function
create or replace function public.update_application_contact(
  p_application_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_whatsapp_opt_in boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_campaign public.campaigns%rowtype;
  v_normalized_email text;
begin
  select * into v_application from public.applications where id = p_application_id for update;
  if not found or (coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from v_application.account_id) then
    raise exception 'not_authorized' using detail = 'The application is outside this workspace.';
  end if;
  select * into v_campaign from public.campaigns where id = v_application.campaign_id;
  if v_campaign.status <> 'open' then
    raise exception 'job_closed' using detail = 'Candidate details cannot be changed for a closed job.';
  end if;
  if nullif(btrim(p_candidate_name), '') is null or nullif(btrim(p_candidate_email), '') is null then
    raise exception 'candidate_fields_required' using detail = 'Candidate name and email are required.';
  end if;
  if exists (
    select 1 from public.campaign_rounds r
    where r.campaign_id = v_application.campaign_id and r.round_type = 'ai_voice_call'
  ) and nullif(btrim(p_candidate_phone), '') is null then
    raise exception 'phone_required' using detail = 'A phone number is required for this job’s AI voice round.';
  end if;
  v_normalized_email := lower(
    regexp_replace(split_part(btrim(p_candidate_email), '@', 1), '[+].*', '')
    || '@' || split_part(btrim(p_candidate_email), '@', 2)
  );
  if exists (
    select 1 from public.applications a
    where a.campaign_id = v_application.campaign_id
      and a.id <> v_application.id
      and a.normalized_email = v_normalized_email
  ) then
    raise exception 'duplicate_application' using detail = 'This email already has an application for this job.';
  end if;
  update public.applications
  set candidate_name = btrim(p_candidate_name),
      candidate_email = btrim(p_candidate_email),
      candidate_phone = nullif(btrim(p_candidate_phone), ''),
      whatsapp_opt_in = coalesce(p_whatsapp_opt_in, true)
  where id = v_application.id;
end;
$$;

revoke all on function public.update_application_contact(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.update_application_contact(uuid, text, text, text, boolean) to authenticated, service_role;
