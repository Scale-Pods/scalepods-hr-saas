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

-- 3. Update decide_application stored procedure to support advancing to document_verification
-- and advancing from document_verification to offer stage
create or replace function public.decide_application(
  p_application_id uuid,
  p_action text,
  p_rejection_reason text default null,
  p_confirm_rejection boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_application public.applications%rowtype;
  v_campaign public.campaigns%rowtype;
  v_current_round public.round_instances%rowtype;
  v_next_number integer;
  v_next_round public.campaign_rounds%rowtype;
  v_instance_id uuid;
  v_prev_status text;
begin
  select * into v_application from public.applications where id = p_application_id for update;
  if not found then
    raise exception 'application_not_found';
  end if;

  select * into v_campaign from public.campaigns where id = v_application.campaign_id;
  if not found then
    raise exception 'campaign_not_found';
  end if;

  if p_action = 'hold' then
    if v_application.status in ('rejected', 'offer_accepted', 'offer_rejected', 'offer_declined') then
      raise exception 'invalid_state' using detail = 'Cannot hold a finalized application.';
    end if;
    v_prev_status := v_application.status;
    update public.applications
    set status = 'on_hold', status_before_hold = v_prev_status
    where id = v_application.id;
    return jsonb_build_object('application_id', v_application.id, 'status', 'on_hold');
  end if;

  if p_action = 'resume' then
    if v_application.status <> 'on_hold' then
      raise exception 'invalid_state' using detail = 'Application is not on hold.';
    end if;
    update public.applications
    set status = coalesce(v_application.status_before_hold, 'active'), status_before_hold = null
    where id = v_application.id;
    return jsonb_build_object('application_id', v_application.id, 'status', coalesce(v_application.status_before_hold, 'active'));
  end if;

  if p_action = 'reject' then
    update public.applications
    set status = 'rejected', rejection_reason = p_rejection_reason
    where id = v_application.id;
    return jsonb_build_object('application_id', v_application.id, 'status', 'rejected');
  end if;

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
      v_next_number := coalesce(v_application.current_round_number, 0) + 1;
    end if;

    -- If past final round, advance into document_verification stage
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

    insert into public.round_instances(campaign_id, candidate_id, application_id, round_number, round_type, status)
    values (v_application.campaign_id, v_application.candidate_id, v_application.id, v_next_number, v_next_round.round_type, 'pending')
    returning id into v_instance_id;

    update public.applications
    set current_stage = 'round', current_round_number = v_next_number, status = 'active'
    where id = v_application.id;

    return jsonb_build_object(
      'application_id', v_application.id,
      'status', 'active',
      'stage', 'round',
      'round_instance_id', v_instance_id,
      'round_number', v_next_number
    );
  end if;

  raise exception 'unsupported_action';
end;
$$;

