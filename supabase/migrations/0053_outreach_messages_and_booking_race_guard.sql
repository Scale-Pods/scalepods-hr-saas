-- Migration 0053: Outreach messages persistence, WhatsApp delivery states,
-- booking race-condition reservation guard, and teammate calendar invite tokens.

-- =========================================================================
-- 1. OUTREACH LOG PERSISTENCE (Subject, Body, Provider Message ID, Recipient)
-- =========================================================================
alter table public.outreach_log
  add column if not exists subject text,
  add column if not exists message_body text,
  add column if not exists provider_message_id text,
  add column if not exists recipient text,
  add column if not exists metadata jsonb default '{}'::jsonb;

-- Ensure delivery_state check allows 'accepted', 'delivered', 'read', 'sent', etc.
alter table public.outreach_log
  drop constraint if exists outreach_log_delivery_state_check;

alter table public.outreach_log
  add constraint outreach_log_delivery_state_check check
    (delivery_state in (
      'queued',
      'sent',
      'accepted',
      'delivered',
      'read',
      'failed',
      'bounced',
      'suppressed',
      'held_for_window',
      'held_for_cap',
      'attempted',
      'connected'
    ));

create index if not exists outreach_log_provider_msg_idx
  on public.outreach_log (provider_message_id)
  where provider_message_id is not null;

create index if not exists outreach_log_candidate_channel_idx
  on public.outreach_log (candidate_id, channel, sent_at desc);

create index if not exists outreach_log_recipient_idx
  on public.outreach_log (recipient)
  where recipient is not null;

