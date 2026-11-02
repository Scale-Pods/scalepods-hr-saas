-- 0052_backfill_and_fix_feedback_decision_ledger.sql
-- Fix submit_interviewer_feedback to ensure decision_ledger has a descriptive rationale and 'panel' source,
-- and backfill existing human feedback ledger records that had null rationales.

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
  v_rationale text;
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

  v_rationale := coalesce(
    nullif(trim(p_notes), ''),
    'Human interview evaluation completed with score of ' || round(p_overall_score)::text || '/100.'
  );

  insert into public.decision_ledger (
    account_id, candidate_id, application_id, round_instance_id,
    stage, score, score_type, rationale, source
  ) values (
    v_link.account_id, v_application.candidate_id, v_link.application_id, v_link.round_instance_id,
    'round', p_overall_score, 'human_feedback', v_rationale, 'panel'
  );

  update public.interviewer_feedback_links set used_at = now() where id = v_link.id;
  update public.round_instances set status = 'completed' where id = v_round.id;
  return v_id;
end;
$$;

-- Backfill any existing human_feedback decision_ledger records that have NULL or empty rationale
update public.decision_ledger
set rationale = 'Human interview evaluation completed with score of ' || round(coalesce(score, 0))::text || '/100.',
    source = 'panel'
where (score_type = 'human_feedback' or source = 'panel')
  and (rationale is null or trim(rationale) = '');

grant execute on function public.submit_interviewer_feedback(text, jsonb, numeric, text) to anon, authenticated, service_role;
