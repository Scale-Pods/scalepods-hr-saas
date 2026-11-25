-- Migration 0068: Enforce no weekend bookings and cadence reminder safety
-- 1. Strictly block weekend bookings and reschedules at the database level
-- 2. Reject weekend availability slots in get_available_slots RPC
-- 3. Add validate_interview_reminder_dispatch to prevent 'interview_day' ("Your Interview Is Today")
--    from firing on weekends or on the wrong calendar day.

-- 1. Update book_interview_slot
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
  v_account_tz text := 'UTC';
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

  -- Lookup account timezone
  select coalesce(timezone, 'UTC') into v_account_tz
  from public.accounts
  where id = v_round.account_id;
  if v_account_tz is null or v_account_tz = '' then
    v_account_tz := 'UTC';
  end if;

  -- Weekend check: Saturday (6) and Sunday (0) are strictly disallowed
  if extract(dow from (p_slot_start at time zone v_account_tz)) in (0, 6) then
    raise exception 'weekend_booking_not_allowed' using errcode='40003',
      detail = 'Interview bookings are not permitted on weekends (Saturday and Sunday).';
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

  perform pg_advisory_xact_lock(hashtext('booking_interviewer:' || coalesce(nullif(v_interviewer_email, ''), v_round.account_id::text)));

  v_resched_count := coalesce(v_round.reschedule_count, 0);

  -- Reschedule Branch
  if (p_is_reschedule or v_round.status = 'scheduled') and (v_round.event_id is not null or p_event_id is not null) then
    if v_resched_count >= 3 then
      raise exception 'max_reschedules_exceeded' using errcode='55001';
    end if;

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

-- 2. Update get_available_slots to reject weekend dates
create or replace function public.get_available_slots(
  p_round_instance_id uuid,
  p_token text,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ri round_instances%rowtype;
  v_cr campaign_rounds%rowtype;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  if not public.candidate_token_valid(p_token, 'booking', p_round_instance_id) then
    raise exception 'invalid_link' using detail = 'Invalid or expired booking link.';
  end if;

  v_day_start := (p_date::text || 'T' || p_start_time::text)::timestamp AT TIME ZONE p_timezone;
  v_day_end   := (p_date::text || 'T' || p_end_time::text)::timestamp AT TIME ZONE p_timezone;

  -- Block weekends: Saturday (6) and Sunday (0)
  if extract(dow from p_date) in (0, 6) then
    return jsonb_build_object(
      'window', jsonb_build_object('start', v_day_start, 'end', v_day_end),
      'blocked', jsonb_build_array(jsonb_build_object('start', v_day_start, 'end', v_day_end)),
      'slots', '[]'::jsonb,
      'notice', 'Weekends (Saturday and Sunday) are excluded from interview booking.'
    );
  end if;

  select * into v_ri from round_instances where id = p_round_instance_id;
  select * into v_cr from campaign_rounds
    where campaign_id = v_ri.campaign_id and round_number = v_ri.round_number;

  if v_cr.interviewer_email is null then
    return jsonb_build_object(
      'window', jsonb_build_object('start', v_day_start, 'end', v_day_end),
      'blocked', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'window', jsonb_build_object('start', v_day_start, 'end', v_day_end),
    'blocked', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('start', e.slot_start, 'end', e.slot_end)
        )
        from public.calendar_events e
        where e.interviewer_email = v_cr.interviewer_email
          and e.slot_start < v_day_end
          and e.slot_end   > v_day_start
      ),
      '[]'::jsonb
    )
  );
end $$;

grant execute on function public.get_available_slots(uuid, text, date, time, time, text) to anon, authenticated, service_role;

-- 3. Function to validate interview reminder dispatch
-- Prevents "interview_day" from sending on a weekend or when the calendar date is not today.
create or replace function public.validate_interview_reminder_dispatch(
  p_round_instance_id uuid,
  p_stage text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ri public.round_instances%rowtype;
  v_tz text := 'UTC';
  v_now_local_date date;
  v_sched_local_date date;
  v_now_dow int;
  v_norm_stage text;
begin
  select * into v_ri from public.round_instances where id = p_round_instance_id;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'round_instance_not_found');
  end if;

  if v_ri.scheduled_at is null then
    return jsonb_build_object('allowed', false, 'reason', 'interview_not_scheduled');
  end if;

  select coalesce(timezone, 'UTC') into v_tz
  from public.accounts
  where id = v_ri.account_id;
  if v_tz is null or v_tz = '' then v_tz := 'UTC'; end if;

  v_now_local_date   := (p_now at time zone v_tz)::date;
  v_sched_local_date := (v_ri.scheduled_at at time zone v_tz)::date;
  v_now_dow          := extract(dow from (p_now at time zone v_tz));

  v_norm_stage := lower(trim(p_stage));

  -- Guard interview-day stage ("Your Interview Is Today")
  if v_norm_stage in ('interview_day', 'interview_link_today', 'interview_link_dispatch', 'interview_link') then
    -- Cannot send on weekends since interviews do not take place on weekends
    if v_now_dow in (0, 6) then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'weekend_interview_day_blocked',
        'detail', 'Interviews are not scheduled on weekends. Interview day notification suppressed.'
      );
    end if;

    -- Must match the exact calendar date in local timezone
    if v_now_local_date <> v_sched_local_date then
      if v_sched_local_date = v_now_local_date + 1 then
        return jsonb_build_object(
          'allowed', false,
          'reason', 'interview_is_tomorrow',
          'suggested_stage', 'pre_interview_24h',
          'detail', 'Interview is tomorrow, not today. Use pre_interview_reminder.'
        );
      else
        return jsonb_build_object(
          'allowed', false,
          'reason', 'date_mismatch',
          'detail', 'Current local date does not match scheduled interview date.'
        );
      end if;
    end if;

    return jsonb_build_object('allowed', true, 'reason', 'calendar_date_matches_today');
  end if;

  -- Guard pre-interview reminder ("Interview Tomorrow: 24h before")
  if v_norm_stage in ('pre_interview_reminder', 'pre_interview_24h', 'pre_interview') then
    if v_sched_local_date <= v_now_local_date then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'interview_already_today_or_past',
        'detail', 'Pre-interview 24h reminder is only valid prior to interview day.'
      );
    end if;
    return jsonb_build_object('allowed', true, 'reason', 'pre_interview_window_valid');
  end if;

  return jsonb_build_object('allowed', true, 'reason', 'stage_not_time_critical');
end;
$$;

grant execute on function public.validate_interview_reminder_dispatch(uuid, text, timestamptz) to anon, authenticated, service_role;

-- 4. Enhance can_send_now to support cadence validation
-- Drop the legacy 2-arg signature so PostgREST resolves the overload unambiguously
drop function if exists public.can_send_now(uuid, uuid);

create or replace function public.can_send_now(
  p_account_id uuid default null,
  p_candidate_id uuid default null,
  p_stage text default null,
  p_round_instance_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := 'UTC';
  v_val jsonb;
begin
  if p_account_id is not null then
    select coalesce(timezone, 'UTC') into v_tz
    from public.accounts
    where id = p_account_id;
    if v_tz is null then v_tz := 'UTC'; end if;
  end if;

  -- If stage and round_instance_id are provided, run dispatch validation
  if p_stage is not null and p_round_instance_id is not null then
    v_val := public.validate_interview_reminder_dispatch(p_round_instance_id, p_stage, now());
    if not coalesce((v_val->>'allowed')::boolean, true) then
      return v_val;
    end if;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'window_open'
  );
end;
$$;

grant execute on function public.can_send_now(uuid, uuid, text, uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

