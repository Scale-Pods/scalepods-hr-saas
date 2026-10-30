-- 0049_interviewer_evaluation_workflow.sql
-- RPCs to support automated post-interview evaluation dispatch and evaluation context retrieval

create extension if not exists "pgcrypto" with schema extensions;

-- 1. Function to find human interviews whose scheduled end time has elapsed and require evaluation
create or replace function public.get_due_interview_evaluations()
returns table (
  round_instance_id uuid,
  account_id uuid,
  campaign_id uuid,
  application_id uuid,
  candidate_id uuid,
  candidate_name text,
  candidate_email text,
  role_title text,
  company_name text,
  round_number int,
  scheduled_at timestamptz,
  interviewer_email text,
  interviewer_name text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select
    ri.id as round_instance_id,
    ri.account_id,
    ri.campaign_id,
    ri.application_id,
    ri.candidate_id,
    a.candidate_name,
    a.candidate_email,
    c.name as role_title,
    coalesce(acc.company_name, 'ScalePods') as company_name,
    ri.round_number,
    ri.scheduled_at,
    coalesce(tm.email, cr.interviewer_email) as interviewer_email,
    coalesce(tm.name, 'Interviewer') as interviewer_name
  from public.round_instances ri
  join public.applications a on a.id = ri.application_id
  join public.campaigns c on c.id = ri.campaign_id
  join public.accounts acc on acc.id = ri.account_id
  join public.campaign_rounds cr on cr.campaign_id = ri.campaign_id and cr.round_number = ri.round_number
  left join public.team_members tm on tm.id = cr.assigned_team_member_id
       or (cr.assigned_team_member_id is null and lower(tm.email) = lower(cr.interviewer_email) and tm.account_id = ri.account_id)
  left join public.interviewer_feedback_links fl on fl.round_instance_id = ri.id
  left join public.interviewer_feedback ifb on ifb.round_instance_id = ri.id
  where ri.round_type = 'human_interview'
    and ri.status = 'scheduled'
    and ri.scheduled_at is not null
    and ri.scheduled_at + coalesce(cr.duration_minutes, 45) * interval '1 minute' <= now()
    and c.status = 'open'
    and a.status not in ('rejected', 'offer_sent', 'hired')
    and fl.id is null
    and ifb.id is null
    and coalesce(tm.email, cr.interviewer_email) is not null;
end;
$$;

-- 2. Function to generate a secure feedback link for an interview round
create or replace function public.create_interviewer_feedback_link(
  p_round_instance_id uuid,
  p_expires_hours int default 48
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_round public.round_instances%rowtype;
  v_cr public.campaign_rounds%rowtype;
  v_tm public.team_members%rowtype;
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_link_id uuid;
begin
  select * into v_round from public.round_instances where id = p_round_instance_id;
  if not found or v_round.round_type <> 'human_interview' then
    raise exception 'invalid_round' using detail = 'Round instance not found or not a human interview.';
  end if;

  select * into v_cr from public.campaign_rounds
  where campaign_id = v_round.campaign_id and round_number = v_round.round_number;

  select * into v_tm from public.team_members
  where id = v_cr.assigned_team_member_id
     or (v_cr.assigned_team_member_id is null and lower(email) = lower(v_cr.interviewer_email) and account_id = v_round.account_id)
  limit 1;

  if not found and v_cr.interviewer_email is not null then
    insert into public.team_members (account_id, name, email, role)
    values (v_round.account_id, split_part(v_cr.interviewer_email, '@', 1), lower(btrim(v_cr.interviewer_email)), 'interviewer')
    on conflict (account_id, email) do nothing;

    select * into v_tm from public.team_members
    where account_id = v_round.account_id and lower(email) = lower(btrim(v_cr.interviewer_email))
    limit 1;
  end if;

  if not found then
    raise exception 'interviewer_not_found' using detail = 'Assigned team member not found.';
  end if;

  -- 32-byte hex token and standard SHA-256 hash
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token_hash := encode(sha256(v_token::bytea), 'hex');
  v_expires_at := now() + make_interval(hours => coalesce(p_expires_hours, 48));

  insert into public.interviewer_feedback_links (
    account_id, application_id, round_instance_id, team_member_id,
    token_hash, expires_at
  ) values (
    v_round.account_id, v_round.application_id, v_round.id, v_tm.id,
    v_token_hash, v_expires_at
  )
  on conflict (round_instance_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        revoked_at = null
  returning id into v_link_id;

  return jsonb_build_object(
    'link_id', v_link_id,
    'token', v_token,
    'expires_at', v_expires_at,
    'interviewer_email', coalesce(v_tm.email, v_cr.interviewer_email),
    'interviewer_name', v_tm.name
  );
end;
$$;

-- 3. Function to retrieve interview context for the evaluation page by token
create or replace function public.get_interviewer_feedback_context(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.interviewer_feedback_links%rowtype;
  v_round public.round_instances%rowtype;
  v_app public.applications%rowtype;
  v_campaign public.campaigns%rowtype;
  v_cr public.campaign_rounds%rowtype;
  v_account public.accounts%rowtype;
  v_interviewer public.team_members%rowtype;
  v_criteria jsonb;
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'invalid_token' using detail = 'Feedback token is required.';
  end if;

  select * into v_link
  from public.interviewer_feedback_links
  where token_hash = encode(sha256(p_token::bytea), 'hex');

  if not found then
    raise exception 'feedback_link_not_found' using detail = 'This feedback link does not exist.';
  end if;

  select * into v_round from public.round_instances where id = v_link.round_instance_id;
  select * into v_app from public.applications where id = v_link.application_id;
  select * into v_campaign from public.campaigns where id = v_round.campaign_id;
  select * into v_account from public.accounts where id = v_link.account_id;
  select * into v_interviewer from public.team_members where id = v_link.team_member_id;

  select * into v_cr from public.campaign_rounds
  where campaign_id = v_round.campaign_id and round_number = v_round.round_number;

  v_criteria := coalesce(
    v_cr.evaluation_criteria,
    '[
      {"name": "Technical Proficiency", "weight": 25},
      {"name": "Problem Solving & Analytical Thinking", "weight": 25},
      {"name": "Communication & Clarity", "weight": 25},
      {"name": "Culture & Collaboration Fit", "weight": 25}
    ]'::jsonb
  );

  return jsonb_build_object(
    'is_valid', (v_link.used_at is null and v_link.no_show_at is null and v_link.revoked_at is null and v_link.expires_at > now()),
    'status', case
      when v_link.used_at is not null then 'already_submitted'
      when v_link.no_show_at is not null then 'no_show_reported'
      when v_link.expires_at <= now() then 'expired'
      when v_link.revoked_at is not null then 'revoked'
      else 'active'
    end,
    'candidate_name', v_app.candidate_name,
    'candidate_email', v_app.candidate_email,
    'role_title', v_campaign.name,
    'company_name', coalesce(v_account.company_name, 'ScalePods'),
    'round_number', v_round.round_number,
    'scheduled_at', v_round.scheduled_at,
    'interviewer_name', coalesce(v_interviewer.name, 'Interviewer'),
    'interviewer_email', coalesce(v_interviewer.email, v_cr.interviewer_email),
    'evaluation_criteria', v_criteria,
    'questions', coalesce(v_cr.questions, '[]'::jsonb),
    'expires_at', v_link.expires_at
  );
end;
$$;

-- 4. Update submit_interviewer_feedback and report_interviewer_no_show with built-in sha256
create or replace function public.submit_interviewer_feedback(
  p_token text,
  p_criteria_scores jsonb,
  p_overall_score numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.interviewer_feedback_links%rowtype;
  v_round public.round_instances%rowtype;
  v_application public.applications%rowtype;
  v_item jsonb;
  v_score numeric;
  v_id uuid;
begin
  select * into v_link
  from public.interviewer_feedback_links
  where token_hash = encode(sha256(p_token::bytea), 'hex')
    and used_at is null and no_show_at is null and revoked_at is null
    and expires_at > now();
  if not found then
    raise exception 'feedback_link_invalid' using detail = 'This feedback link is invalid or expired.';
  end if;
  if p_criteria_scores is null
     or jsonb_typeof(p_criteria_scores) is distinct from 'array'
     or jsonb_array_length(p_criteria_scores) = 0 then
    raise exception 'feedback_required' using detail = 'Submit a score for each required criterion.';
  end if;
  if p_overall_score is null or p_overall_score < 1 or p_overall_score > 100 then
    raise exception 'feedback_score_invalid' using detail = 'Scores must be between 1 and 100.';
  end if;
  for v_item in select value from jsonb_array_elements(p_criteria_scores) loop
    begin
      v_score := (v_item->>'score')::numeric;
    exception when others then
      raise exception 'feedback_score_invalid' using detail = 'Each criterion needs a numeric score from 1 to 100.';
    end;
    if v_score < 1 or v_score > 100 then
      raise exception 'feedback_score_invalid' using detail = 'Each criterion score must be between 1 and 100.';
    end if;
  end loop;

  select * into v_round from public.round_instances where id = v_link.round_instance_id;
  select * into v_application from public.applications where id = v_link.application_id;
  if v_round.status <> 'scheduled' or v_application.status in ('rejected','offer_sent') then
    raise exception 'feedback_not_available' using detail = 'Feedback is no longer available for this interview.';
  end if;
  if not exists (
    select 1 from public.campaigns c
    where c.id = v_round.campaign_id and c.account_id = v_link.account_id and c.status = 'open'
  ) then
    raise exception 'job_closed' using detail = 'Feedback cannot be submitted for a closed job.';
  end if;

  insert into public.interviewer_feedback (
    account_id, application_id, round_instance_id, team_member_id,
    criteria_scores, overall_score, notes
  ) values (
    v_link.account_id, v_link.application_id, v_link.round_instance_id,
    v_link.team_member_id, p_criteria_scores, p_overall_score, p_notes
  ) returning id into v_id;

  insert into public.application_evaluations (
    account_id, application_id, round_instance_id, score_type,
    score, criteria_scores, evidence, notes
  ) values (
    v_link.account_id, v_link.application_id, v_link.round_instance_id, 'human_feedback',
    p_overall_score, p_criteria_scores, '[]'::jsonb, p_notes
  );

  insert into public.decision_ledger (
    account_id, candidate_id, application_id, round_instance_id,
    stage, score, score_type, rationale, source
  ) values (
    v_link.account_id, v_application.candidate_id, v_link.application_id, v_link.round_instance_id,
    'round', p_overall_score, 'human_feedback', p_notes, 'manual'
  );

  update public.interviewer_feedback_links set used_at = now() where id = v_link.id;
  update public.round_instances set status = 'completed' where id = v_round.id;
  return v_id;
end;
$$;

create or replace function public.report_interviewer_no_show(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.interviewer_feedback_links%rowtype;
  v_round public.round_instances%rowtype;
begin
  select * into v_link
  from public.interviewer_feedback_links
  where token_hash = encode(sha256(p_token::bytea), 'hex')
    and used_at is null and no_show_at is null and revoked_at is null
    and expires_at > now();
  if not found then
    raise exception 'feedback_link_invalid' using detail = 'This feedback link is invalid or expired.';
  end if;
  select * into v_round from public.round_instances where id = v_link.round_instance_id;
  if v_round.status <> 'scheduled' or v_round.scheduled_at > now() then
    raise exception 'no_show_not_available' using detail = 'This interview cannot be marked as a no-show yet.';
  end if;
  if not exists (
    select 1 from public.campaigns c
    where c.id = v_round.campaign_id and c.account_id = v_link.account_id and c.status = 'open'
  ) then
    raise exception 'job_closed' using detail = 'A no-show cannot be reported for a closed job.';
  end if;
  update public.interviewer_feedback_links set no_show_at = now() where id = v_link.id;
  update public.round_instances set status = 'no_show' where id = v_round.id;
end;
$$;

-- Permissions
grant execute on function public.get_due_interview_evaluations() to service_role;
grant execute on function public.create_interviewer_feedback_link(uuid, int) to service_role;
grant execute on function public.get_interviewer_feedback_context(text) to anon, authenticated, service_role;
grant execute on function public.submit_interviewer_feedback(text, jsonb, numeric, text) to anon, authenticated, service_role;
grant execute on function public.report_interviewer_no_show(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
