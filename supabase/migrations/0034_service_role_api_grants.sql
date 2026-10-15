-- n8n uses Supabase's service_role key for trusted backend workflows. Bypassing
-- RLS does not itself grant SQL table privileges, so explicitly grant the
-- backend role access to the public API objects it needs.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Keep future migrations' public tables, sequences, and RPCs usable by n8n.
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- Allow trusted background workflows running under service_role (where auth.uid() is null)
-- to execute application intake and resume screening by deriving the account from the campaign/application.

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
    p_resume_path := v_account_id::text || '/' || p_campaign_id::text || '/' || regexp_replace(btrim(p_resume_path), '^.*/', '');
  end if;

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

create or replace function public.record_resume_screening(
  p_application_id uuid,
  p_score integer,
  p_rationale text,
  p_raw_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_ledger_id uuid;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_score is null or p_score < 1 or p_score > 100 then
    raise exception 'resume_score_out_of_range' using errcode = '22023';
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id
    and (account_id = auth.uid() or coalesce(auth.role(), '') = 'service_role')
  for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  insert into public.decision_ledger (
    account_id, candidate_id, application_id, stage, score_type,
    score, rationale, raw_text, source
  ) values (
    v_application.account_id, v_application.candidate_id, v_application.id,
    'resume_screening', 'resume', p_score, nullif(btrim(p_rationale), ''),
    left(p_raw_text, 40000), 'workflow'
  )
  on conflict (application_id, score_type)
    where score_type = 'resume' and application_id is not null
  do update set score = excluded.score,
                rationale = excluded.rationale,
                raw_text = excluded.raw_text,
                decided_at = now(),
                created_at = now()
  returning id into v_ledger_id;

  return jsonb_build_object(
    'application_id', v_application.id,
    'score', p_score,
    'score_type', 'resume',
    'evaluation_id', v_ledger_id
  );
end;
$$;

create or replace function public.create_screened_application_intake(
  p_campaign_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_resume_path text,
  p_whatsapp_opt_in boolean,
  p_score integer,
  p_rationale text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application jsonb;
  v_screening jsonb;
begin
  if nullif(btrim(p_resume_path), '') is null then
    raise exception 'resume_path_required' using errcode = '22023';
  end if;
  v_application := public.create_application_intake(
    p_campaign_id, p_candidate_name, p_candidate_email, p_candidate_phone,
    p_resume_path, p_whatsapp_opt_in
  );
  v_screening := public.record_resume_screening(
    (v_application->>'id')::uuid, p_score, coalesce(p_rationale, 'Screened'), null
  );
  return jsonb_build_object('application', v_application, 'screening', v_screening);
end;
$$;

revoke all on function public.create_application_intake(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_application_intake(uuid, text, text, text, text, boolean) to authenticated, service_role;

revoke all on function public.record_resume_screening(uuid, integer, text, text) from public, anon;
grant execute on function public.record_resume_screening(uuid, integer, text, text) to authenticated, service_role;

revoke all on function public.create_screened_application_intake(uuid, text, text, text, text, boolean, integer, text) from public, anon;
grant execute on function public.create_screened_application_intake(uuid, text, text, text, text, boolean, integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';