-- =========================================================================
-- 2. TEAM MEMBER CALENDAR INVITE TOKENS
-- =========================================================================
create table if not exists public.team_member_invites (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

alter table public.team_member_invites enable row level security;

-- Policy: Account owners can view and manage invites
drop policy if exists team_member_invites_account_policy on public.team_member_invites;
create policy team_member_invites_account_policy on public.team_member_invites
  for all using (account_id = auth.uid())
  with check (account_id = auth.uid());

grant select, insert, update, delete on public.team_member_invites to authenticated;
grant all on public.team_member_invites to service_role;

create index if not exists team_member_invites_token_idx on public.team_member_invites(token);
create index if not exists team_member_invites_member_idx on public.team_member_invites(team_member_id);

-- =========================================================================
-- 3. CALENDAR ATOMIC RESERVATION GUARD (Double-booking / Race condition prevention)
-- =========================================================================
-- Pre-reserve a slot atomically in the database BEFORE Google Calendar event is created.
-- If another candidate attempts to book the same slot at the same millisecond,
-- the second candidate fails here, preventing duplicate calendar events and emails.
create or replace function public.reserve_interview_slot(
  p_round_instance_id uuid,
  p_token text,
  p_slot_start timestamptz,
  p_slot_end timestamptz,
  p_is_reschedule boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.round_instances%rowtype;
  v_cr public.campaign_rounds%rowtype;
  v_job public.campaigns%rowtype;
  v_app public.applications%rowtype;
  v_interviewer_email text;
  v_resched_count int;
  v_reservation_id text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  if not public.candidate_token_valid(p_token, 'booking', p_round_instance_id) then
    raise exception 'booking_token_invalid' using errcode='28000';
  end if;

  select * into v_round
  from public.round_instances
  where id = p_round_instance_id
  for update;

  if not found or v_round.round_type <> 'human_interview' then
    raise exception 'round_not_bookable';
  end if;

  select * into v_job
  from public.campaigns
  where id = v_round.campaign_id and account_id = v_round.account_id;

  if not found or v_job.status <> 'open' then
    raise exception 'job_closed';
  end if;

  select * into v_app
  from public.applications
  where id = v_round.application_id and account_id = v_round.account_id;

  if not found or v_app.status in ('rejected', 'on_hold', 'offer_sent') then
    raise exception 'application_not_bookable';
  end if;

  select * into v_cr
  from public.campaign_rounds
  where campaign_id = v_round.campaign_id and round_number = v_round.round_number;

  v_interviewer_email := coalesce(
    v_cr.interviewer_email,
    (select tm.email from public.team_members tm where tm.id = v_cr.assigned_team_member_id),
    ''
  );

  -- Concurrency Control: Advisory transaction lock on the interviewer's calendar
  perform pg_advisory_xact_lock(hashtext('booking_interviewer:' || coalesce(nullif(v_interviewer_email, ''), v_round.account_id::text)));

  v_resched_count := coalesce(v_round.reschedule_count, 0);

  if p_slot_start is null or p_slot_end is null or p_slot_start <= now() or p_slot_end <= p_slot_start
     or v_cr.duration_minutes is null
     or extract(epoch from (p_slot_end - p_slot_start)) / 60 <> v_cr.duration_minutes then
    raise exception 'invalid_interview_slot';
  end if;

  -- Verify slot is not already booked or reserved by another candidate
  if exists (
    select 1 from public.calendar_events e
    where e.round_instance_id <> v_round.id
      and e.interviewer_email = v_interviewer_email
      and e.slot_start < p_slot_end
      and e.slot_end > p_slot_start
  ) then
    raise exception 'interview_slot_unavailable' using errcode='45000';
  end if;

  v_reservation_id := 'pending_reservation_' || gen_random_uuid()::text;

  if (p_is_reschedule or v_round.status = 'scheduled') then
    if v_resched_count >= 3 then
      raise exception 'max_reschedules_exceeded' using errcode='55001';
    end if;

    update public.calendar_events
    set slot_start = p_slot_start,
        slot_end = p_slot_end,
        event_id = v_reservation_id
    where round_instance_id = v_round.id;

    if not found then
      insert into public.calendar_events(account_id, round_instance_id, interviewer_email, event_id, slot_start, slot_end)
      values(v_round.account_id, v_round.id, v_interviewer_email, v_reservation_id, p_slot_start, p_slot_end);
    end if;
  else
    if v_round.status <> 'pending' then
      raise exception 'booking_state_conflict' using errcode='55000';
    end if;

    delete from public.calendar_events
    where round_instance_id = v_round.id and event_id like 'pending_reservation_%';

    insert into public.calendar_events(account_id, round_instance_id, interviewer_email, event_id, slot_start, slot_end)
    values(v_round.account_id, v_round.id, v_interviewer_email, v_reservation_id, p_slot_start, p_slot_end);
  end if;

  return jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'interviewer_email', v_interviewer_email,
    'account_id', v_round.account_id,
    'campaign_id', v_round.campaign_id,
    'round_number', v_round.round_number
  );
end;
$$;

revoke all on function public.reserve_interview_slot(uuid,text,timestamptz,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.reserve_interview_slot(uuid,text,timestamptz,timestamptz,boolean) to service_role;

-- Rollback / cancel pending reservation if Google Calendar event creation fails
create or replace function public.release_interview_reservation(
  p_round_instance_id uuid,
  p_reservation_id text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  if p_reservation_id is not null then
    delete from public.calendar_events
    where round_instance_id = p_round_instance_id and event_id = p_reservation_id;
  else
    delete from public.calendar_events
    where round_instance_id = p_round_instance_id and event_id like 'pending_reservation_%';
  end if;
end;
$$;

revoke all on function public.release_interview_reservation(uuid,text) from public,anon,authenticated;
grant execute on function public.release_interview_reservation(uuid,text) to service_role;

-- Update book_interview_slot to finalize any pending reservation cleanly
create or replace function public.book_interview_slot(
  p_round_instance_id uuid,
  p_token text,
  p_slot_start timestamptz,
  p_slot_end timestamptz,
  p_event_id text,
  p_meet_link text,
  p_is_reschedule boolean default false
) returns void language plpgsql security definer set search_path=public
as $$
declare
  v_round public.round_instances%rowtype;
  v_cr public.campaign_rounds%rowtype;
  v_job public.campaigns%rowtype;
  v_interviewer_email text;
  v_resched_count int;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  if not public.candidate_token_valid(p_token, 'booking', p_round_instance_id) then
    raise exception 'booking_token_invalid' using errcode='28000';
  end if;

  select * into v_round
  from public.round_instances
  where id = p_round_instance_id
  for update;

  if not found or v_round.round_type <> 'human_interview' then
    raise exception 'round_not_bookable';
  end if;

  select * into v_job
  from public.campaigns
  where id = v_round.campaign_id and account_id = v_round.account_id;

  if not found or v_job.status <> 'open' then
    raise exception 'job_closed';
  end if;

  select * into v_cr
  from public.campaign_rounds
  where campaign_id = v_round.campaign_id and round_number = v_round.round_number;

  v_interviewer_email := coalesce(
    v_cr.interviewer_email,
    (select tm.email from public.team_members tm where tm.id = v_cr.assigned_team_member_id),
    ''
  );

  -- Transaction advisory lock on interviewer
  perform pg_advisory_xact_lock(hashtext('booking_interviewer:' || coalesce(nullif(v_interviewer_email, ''), v_round.account_id::text)));

  v_resched_count := coalesce(v_round.reschedule_count, 0);

  -- Reschedule Branch
  if (p_is_reschedule or v_round.status = 'scheduled') and (v_round.event_id is not null or p_event_id is not null) then
    if v_resched_count >= 3 then
      raise exception 'max_reschedules_exceeded' using errcode='55001';
    end if;

    -- Verify slot is not already booked by another candidate
    if exists (
      select 1 from public.calendar_events e
      where e.round_instance_id <> v_round.id
        and e.interviewer_email = v_interviewer_email
        and e.slot_start < p_slot_end
        and e.slot_end > p_slot_start
    ) then
      raise exception 'interview_slot_unavailable' using errcode='45000';
    end if;

    update public.calendar_events
    set slot_start = p_slot_start,
        slot_end = p_slot_end,
        event_id = coalesce(p_event_id, event_id)
    where round_instance_id = v_round.id;

    if not found then
      insert into public.calendar_events(account_id, round_instance_id, interviewer_email, event_id, slot_start, slot_end)
      values(v_round.account_id, v_round.id, v_interviewer_email, coalesce(p_event_id, v_round.event_id, ''), p_slot_start, p_slot_end);
    end if;

    update public.round_instances
    set scheduled_at = p_slot_start,
        event_id = coalesce(p_event_id, event_id),
        meet_link = coalesce(p_meet_link, meet_link),
        conferencing_link = coalesce(p_meet_link, conferencing_link),
        reschedule_count = v_resched_count + 1
    where id = v_round.id;

    return;

  -- Initial Booking Branch
  elsif v_round.status = 'pending' and not p_is_reschedule then
    -- Verify slot is not booked by another candidate
    if exists (
      select 1 from public.calendar_events e
      where e.round_instance_id <> v_round.id
        and e.interviewer_email = v_interviewer_email
        and e.slot_start < p_slot_end
        and e.slot_end > p_slot_start
    ) then
      raise exception 'interview_slot_unavailable' using errcode='45000';
    end if;

    -- Update or insert calendar_events record
    update public.calendar_events
    set slot_start = p_slot_start,
        slot_end = p_slot_end,
        event_id = p_event_id
    where round_instance_id = v_round.id;

    if not found then
      insert into public.calendar_events(account_id, round_instance_id, interviewer_email, event_id, slot_start, slot_end)
      values(v_round.account_id, v_round.id, v_interviewer_email, p_event_id, p_slot_start, p_slot_end);
    end if;

    update public.round_instances
    set status = 'scheduled',
        scheduled_at = p_slot_start,
        event_id = p_event_id,
        meet_link = p_meet_link,
        conferencing_link = p_meet_link,
        reschedule_count = 0
    where id = v_round.id;

    return;

  else
    raise exception 'booking_state_conflict' using errcode='55000';
  end if;
end;
$$;

revoke all on function public.book_interview_slot(uuid,text,timestamptz,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.book_interview_slot(uuid,text,timestamptz,timestamptz,text,text,boolean) to service_role;

