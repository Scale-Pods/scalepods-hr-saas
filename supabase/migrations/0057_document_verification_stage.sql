-- Migration 0057: Support Document Verification Stage
-- Inserts customizable Document Verification stage before Offers across campaigns

-- 1. Expand applications.current_stage check constraint to allow 'document_verification'
alter table public.applications drop constraint if exists applications_current_stage_check;
alter table public.applications add constraint applications_current_stage_check
  check (current_stage in ('needs_review', 'round', 'document_verification', 'offer'));

-- 2. Add document verification tracking columns to applications table
alter table public.applications
  add column if not exists requested_documents jsonb default '[]'::jsonb,
  add column if not exists documents_status text default 'not_requested'
    check (documents_status in ('not_requested', 'requested', 'partially_verified', 'verified', 'rejected')),
  add column if not exists documents_requested_at timestamptz,
  add column if not exists documents_verified_at timestamptz;

comment on column public.applications.requested_documents is 'Array of requested verification documents with status, e.g. [{"id": "doc_1", "name": "Govt Photo ID", "status": "pending"}]';
comment on column public.applications.documents_status is 'Overall document verification status: not_requested, requested, partially_verified, verified, rejected';
comment on column public.applications.documents_requested_at is 'Timestamp when document verification request email was dispatched';
comment on column public.applications.documents_verified_at is 'Timestamp when all documents were manually marked as verified';

-- 3. Drop existing decide_application overloads to prevent ambiguity
drop function if exists public.decide_application(uuid, text, text, boolean);
drop function if exists public.decide_application(uuid, text, text);

-- 4. Re-create decide_application with complete account_id, outbox, and document_verification handling
create or replace function public.decide_application(
  p_application_id uuid,
  p_action text,
  p_rejection_reason text default null,
  p_confirm_rejection boolean default false
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
  where id = v_application.campaign_id;
  if not found then
    raise exception 'campaign_not_found';
  end if;

  if v_campaign.status not in ('open', 'on') then
    raise exception 'job_closed' using detail = 'A closed job does not allow hiring actions.';
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
    set status = coalesce(status_before_hold, 'active'), status_before_hold = null
    where id = v_application.id;
    return jsonb_build_object('application_id', v_application.id, 'status', coalesce(v_application.status_before_hold, 'active'));
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
      coalesce(v_application.account_id, v_campaign.account_id), v_application.id, 'candidate_rejected',
      'application:' || v_application.id::text || ':rejected',
      jsonb_build_object('campaign_id', v_application.campaign_id, 'reason', nullif(btrim(p_rejection_reason), ''))
    ) on conflict (idempotency_key) do nothing;

    return jsonb_build_object('application_id', v_application.id, 'status', 'rejected');
  end if;

  if v_application.status = 'rejected' then
    raise exception 'application_rejected' using detail = 'A rejected application is final.';
  end if;

  if v_application.current_stage = 'offer' or v_application.status in ('offer_sent', 'offer_accepted', 'offer_rejected', 'offer_declined') then
    raise exception 'offer_stage_reached' using detail = 'This application has already reached the offer stage.';
  end if;

  -- Advance action logic
  if p_action = 'advance' then
    -- Handle transition from document_verification stage to offer stage
    if v_application.current_stage = 'document_verification' then
      update public.applications
      set current_stage = 'offer', current_round_number = null, status = 'offer_ready'
      where id = v_application.id;
      return jsonb_build_object('application_id', v_application.id, 'status', 'offer_ready', 'stage', 'offer');
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
      if not found or v_current_round.status not in ('completed','incomplete','passed','awaiting_review') then
        raise exception 'round_not_ready' using detail = 'The current round must be completed before advancing.';
      end if;
      if v_current_round.status = 'no_show' then
        raise exception 'no_show_rejection_only' using detail = 'A no-show can only be rejected after recruiter confirmation.';
      end if;
      v_next_number := coalesce(v_application.current_round_number, 0) + 1;
    end if;

    -- If past final configured round, advance into document_verification stage
    if v_next_number > coalesce(v_campaign.number_of_rounds, 1) then
      update public.applications
      set current_stage = 'document_verification', current_round_number = null, status = 'active'
      where id = v_application.id;
      return jsonb_build_object('application_id', v_application.id, 'status', 'active', 'stage', 'document_verification');
    end if;

    select * into v_next_round
    from public.campaign_rounds
    where campaign_id = v_application.campaign_id and round_number = v_next_number;
    if not found then
      -- Fallback to document_verification if next round is missing
      update public.applications
      set current_stage = 'document_verification', current_round_number = null, status = 'active'
      where id = v_application.id;
      return jsonb_build_object('application_id', v_application.id, 'status', 'active', 'stage', 'document_verification');
    end if;

    v_deadline := null;
    if v_next_round.round_type = 'assignment' then
      v_deadline := now() + make_interval(hours => coalesce(v_next_round.assignment_deadline_hours, 48));
    end if;

    insert into public.round_instances (
      account_id, candidate_id, campaign_id, application_id,
      round_number, round_type, status, deadline_at
    ) values (
      coalesce(v_application.account_id, v_campaign.account_id),
      v_application.candidate_id,
      v_application.campaign_id,
      v_application.id,
      v_next_number,
      v_next_round.round_type,
      'pending',
      v_deadline
    ) returning id into v_new_round_id;

    if v_next_round.round_type = 'assignment' then
      insert into public.assignments (
        account_id, application_id, round_instance_id, brief_text, deadline_at
      ) values (
        coalesce(v_application.account_id, v_campaign.account_id),
        v_application.id,
        v_new_round_id,
        v_next_round.brief_text,
        v_deadline
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
      coalesce(v_application.account_id, v_campaign.account_id),
      v_application.id,
      v_new_round_id,
      v_event_type,
      v_key,
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
  end if;

  raise exception 'unsupported_action';
end;
$$;

revoke all on function public.decide_application(uuid, text, text, boolean) from public, anon;
grant execute on function public.decide_application(uuid, text, text, boolean) to authenticated, service_role;
