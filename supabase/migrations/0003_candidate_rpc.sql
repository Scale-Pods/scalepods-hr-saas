-- ScalePods schema, migration 3 of 4
-- Token-gated SECURITY DEFINER RPCs powering the candidate-facing pages
-- (/book, /interview, /assignment). No row-level anon policies are used;
-- every call validates a candidate_access_tokens row first.

-- ---------------------------------------------------------------------------
-- Candidate token validation
-- n8n inserts a row: token_hash = encode(sha256(raw_token), 'hex').
-- ---------------------------------------------------------------------------
create or replace function public.candidate_token_valid(
  p_token text,
  p_resource_type text,
  p_resource_id uuid,
  p_max_age_seconds int default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_hash text := encode(sha256(coalesce(p_token, '')::bytea), 'hex');
begin
  if p_token is null or p_token = '' then
    return false;
  end if;
  return exists (
    select 1 from public.candidate_access_tokens t
    where t.token_hash = v_hash
      and t.resource_type = p_resource_type
      and t.resource_id = p_resource_id
      and t.revoked_at is null
      and t.expires_at > now()
      and (p_max_age_seconds is null
            or t.created_at >= now() - make_interval(secs => p_max_age_seconds))
  );
end $$;

-- ---------------------------------------------------------------------------
-- get_booking_context - /book/:round_instance_id
-- ---------------------------------------------------------------------------
create or replace function public.get_booking_context(
  p_round_instance_id uuid,
  p_token text,
  p_tz_offset_minutes int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ri round_instances%rowtype;
declare v_cand candidates%rowtype;
declare v_camp campaigns%rowtype;
declare v_cr campaign_rounds%rowtype;
declare v_account accounts%rowtype;
declare v_booked jsonb;
begin
  if not public.candidate_token_valid(p_token, 'booking', p_round_instance_id) then
    raise exception 'invalid_link' using detail = 'This booking link is invalid or has expired.';
  end if;

  select * into v_ri from round_instances where id = p_round_instance_id;
  if not found then raise exception 'invalid_link' using detail = 'Round not found.'; end if;

  select * into v_cand from candidates where id = v_ri.candidate_id;
  select * into v_camp from campaigns where id = v_ri.campaign_id;
  select * into v_cr from campaign_rounds
    where campaign_id = v_ri.campaign_id and round_number = v_ri.round_number;
  select * into v_account from accounts where id = v_ri.account_id;

  select jsonb_build_object(
    'event_id', ce.event_id, 'slot_start', ce.slot_start, 'slot_end', ce.slot_end,
    'meet_link', ce.meet_link, 'interviewer_email', ce.interviewer_email
  ) into v_booked
  from calendar_events ce where ce.round_instance_id = v_ri.id;

  return jsonb_build_object(
    'round_instance', jsonb_build_object(
      'id', v_ri.id, 'round_type', v_ri.round_type, 'status', v_ri.status,
      'scheduled_at', v_ri.scheduled_at, 'meet_link', v_ri.meet_link,
      'event_id', v_ri.event_id, 'deadline_at', v_ri.deadline_at
    ),
    'candidate', jsonb_build_object(
      'id', v_cand.id, 'name', v_cand.name, 'email', v_cand.email, 'phone', v_cand.phone
    ),
    'campaign', jsonb_build_object(
      'id', v_camp.id, 'name', v_camp.name, 'number_of_rounds', v_camp.number_of_rounds
    ),
    'round', jsonb_build_object(
      'round_number', v_cr.round_number, 'round_type', v_cr.round_type,
      'interviewer_email', v_cr.interviewer_email,
      'cutoff_score', v_cr.cutoff_score,
      'daily_start_time', to_char(v_cr.daily_start_time, 'HH24:MI'),
      'daily_end_time', to_char(v_cr.daily_end_time, 'HH24:MI')
    ),
    'account', jsonb_build_object(
      'tier', v_account.tier,
      'voice_screening_included', v_account.tier in ('basic','growth','enterprise')
    ),
    'booked_event', v_booked
  );
end $$;

-- ---------------------------------------------------------------------------
-- get_session_context - /interview/:session_id/check + /conduct
-- ---------------------------------------------------------------------------
create or replace function public.get_session_context(
  p_session_id uuid,
  p_token text,
  p_tz_offset_minutes int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_sess interview_sessions%rowtype;
declare v_ri round_instances%rowtype;
declare v_cand candidates%rowtype;
declare v_camp campaigns%rowtype;
declare v_cr campaign_rounds%rowtype;
begin
  if not public.candidate_token_valid(p_token, 'session', p_session_id) then
    raise exception 'invalid_link' using detail = 'This interview link is invalid or has expired.';
  end if;
  select * into v_sess from interview_sessions where id = p_session_id;
  if not found then raise exception 'invalid_link' using detail = 'Session not found.'; end if;
  select * into v_ri from round_instances where id = v_sess.round_instance_id;
  select * into v_cand from candidates where id = v_sess.candidate_id;
  select * into v_camp from campaigns where id = v_ri.campaign_id;
  select * into v_cr from campaign_rounds
    where campaign_id = v_ri.campaign_id and round_number = v_ri.round_number;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_sess.id, 'status', v_sess.status, 'expires_at', v_sess.expires_at,
      'invite_link', v_sess.invite_link
    ),
    'round_instance', jsonb_build_object(
      'id', v_ri.id, 'round_type', v_ri.round_type,
      'scheduled_at', v_ri.scheduled_at, 'deadline_at', v_ri.deadline_at
    ),
    'candidate', jsonb_build_object(
      'id', v_cand.id, 'name', v_cand.name, 'email', v_cand.email
    ),
    'campaign', jsonb_build_object(
      'id', v_camp.id, 'name', v_camp.name, 'number_of_rounds', v_camp.number_of_rounds
    ),
    'round', jsonb_build_object(
      'round_number', v_cr.round_number, 'round_type', v_cr.round_type,
      'cutoff_score', v_cr.cutoff_score
    ),
    'account', jsonb_build_object('id', v_ri.account_id, 'tier', (select a.tier from accounts a where a.id = v_ri.account_id))
  );
end $$;

-- ---------------------------------------------------------------------------
-- get_assignment_context - /assignment/:round_instance_id
-- ---------------------------------------------------------------------------
create or replace function public.get_assignment_context(
  p_round_instance_id uuid,
  p_token text,
  p_tz_offset_minutes int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ri round_instances%rowtype;
declare v_camp campaigns%rowtype;
declare v_cr campaign_rounds%rowtype;
declare v_sub jsonb;
begin
  if not public.candidate_token_valid(p_token, 'assignment', p_round_instance_id) then
    raise exception 'invalid_link' using detail = 'This assignment link is invalid or has expired.';
  end if;
  select * into v_ri from round_instances where id = p_round_instance_id;
  if not found then raise exception 'invalid_link' using detail = 'Round not found.'; end if;
  select * into v_camp from campaigns where id = v_ri.campaign_id;
  select * into v_cr from campaign_rounds
    where campaign_id = v_ri.campaign_id and round_number = v_ri.round_number;

  select jsonb_build_object(
    'id', s.id, 'text_response', s.text_response, 'file_paths', s.file_paths, 'submitted_at', s.submitted_at
  ) into v_sub
  from assignment_submissions s
  where s.round_instance_id = v_ri.id
  order by s.submitted_at desc
  limit 1;

  return jsonb_build_object(
    'round_instance', jsonb_build_object(
      'id', v_ri.id, 'round_type', v_ri.round_type,
      'status', v_ri.status, 'deadline_at', v_ri.deadline_at
    ),
    'campaign', jsonb_build_object(
      'id', v_camp.id, 'name', v_camp.name, 'jd_text', v_camp.jd_text
    ),
    'round', jsonb_build_object(
      'round_number', v_cr.round_number, 'round_type', v_cr.round_type,
      'cutoff_score', v_cr.cutoff_score
    ),
    'submission', v_sub
  );
end $$;

-- ---------------------------------------------------------------------------
-- get_available_slots - free intervals for a date within the round's daily
-- window, minus already-booked events on the same interviewer's calendar.
-- Times come back in UTC; the client renders them in the candidate's timezone.
-- ---------------------------------------------------------------------------
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
declare v_ri round_instances%rowtype;
declare v_cr campaign_rounds%rowtype;
declare v_day_start timestamptz;
declare v_day_end timestamptz;
begin
  if not public.candidate_token_valid(p_token, 'booking', p_round_instance_id) then
    raise exception 'invalid_link' using detail = 'Invalid or expired booking link.';
  end if;
  select * into v_ri from round_instances where id = p_round_instance_id;
  select * into v_cr from campaign_rounds
    where campaign_id = v_ri.campaign_id and round_number = v_ri.round_number;

  v_day_start := (p_date::text || 'T' || p_start_time::text)::timestamp AT TIME ZONE p_timezone;
  v_day_end   := (p_date::text || 'T' || p_end_time::text)::timestamp AT TIME ZONE p_timezone;

  if v_cr.interviewer_email is null then
    -- AI interviews have no interviewer calendar: the whole window is free.
    return jsonb_build_object(
      'window', jsonb_build_object('start', v_day_start, 'end', v_day_end),
      'blocked', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'window', jsonb_build_object('start', v_day_start, 'end', v_day_end),
    'blocked', coalesce((
      select jsonb_agg(jsonb_build_object('start', ce.slot_start, 'end', ce.slot_end)
                        order by ce.slot_start)
      from calendar_events ce
      where ce.account_id = v_ri.account_id
        and ce.interviewer_email = v_cr.interviewer_email
        and ce.round_instance_id <> v_ri.id
        and ce.slot_end > v_day_start
        and ce.slot_start < v_day_end
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- insert_proctoring_event - recorded by the conduct page while streaming.
-- ---------------------------------------------------------------------------
create or replace function public.insert_proctoring_event(
  p_session_id uuid,
  p_token text,
  p_event_type text,
  p_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.candidate_token_valid(p_token, 'session', p_session_id) then
    raise exception 'invalid_link' using detail = 'Invalid or expired session link.';
  end if;
  insert into proctoring_events (session_id, event_type, severity, detail)
  values (p_session_id, p_event_type, 'warning', p_detail);
end $$;

-- ---------------------------------------------------------------------------
-- insert_assignment_submission - records the submission once files are up.
-- ---------------------------------------------------------------------------
create or replace function public.insert_assignment_submission(
  p_round_instance_id uuid,
  p_token text,
  p_text_response text,
  p_file_paths text[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_ri round_instances%rowtype;
declare v_sub_id text;
begin
  if not public.candidate_token_valid(p_token, 'assignment', p_round_instance_id) then
    raise exception 'invalid_link' using detail = 'Invalid or expired assignment link.';
  end if;
  select * into v_ri from round_instances where id = p_round_instance_id;
  insert into assignment_submissions (account_id, candidate_id, round_instance_id, text_response, file_paths)
  values (v_ri.account_id, v_ri.candidate_id, v_ri.id, p_text_response,
          to_jsonb(coalesce(p_file_paths, '{}'::text[])))
  returning id::text into v_sub_id;
  return v_sub_id;
end $$;