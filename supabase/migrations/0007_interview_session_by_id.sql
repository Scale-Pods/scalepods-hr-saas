-- ScalePods schema, migration 7
-- Interview links authenticate by the interview_sessions.id alone. n8n emails
-- /interview/{session_id} with no ?tok=, and no candidate_access_tokens row is
-- needed for sessions. Booking and assignment flows keep their token-gating.

-- ---------------------------------------------------------------------------
-- get_session_context - /interview/:session_id/check + /conduct
-- p_token is accepted for call-shape compatibility but no longer validated.
-- Expiry is enforced from interview_sessions.expires_at instead.
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
  select * into v_sess from interview_sessions where id = p_session_id;
  if not found then
    raise exception 'invalid_link' using detail = 'This interview link is invalid or has expired.';
  end if;
  if v_sess.expires_at is not null and v_sess.expires_at <= now() then
    raise exception 'invalid_link' using detail = 'This interview link has expired.';
  end if;
  select * into v_ri from round_instances where id = v_sess.round_instance_id;
  select * into v_cand from candidates where id = v_sess.candidate_id;
  select * into v_camp from campaigns where id = v_ri.campaign_id;
  select * into v_cr from campaign_rounds
    where campaign_id = v_ri.campaign_id and round_number = v_ri.round_number;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_sess.id, 'status', v_sess.status, 'expires_at', v_sess.expires_at,
      'invite_link', null
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
-- insert_proctoring_event - recorded by the conduct page while streaming.
-- Same session-id-only auth as get_session_context.
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
  if not exists (
    select 1 from public.interview_sessions
    where id = p_session_id and (expires_at is null or expires_at > now())
  ) then
    raise exception 'invalid_link' using detail = 'Invalid or expired session link.';
  end if;
  insert into proctoring_events (account_id, round_instance_id, event_type, severity, details)
  select s.account_id, s.round_instance_id, p_event_type, 'warning', jsonb_build_object('detail', p_detail)
  from public.interview_sessions s
  where s.id = p_session_id;
end $$;