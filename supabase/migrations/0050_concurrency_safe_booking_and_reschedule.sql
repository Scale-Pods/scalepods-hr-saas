-- Migration 0050: Concurrency safe booking, collision prevention, and resilient rescheduling
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

  -- Concurrency control: Transaction-level advisory lock on interviewer
  -- This guarantees simultaneous bookings/reschedules for the same interviewer serialize
  -- and cannot double-book the same slot.
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

    insert into public.calendar_events(account_id, round_instance_id, interviewer_email, event_id, slot_start, slot_end)
    values(v_round.account_id, v_round.id, v_interviewer_email, p_event_id, p_slot_start, p_slot_end);

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
