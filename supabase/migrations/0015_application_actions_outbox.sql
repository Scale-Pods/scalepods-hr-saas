-- Explicit recruiter application actions. State changes and their workflow
-- events commit together so n8n cannot send an invite for an uncommitted stage.

create table public.workflow_outbox (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  round_instance_id uuid references public.round_instances(id) on delete cascade,
  event_type text not null check (event_type in ('round_invitation','voice_call_ready','candidate_rejected')),
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index workflow_outbox_pending_idx on public.workflow_outbox (available_at, created_at)
  where status in ('queued','failed');
alter table public.workflow_outbox enable row level security;
-- Service-role workflow workers are the only readers/writers.

create or replace function public.decide_application(
  p_application_id uuid,
  p_action text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_campaign public.campaigns%rowtype;
  v_current_round public.round_instances%rowtype;
  v_round public.campaign_rounds%rowtype;
  v_next_number integer;
  v_next_round public.campaign_rounds%rowtype;
  v_new_round_id uuid;
  v_deadline timestamptz;
  v_event_type text;
  v_key text;
begin
  if p_action not in ('advance','reject','hold','resume') then
    raise exception 'invalid_application_action' using detail = 'Choose Advance, Reject, Hold, or Resume.';
  end if;
  select * into v_application
  from public.applications
  where id = p_application_id
  for update;
  if not found then
    raise exception 'application_not_found' using detail = 'The application was not found.';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from v_application.account_id then
    raise exception 'not_authorized' using detail = 'The application is outside this workspace.';
  end if;
  select * into v_campaign
  from public.campaigns
  where id = v_application.campaign_id and account_id = v_application.account_id;
  if v_campaign.status <> 'open' then
    raise exception 'job_closed' using detail = 'A closed job does not allow hiring actions.';
  end if;
  if v_application.status = 'rejected' then
    raise exception 'application_rejected' using detail = 'A rejected application is final.';
  end if;
  if v_application.status = 'offer_sent' then
    raise exception 'offer_already_sent' using detail = 'This application has already reached the offer-sent stage.';
  end if;

  if p_action = 'hold' then
    if v_application.status = 'on_hold' then
      raise exception 'application_already_on_hold' using detail = 'This application is already on hold.';
    end if;
    update public.applications
    set status_before_hold = status, status = 'on_hold'
    where id = v_application.id;
    return jsonb_build_object('application_id', v_application.id, 'status', 'on_hold');
  elsif p_action = 'resume' then
    if v_application.status <> 'on_hold' then
      raise exception 'application_not_on_hold' using detail = 'This application is not on hold.';
    end if;
    update public.applications
    set status = status_before_hold, status_before_hold = null
    where id = v_application.id;
    return jsonb_build_object('application_id', v_application.id, 'status', v_application.status_before_hold);
  end if;

  if v_application.status = 'on_hold' then
    raise exception 'application_on_hold' using detail = 'Resume this application before advancing or rejecting it.';
  end if;

  if p_action = 'reject' then
    if v_application.current_stage = 'round' and v_application.current_round_number is not null then
      select * into v_current_round
      from public.round_instances
      where application_id = v_application.id
        and round_number = v_application.current_round_number
      order by created_at desc
      limit 1;
      if found and v_current_round.status = 'no_show' then
        -- An interviewer-reported no-show may be rejected after recruiter confirmation.
        null;
      elsif found and v_current_round.round_type = 'human_interview'
            and v_current_round.status = 'completed'
            and not exists (
              select 1 from public.interviewer_feedback f
              where f.round_instance_id = v_current_round.id
            ) then
        raise exception 'feedback_required' using detail = 'Submit interviewer feedback before deciding this round.';
      end if;
    end if;
    update public.applications
    set status = 'rejected', status_before_hold = null,
        rejection_reason = nullif(btrim(p_rejection_reason), '')
    where id = v_application.id;
    insert into public.workflow_outbox (
      account_id, application_id, event_type, idempotency_key, payload
    ) values (
      v_application.account_id, v_application.id, 'candidate_rejected',
      'application:' || v_application.id::text || ':rejected',
      jsonb_build_object('campaign_id', v_application.campaign_id, 'reason', nullif(btrim(p_rejection_reason), ''))
    ) on conflict (idempotency_key) do nothing;
    return jsonb_build_object('application_id', v_application.id, 'status', 'rejected');
  end if;

  if v_application.current_stage = 'offer' then
    raise exception 'offer_stage_reached' using detail = 'This application is already at the offer stage.';
  end if;

  if v_application.current_stage = 'needs_review' then
    v_next_number := 1;
  else
    select * into v_current_round
    from public.round_instances
    where application_id = v_application.id
      and round_number = v_application.current_round_number
    order by created_at desc
    limit 1;
    if not found or v_current_round.status not in ('completed','incomplete') then
      raise exception 'round_not_ready' using detail = 'The current round must be completed or marked Incomplete before advancing.';
    end if;
    if v_current_round.status = 'no_show' then
      raise exception 'no_show_rejection_only' using detail = 'A no-show can only be rejected after recruiter confirmation.';
    end if;
    if v_current_round.round_type = 'human_interview'
       and v_current_round.status = 'completed'
       and not exists (
         select 1 from public.interviewer_feedback f
         where f.round_instance_id = v_current_round.id
       ) then
      raise exception 'feedback_required' using detail = 'Submit interviewer feedback before deciding this round.';
    end if;
    v_next_number := v_application.current_round_number + 1;
  end if;

  if v_next_number > v_campaign.number_of_rounds then
    update public.applications
    set current_stage = 'offer', current_round_number = null, status = 'offer_ready'
    where id = v_application.id;
    return jsonb_build_object('application_id', v_application.id, 'status', 'offer_ready', 'stage', 'offer');
  end if;

  select * into v_next_round
  from public.campaign_rounds
  where campaign_id = v_application.campaign_id and round_number = v_next_number;
  if not found then
    raise exception 'round_sequence_incomplete' using detail = 'The next configured round is missing.';
  end if;

  v_deadline := null;
  if v_next_round.round_type = 'assignment' then
    v_deadline := now() + make_interval(hours => v_next_round.assignment_deadline_hours);
  end if;

  insert into public.round_instances (
    account_id, candidate_id, campaign_id, application_id,
    round_number, round_type, status, deadline_at
  ) values (
    v_application.account_id, v_application.candidate_id, v_application.campaign_id,
    v_application.id, v_next_number, v_next_round.round_type, 'pending', v_deadline
  ) returning id into v_new_round_id;

  if v_next_round.round_type = 'assignment' then
    insert into public.assignments (
      account_id, application_id, round_instance_id, brief_text, deadline_at
    ) values (
      v_application.account_id, v_application.id, v_new_round_id,
      v_next_round.brief_text, v_deadline
    );
  end if;

  update public.applications
  set current_stage = 'round', current_round_number = v_next_number, status = 'active'
  where id = v_application.id;

  v_event_type := case when v_next_round.round_type = 'ai_voice_call'
    then 'voice_call_ready' else 'round_invitation' end;
  v_key := 'application:' || v_application.id::text || ':round:' || v_next_number::text || ':' || v_event_type;
  insert into public.workflow_outbox (
    account_id, application_id, round_instance_id, event_type, idempotency_key, payload
  ) values (
    v_application.account_id, v_application.id, v_new_round_id, v_event_type, v_key,
    jsonb_build_object('campaign_id', v_application.campaign_id, 'round_number', v_next_number, 'round_type', v_next_round.round_type)
  ) on conflict (idempotency_key) do nothing;

  return jsonb_build_object(
    'application_id', v_application.id,
    'status', 'active',
    'stage', 'round',
    'round_number', v_next_number,
    'round_instance_id', v_new_round_id,
    'event_type', v_event_type
  );
end;
$$;

revoke all on function public.decide_application(uuid, text, text) from public, anon, authenticated;
grant execute on function public.decide_application(uuid, text, text) to authenticated, service_role;

create or replace function public.update_application_contact(
  p_application_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_whatsapp_opt_in boolean default false
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
      whatsapp_opt_in = coalesce(p_whatsapp_opt_in, false)
  where id = v_application.id;
end;
$$;

revoke all on function public.update_application_contact(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.update_application_contact(uuid, text, text, text, boolean) to authenticated, service_role;

-- Prevent direct browser updates that could bypass the explicit action RPCs.
revoke update on public.applications from authenticated;
grant select, insert, delete on public.applications to authenticated;

do $$
begin
  execute 'alter table public.workflow_outbox enable row level security';
end $$;
