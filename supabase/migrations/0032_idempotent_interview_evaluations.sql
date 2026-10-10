-- Make worker retries safe for AI interview session creation and round scoring.

create or replace function public.get_or_create_interview_session(
  p_account_id uuid,
  p_candidate_id uuid,
  p_round_instance_id uuid,
  p_expires_at timestamptz
) returns setof public.interview_sessions
language plpgsql security definer set search_path=public
as $$
declare v_round public.round_instances%rowtype; v_session public.interview_sessions%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  select * into v_round from public.round_instances
    where id=p_round_instance_id and account_id=p_account_id and candidate_id=p_candidate_id
    for update;
  if not found or v_round.round_type <> 'ai_interview' then raise exception 'round_type_mismatch'; end if;
  if not exists(select 1 from public.campaigns c where c.id=v_round.campaign_id and c.account_id=p_account_id and c.status='open') then
    raise exception 'job_closed';
  end if;
  if v_round.status not in ('pending','invited') then raise exception 'round_not_invitable'; end if;
  if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '31 days' then
    raise exception 'session_expiry_invalid';
  end if;
  select * into v_session from public.interview_sessions
    where round_instance_id=p_round_instance_id order by created_at desc limit 1 for update;
  if found then
    return next v_session;
    return;
  end if;
  insert into public.interview_sessions(account_id,candidate_id,round_instance_id,status,expires_at)
  values(p_account_id,p_candidate_id,p_round_instance_id,'invited',p_expires_at)
  returning * into v_session;
  return next v_session;
end;
$$;
revoke all on function public.get_or_create_interview_session(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.get_or_create_interview_session(uuid,uuid,uuid,timestamptz) to service_role;

-- The evaluator may be retried after a transient n8n failure. The round row lock
-- serializes worker retries and lets us update the latest existing score without
-- deleting any prior audit/history rows.

create or replace function public.record_round_evaluation(
  p_round_instance_id uuid,p_score_type text,p_score numeric,
  p_criteria_scores jsonb default '[]'::jsonb,p_evidence jsonb default '[]'::jsonb,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_round public.round_instances%rowtype; v_eval uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_score_type not in ('ai_interview','ai_voice','assignment') or p_score is null or p_score<1 or p_score>100 then raise exception 'evaluation_invalid'; end if;
  if jsonb_typeof(p_criteria_scores) is distinct from 'array' or jsonb_typeof(p_evidence) is distinct from 'array' then raise exception 'evaluation_invalid'; end if;
  select * into v_round from public.round_instances where id=p_round_instance_id for update;
  if not found or v_round.round_type <> (case p_score_type when 'ai_interview' then 'ai_interview' when 'ai_voice' then 'ai_voice_call' else 'assignment' end) then raise exception 'round_type_mismatch'; end if;
  if not exists(select 1 from public.campaigns c where c.id=v_round.campaign_id and c.status='open') then raise exception 'job_closed'; end if;
  select id into v_eval from public.application_evaluations
    where round_instance_id=v_round.id and score_type=p_score_type
    order by created_at desc limit 1 for update;
  if found then
    update public.application_evaluations set score=p_score,criteria_scores=p_criteria_scores,
      evidence=p_evidence,notes=p_notes,created_at=now() where id=v_eval;
  else
    insert into public.application_evaluations(account_id,application_id,round_instance_id,score_type,score,criteria_scores,evidence,notes)
    values(v_round.account_id,v_round.application_id,v_round.id,p_score_type,p_score,p_criteria_scores,p_evidence,p_notes)
    returning id into v_eval;
  end if;
  if not exists(select 1 from public.decision_ledger d where d.round_instance_id=v_round.id and d.score_type=p_score_type) then
    insert into public.decision_ledger(account_id,candidate_id,application_id,round_instance_id,stage,score,score_type,rationale,source)
    values(v_round.account_id,v_round.candidate_id,v_round.application_id,v_round.id,'round',p_score,p_score_type,p_notes,'workflow');
  else
    update public.decision_ledger set score=p_score,rationale=p_notes
      where round_instance_id=v_round.id and score_type=p_score_type;
  end if;
  update public.round_instances set status='completed' where id=v_round.id and status in ('scheduled','in_progress','awaiting_review','pending');
  if not found and v_round.status<>'completed' then raise exception 'round_not_evaluable'; end if;
  return v_eval;
end;
$$;
revoke all on function public.record_round_evaluation(uuid,text,numeric,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_round_evaluation(uuid,text,numeric,jsonb,jsonb,text) to service_role;
