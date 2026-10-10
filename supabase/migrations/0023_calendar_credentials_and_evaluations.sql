-- Secure per-interviewer Google OAuth storage and shared evaluation contract.

create table public.interviewer_calendar_credentials (
  team_member_id uuid primary key references public.team_members(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  google_email text not null,
  refresh_token_ciphertext text not null,
  refresh_token_iv text not null,
  refresh_token_tag text not null,
  encryption_version integer not null default 1 check(encryption_version=1),
  updated_at timestamptz not null default now()
);
alter table public.interviewer_calendar_credentials enable row level security;
-- No policies or direct grants: only n8n service-role calls may read ciphertext.
revoke all on public.interviewer_calendar_credentials from public,anon,authenticated;

create or replace function public.create_calendar_oauth_state(p_team_member_id uuid,p_state_hash text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_account uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if nullif(p_state_hash,'') is null or length(p_state_hash)<>64 then raise exception 'invalid_oauth_state'; end if;
  select account_id into v_account from public.team_members where id=p_team_member_id and account_id=auth.uid();
  if not found then raise exception 'interviewer_not_found'; end if;
  insert into public.calendar_oauth_states(account_id,team_member_id,state_hash,expires_at)
  values(v_account,p_team_member_id,p_state_hash,now()+interval '10 minutes');
  insert into public.interviewer_calendar_connections(account_id,team_member_id,status)
  values(v_account,p_team_member_id,'pending')
  on conflict(team_member_id) do update set status='pending',disconnected_at=null;
  return jsonb_build_object('account_id',v_account,'team_member_id',p_team_member_id);
end;
$$;

create or replace function public.consume_calendar_oauth_state(p_state_hash text)
returns table(account_id uuid,team_member_id uuid)
language plpgsql security definer set search_path=public
as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  return query update public.calendar_oauth_states s set consumed_at=now()
    where s.state_hash=p_state_hash and s.consumed_at is null and s.expires_at>now()
    returning s.account_id,s.team_member_id;
end;
$$;

create or replace function public.save_interviewer_calendar_credential(
  p_account_id uuid,p_team_member_id uuid,p_google_email text,
  p_ciphertext text,p_iv text,p_tag text
) returns void language plpgsql security definer set search_path=public
as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if not exists(select 1 from public.team_members where id=p_team_member_id and account_id=p_account_id) then
    raise exception 'interviewer_account_mismatch';
  end if;
  if p_ciphertext is null or p_iv is null or p_tag is null or p_google_email is null then raise exception 'calendar_credential_incomplete'; end if;
  insert into public.interviewer_calendar_credentials(team_member_id,account_id,google_email,refresh_token_ciphertext,refresh_token_iv,refresh_token_tag)
  values(p_team_member_id,p_account_id,lower(p_google_email),p_ciphertext,p_iv,p_tag)
  on conflict(team_member_id) do update set account_id=excluded.account_id,google_email=excluded.google_email,
    refresh_token_ciphertext=excluded.refresh_token_ciphertext,refresh_token_iv=excluded.refresh_token_iv,
    refresh_token_tag=excluded.refresh_token_tag,updated_at=now();
  insert into public.interviewer_calendar_connections(account_id,team_member_id,google_email,google_calendar_id,credential_ref,status,connected_at,disconnected_at)
  values(p_account_id,p_team_member_id,lower(p_google_email),'primary',p_team_member_id::text,'active',now(),null)
  on conflict(team_member_id) do update set google_email=excluded.google_email,google_calendar_id='primary',
    credential_ref=excluded.credential_ref,status='active',connected_at=now(),disconnected_at=null;
end;
$$;

create or replace function public.get_interviewer_calendar_credential(p_team_member_id uuid)
returns table(account_id uuid,team_member_id uuid,google_email text,refresh_token_ciphertext text,refresh_token_iv text,refresh_token_tag text)
language plpgsql security definer set search_path=public
as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  return query select c.account_id,c.team_member_id,c.google_email,c.refresh_token_ciphertext,c.refresh_token_iv,c.refresh_token_tag
    from public.interviewer_calendar_credentials c join public.interviewer_calendar_connections x using(team_member_id)
    where c.team_member_id=p_team_member_id and x.status='active';
end;
$$;

create or replace function public.record_round_evaluation(
  p_round_instance_id uuid,p_score_type text,p_score numeric,
  p_criteria_scores jsonb default '[]'::jsonb,p_evidence jsonb default '[]'::jsonb,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_round public.round_instances%rowtype; v_eval uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_score_type not in ('ai_interview','ai_voice','assignment') or p_score is null or p_score<1 or p_score>100 then
    raise exception 'evaluation_invalid';
  end if;
  if jsonb_typeof(p_criteria_scores) is distinct from 'array' or jsonb_typeof(p_evidence) is distinct from 'array' then raise exception 'evaluation_invalid'; end if;
  select * into v_round from public.round_instances where id=p_round_instance_id for update;
  if not found or v_round.round_type <> (case p_score_type when 'ai_interview' then 'ai_interview' when 'ai_voice' then 'ai_voice_call' else 'assignment' end) then raise exception 'round_type_mismatch'; end if;
  if not exists(select 1 from public.campaigns c where c.id=v_round.campaign_id and c.status='open') then raise exception 'job_closed'; end if;
  insert into public.application_evaluations(account_id,application_id,round_instance_id,score_type,score,criteria_scores,evidence,notes)
  values(v_round.account_id,v_round.application_id,v_round.id,p_score_type,p_score,p_criteria_scores,p_evidence,p_notes)
  returning id into v_eval;
  insert into public.decision_ledger(account_id,candidate_id,application_id,round_instance_id,stage,score,score_type,rationale,source)
  values(v_round.account_id,v_round.candidate_id,v_round.application_id,v_round.id,'round',p_score,p_score_type,p_notes,'workflow');
  update public.round_instances set status='completed' where id=v_round.id and status in ('scheduled','in_progress','awaiting_review','pending');
  if not found then raise exception 'round_not_evaluable'; end if;
  return v_eval;
end;
$$;

revoke all on function public.create_calendar_oauth_state(uuid,text) from public,anon;
grant execute on function public.create_calendar_oauth_state(uuid,text) to authenticated;
revoke all on function public.consume_calendar_oauth_state(text) from public,anon,authenticated;
revoke all on function public.save_interviewer_calendar_credential(uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.get_interviewer_calendar_credential(uuid) from public,anon,authenticated;
revoke all on function public.record_round_evaluation(uuid,text,numeric,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.consume_calendar_oauth_state(text) to service_role;
grant execute on function public.save_interviewer_calendar_credential(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.get_interviewer_calendar_credential(uuid) to service_role;
grant execute on function public.record_round_evaluation(uuid,text,numeric,jsonb,jsonb,text) to service_role;

