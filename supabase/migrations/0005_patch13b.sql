-- ScalePods schema, migration 5 of 5
-- Backend "third pass" columns required by the frontend build prompt's 13b patch
-- list (PATCH 3, 6, 7, 8). Adds:
--   round_instances: 'no_show' status + fault_reason + retake_of_round_instance_id
--   accounts: billing_status + notification preferences (quiet hours, daily cap)
--   tier_limits: public, anon-readable tier allowance table (overage_behavior)
--   get_session_context / get_booking_context: expose retake + fault fields

-- Note: campaign_rounds intentionally does NOT get a brief_text column yet.
-- PATCH 4 says the backend currently ignores it (placeholder brief used server
-- side) - the frontend sends it in the create-campaign payload only.

-- =========================================================================
-- ROUND INSTANCES: no-show + platform-fault retakes
-- =========================================================================
alter table round_instances
  drop constraint round_instances_status_check,
  add constraint round_instances_status_check check
    (status in ('pending','scheduled','in_progress','completed','passed','failed','no_show'));

alter table round_instances
  add column fault_reason text,
  add column retake_of_round_instance_id uuid references round_instances(id) on delete set null;

create index round_instances_retake_idx on round_instances (retake_of_round_instance_id)
  where retake_of_round_instance_id is not null;

-- =========================================================================
-- ACCOUNTS: billing status + notification preferences (PATCH 6, 7)
-- =========================================================================
alter table accounts
  add column billing_status text not null default 'active'
    check (billing_status in ('active','trialing','past_due','canceled','incomplete')),
  add column quiet_hours_start time default time '21:00',
  add column quiet_hours_end time default time '09:00',
  add column max_messages_per_candidate_per_day int default 3;

-- =========================================================================
-- TIER LIMITS (PATCH 3): public, anon-readable allowance table
-- The frontend reads the numeric caps + overage_behavior here (RLS allows
-- anonymous SELECT), falling back to src/lib/tier.ts when the table is empty.
-- Growth's overage_behavior = 'metered': going over active_campaigns is
-- ALLOWED (logged to usage_events, billed later), not blocked. Everything
-- else is 'hard_stop'.
-- =========================================================================
create table tier_limits (
  id text primary key check (id in ('free','basic','growth','enterprise')),
  label text not null,
  max_rounds int not null,
  active_campaigns int,
  resumes_screened int,
  ai_interview int,
  ai_voice_screening int,
  scheduled_round int,
  offers_per_month int,
  whatsapp boolean not null default false,
  voice_screening boolean not null default false,
  sms boolean not null default false,
  assignment boolean not null default false,
  retention_days int not null,
  custom_identity boolean not null default false,
  overage_behavior text not null default 'hard_stop'
    check (overage_behavior in ('hard_stop','metered'))
);

insert into tier_limits
  (id, label, max_rounds, active_campaigns, resumes_screened, ai_interview,
   ai_voice_screening, scheduled_round, offers_per_month, whatsapp, voice_screening,
   sms, assignment, retention_days, custom_identity, overage_behavior)
values
  ('free',       'Free',       2, 1,  50,  10,  0,  10, 0,  false, false, false, false, 7,   false, 'hard_stop'),
  ('basic',      'Basic',      4, 3,  250, 50,  20, 50, 5,  true,  true,  false, false, 30,  false, 'hard_stop'),
  ('growth',     'Growth',     6, 25, null, 200, 100, 200, 50, true,  true,  false, true,  90,  true,  'metered'),
  ('enterprise', 'Enterprise', 6, null, null, null, null, null, null, true, true,  true,  true,  365, true,  'hard_stop')
on conflict (id) do nothing;

alter table tier_limits enable row level security;
create policy tier_limits_public_read on tier_limits
  for select using (true);

comment on table tier_limits is
  'Public, anon-readable tier allowances. Client gates are advisory; n8n Credit & Usage Guard enforces.';

-- =========================================================================
-- RPC UPDATES: expose retake + fault context to candidate pages (PATCH 8)
-- =========================================================================
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
      'scheduled_at', v_ri.scheduled_at, 'deadline_at', v_ri.deadline_at,
      'retake_of_round_instance_id', v_ri.retake_of_round_instance_id,
      'fault_reason', v_ri.fault_reason
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
      'event_id', v_ri.event_id, 'deadline_at', v_ri.deadline_at,
      'retake_of_round_instance_id', v_ri.retake_of_round_instance_id,
      'fault_reason', v_ri.fault_reason
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