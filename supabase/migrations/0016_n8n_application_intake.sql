-- Recruiter-authorized application intake for the n8n backend.
-- n8n calls this RPC with the recruiter's Supabase JWT and the public anon key;
-- auth.uid() and RLS therefore remain the authority for workspace access.

create or replace function public.create_application_intake(
  p_campaign_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_resume_path text,
  p_whatsapp_opt_in boolean default false
)
returns jsonb
language plpgsql
security invoker
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
  if v_account_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if nullif(btrim(p_candidate_name), '') is null
     or nullif(v_email, '') is null
     or position('@' in v_email) < 2
     or nullif(btrim(p_resume_path), '') is null then
    raise exception 'candidate_name_email_and_resume_required' using errcode = '22023';
  end if;

  v_normalized_email := lower(
    regexp_replace(split_part(v_email, '@', 1), '[+].*', '')
    || '@' || split_part(v_email, '@', 2)
  );

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id and account_id = v_account_id
  for share;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if v_campaign.status <> 'open' then
    raise exception 'job_closed' using errcode = '55000';
  end if;

  select count(*), count(*) filter (where round_type = 'ai_voice_call')
    into v_round_count, v_voice_round_count
  from public.campaign_rounds
  where campaign_id = p_campaign_id;
  if v_round_count = 0 or v_round_count <> v_campaign.number_of_rounds then
    raise exception 'pipeline_incomplete' using errcode = '55000';
  end if;
  if v_voice_round_count > 0 and nullif(btrim(p_candidate_phone), '') is null then
    raise exception 'phone_required' using errcode = '22023';
  end if;
  if split_part(btrim(p_resume_path), '/', 1) <> v_account_id::text
     or split_part(btrim(p_resume_path), '/', 2) <> p_campaign_id::text then
    raise exception 'resume_path_outside_job' using errcode = '22023';
  end if;

  -- Reuse global identity without changing its contact details or resume; those
  -- values belong to each application and must not leak across jobs.
  insert into public.candidates (account_id, name, email, phone)
  values (v_account_id, btrim(p_candidate_name), v_email, nullif(btrim(p_candidate_phone), ''))
  on conflict (account_id, normalized_email) do nothing;

  select id into v_candidate_id
  from public.candidates
  where account_id = v_account_id and normalized_email = v_normalized_email;
  if v_candidate_id is null then
    raise exception 'candidate_identity_creation_failed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.applications
    where campaign_id = p_campaign_id and normalized_email = v_normalized_email
  ) then
    raise exception 'candidate_already_uploaded' using errcode = '23505';
  end if;

  insert into public.applications (
    account_id, campaign_id, candidate_id, candidate_name, candidate_email,
    candidate_phone, resume_path, whatsapp_opt_in, status, current_stage
  ) values (
    v_account_id, p_campaign_id, v_candidate_id, btrim(p_candidate_name), v_email,
    nullif(btrim(p_candidate_phone), ''), btrim(p_resume_path), coalesce(p_whatsapp_opt_in, false),
    'active', 'needs_review'
  ) returning * into v_application;

  return to_jsonb(v_application);
end;
$$;

revoke all on function public.create_application_intake(uuid, text, text, text, text, boolean)
  from public, anon;
grant execute on function public.create_application_intake(uuid, text, text, text, text, boolean)
  to authenticated;
