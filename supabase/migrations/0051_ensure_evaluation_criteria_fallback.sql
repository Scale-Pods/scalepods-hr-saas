-- Migration 0051: Ensure default criteria fallback when campaign_rounds.evaluation_criteria is empty array or null
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

  if v_cr.evaluation_criteria is null
     or jsonb_typeof(v_cr.evaluation_criteria) <> 'array'
     or jsonb_array_length(v_cr.evaluation_criteria) = 0 then
    v_criteria := '[
      {"name": "Technical Proficiency", "weight": 25, "description": "Domain knowledge, technical fundamentals, and hands-on execution competence"},
      {"name": "Problem Solving & Analytical Thinking", "weight": 25, "description": "Ability to break down problems, systematic logic, and solution architecture"},
      {"name": "Communication & Clarity", "weight": 25, "description": "Clarity of articulation, structured thought process, and active listening"},
      {"name": "Culture & Collaboration Fit", "weight": 25, "description": "Teamwork, adaptability, curiosity, coachability, and alignment with company core values"}
    ]'::jsonb;
  else
    v_criteria := v_cr.evaluation_criteria;
  end if;

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

grant execute on function public.get_interviewer_feedback_context(text) to anon, authenticated, service_role;
