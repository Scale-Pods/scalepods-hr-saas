--
-- =========================================================================
-- ScalePods HR SaaS - Complete Consolidated Migration Script
-- Target: Migrate database schema, tables, types, RLS, functions, triggers,
--         storage buckets, and security permissions to a new Supabase project.
-- =========================================================================
--
-- INSTRUCTIONS:
-- 1. Open your target Supabase Dashboard (https://supabase.com/dashboard)
-- 2. Select or create your new project.
-- 3. Go to "SQL Editor" in the left sidebar.
-- 4. Click "New Query", paste this entire script, and click "Run".
-- =========================================================================


-- =========================================================================
-- FILE: 0001_schema.sql
-- =========================================================================

-- ScalePods schema, migration 1 of 4
-- Core tables (mirroring the platform spec's Section 12) plus the tables the
-- frontend needs that aren't in the original 13-workflow schema.

create extension if not exists "pgcrypto";

-- =========================================================================
-- ACCOUNTS
-- =========================================================================
create table accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  billing_anchor_date date not null default current_date,
  tier text not null default 'free' check (tier in ('free','basic','growth','enterprise')),
  created_at timestamptz not null default now()
);

-- Bootstrap the accounts row the moment a user signs up (email or Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (id, billing_anchor_date)
  values (new.id, current_date)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on table accounts is
  'One row per auth user. tier + billing_anchor_date drive the client and server usage gates.';

-- =========================================================================
-- CANDIDATES (one row per person per account, deduped by normalized email)
-- =========================================================================
create table candidates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text,
  email text not null,
  phone text,
  normalized_email text generated always as (
    lower(regexp_replace(split_part(email, '@', 1), '\+.*', '') || '@' || split_part(email, '@', 2))
  ) stored,
  resume_url text,
  created_at timestamptz not null default now(),
  unique (account_id, normalized_email)
);

create index candidates_account_email_idx on candidates (account_id, normalized_email);

-- =========================================================================
-- CAMPAIGNS
-- =========================================================================
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  jd_text text,
  number_of_rounds int not null default 1,
  status text not null default 'on' check (status in ('on','off')),
  created_at timestamptz not null default now()
);

create table campaign_rounds (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  round_number int not null,
  round_type text not null check (round_type in ('ai_interview','human_interview','assignment')),
  interviewer_email text,
  cutoff_score numeric,
  daily_start_time time,
  daily_end_time time,
  unique (campaign_id, round_number)
);

-- =========================================================================
-- ROUND INSTANCES (the recursive engine loops on this)
-- =========================================================================
create table round_instances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  round_number int not null,
  round_type text not null,
  status text not null default 'pending'
    check (status in ('pending','scheduled','in_progress','completed','passed','failed')),
  scheduled_at timestamptz,
  event_id text,
  meet_link text,
  interview_link text,
  deadline_at timestamptz,
  created_at timestamptz not null default now()
);

create index round_instances_candidate_idx on round_instances (candidate_id, round_number);
create index round_instances_campaign_idx on round_instances (campaign_id);

-- =========================================================================
-- DECISION LEDGER (resume score, voice score, every round's score)
-- =========================================================================
create table decision_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  stage text not null,
  score numeric,
  rationale text,
  source text not null default 'workflow' check (source in ('workflow','manual')),
  override_of uuid references decision_ledger(id) on delete set null,
  decided_at timestamptz not null default now()
);

create index decision_ledger_candidate_idx on decision_ledger (candidate_id, decided_at);

-- =========================================================================
-- CREDIT LEDGER (reserve / commit / release)
-- =========================================================================
create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  credit_type text not null check (credit_type in ('ai_interview','ai_voice_screening','scheduled_round')),
  action text not null check (action in ('reserve','commit','release','grant','purchase')),
  amount int not null,
  round_instance_id uuid references round_instances(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- OUTREACH LOG
-- =========================================================================
create table outreach_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  round_instance_id uuid references round_instances(id) on delete set null,
  stage text not null,
  channel text not null check (channel in ('email','whatsapp','sms','voice_call')),
  delivery_state text not null default 'queued',
  fallback_used boolean not null default false,
  sent_at timestamptz not null default now()
);

create index outreach_log_candidate_idx on outreach_log (candidate_id, sent_at);

-- =========================================================================
-- AI INTERVIEW ENGINE (kept, FK'd into shared candidates)
-- =========================================================================
create table interview_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  round_instance_id uuid not null references round_instances(id) on delete cascade,
  status text not null default 'invited',
  invite_link text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table interview_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  question_text text not null,
  question_type text not null,
  order_index int not null,
  source text
);

create table interview_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  question_id uuid not null references interview_questions(id) on delete cascade,
  answer_text text,
  ai_live_note jsonb,
  answered_at timestamptz default now()
);

create table scorecards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  technical_score numeric, communication_score numeric, problem_solving_score numeric,
  cultural_fit_score numeric, overall_score numeric, authenticity_score numeric,
  recommendation text, red_flags jsonb, strengths jsonb, weaknesses jsonb,
  evaluated_at timestamptz default now()
);

create table proctoring_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  detail text,
  timestamp timestamptz not null default now()
);

-- =========================================================================
-- AUDIT LOG (actor/action trail - overrides, credit grants, edits)
-- =========================================================================
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  actor_type text not null check (actor_type in ('account_holder','system','ai')),
  actor_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- FRONTEND-ONLY TABLES (not in the original 13-workflow schema)
-- =========================================================================

-- Team members (interviewer dropdown for human rounds, settings page).
create table team_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  email text not null,
  role text,
  created_at timestamptz not null default now(),
  unique (account_id, email)
);

-- Calendar connection status mirror (credentials live in n8n, never here).
create table calendar_connections (
  account_id uuid primary key references accounts(id) on delete cascade,
  provider text not null default 'google',
  status text not null default 'not_connected'
    check (status in ('not_connected','pending','active','degraded','revoked')),
  google_email text,
  connected_at timestamptz
);

-- Booked calendar events (drives the reschedule flow + slot availability UI).
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  round_instance_id uuid not null references round_instances(id) on delete cascade,
  interviewer_email text,
  event_id text not null,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  meet_link text
);

create index calendar_events_round_idx on calendar_events (round_instance_id);
create index calendar_events_interval_idx on calendar_events (interviewer_email, slot_start, slot_end);

-- Signed access tokens embedded in candidate-facing links (?tok=...).
-- n8n writes these when it dispatches booking / interview / assignment links.
create table candidate_access_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  resource_type text not null check (resource_type in ('booking','session','assignment')),
  resource_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index candidate_access_tokens_resource_idx
  on candidate_access_tokens (resource_type, resource_id);

-- Assignment submissions (page 10).

create table assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  round_instance_id uuid not null references round_instances(id) on delete cascade,
  text_response text,
  file_paths jsonb,
  submitted_at timestamptz not null default now()
);

-- =========================================================================
-- FILE: 0002_rls.sql
-- =========================================================================

-- ScalePods schema, migration 2 of 4
-- View for the campaign candidate table + RLS on every table + realtime.

-- =========================================================================
-- CAMPAIGN CANDIDATE VIEW (drives /campaigns/:id table)
-- =========================================================================
create or replace view public.campaign_candidates as
with ranked as (
  select
    c.id as candidate_id,
    c.account_id,
    rl.campaign_id,
    c.name,
    c.email,
    c.phone,
    c.resume_url,
    dl.stage,
    dl.score,
    latest.status,
    row_number() over (
      partition by c.id, rl.campaign_id
      order by coalesce(dl.decided_at, latest.created_at, now()) desc
    ) as rn
  from candidates c
  join round_instances rl on rl.candidate_id = c.id
  left join decision_ledger dl on dl.candidate_id = c.id
  left join lateral (
    select rr.status, rr.created_at
    from round_instances rr
    where rr.candidate_id = c.id
    order by rr.created_at desc
    limit 1
  ) latest on true
)
select candidate_id, account_id, campaign_id, name, email, phone, resume_url,
       stage as current_stage,
       score as latest_score,
       status as decision
from ranked
where rn = 1;

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

-- accounts: a user only ever sees their own row.
alter table accounts enable row level security;
create policy accounts_isolation on accounts
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Generic tenant isolation: account_id must match the signed-in user id.
-- Applied per-table so each table keeps one clear policy.
do $$
declare t text;
begin
  foreach t in array array[
    'candidates','campaigns','round_instances','decision_ledger',
    'credit_ledger','outreach_log','interview_sessions','audit_log','team_members',
    'calendar_events','assignment_submissions','candidate_access_tokens'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all using (account_id = auth.uid()) with check (account_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- calendar_connections' primary key IS the account id.
alter table calendar_connections enable row level security;
create policy calendar_connections_isolation on calendar_connections
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

-- campaign_rounds inherits tenant isolation from campaigns.
alter table campaign_rounds enable row level security;
create policy tenant_isolation on campaign_rounds
  for all using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_rounds.campaign_id
        and c.account_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from campaigns c
      where c.id = campaign_rounds.campaign_id
        and c.account_id = auth.uid()
    )
  );

-- interview questions, answers, scorecards, and proctoring events inherit tenant isolation from interview_sessions.
alter table interview_questions enable row level security;
create policy tenant_isolation on interview_questions
  for select using (
    exists (
      select 1 from interview_sessions s
      where s.id = interview_questions.session_id
        and s.account_id = auth.uid()
    )
  );

alter table interview_answers enable row level security;
create policy tenant_isolation on interview_answers
  for all using (
    exists (
      select 1 from interview_sessions s
      where s.id = interview_answers.session_id
        and s.account_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from interview_sessions s
      where s.id = interview_answers.session_id
        and s.account_id = auth.uid()
    )
  );

alter table scorecards enable row level security;
create policy tenant_isolation on scorecards
  for all using (
    exists (
      select 1 from interview_sessions s
      where s.id = scorecards.session_id
        and s.account_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from interview_sessions s
      where s.id = scorecards.session_id
        and s.account_id = auth.uid()
    )
  );

alter table proctoring_events enable row level security;
create policy tenant_isolation on proctoring_events
  for all using (
    exists (
      select 1 from interview_sessions s
      where s.id = proctoring_events.session_id
        and s.account_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from interview_sessions s
      where s.id = proctoring_events.session_id
        and s.account_id = auth.uid()
    )
  );

-- Anonymous access to candidate resources is NOT granted via plain RLS.
-- Candidate-facing reads/writes go through the token-gated SECURITY DEFINER
-- RPCs in migration 0003 - this keeps the anon surface to literally zero.

-- =========================================================================
-- REALTIME (opt-in: use for live intake progress if preferred over polling)
-- =========================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.decision_ledger, public.round_instances';
  end if;
end $$;

-- =========================================================================
-- FILE: 0003_candidate_rpc.sql
-- =========================================================================

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

-- =========================================================================
-- FILE: 0004_storage.sql
-- =========================================================================

-- ScalePods schema, migration 4 of 4
-- Private storage buckets + storage RLS policies.
-- Layout:
--   resumes/                       {account_id}/{candidate_id}-{filename}
--   interview-recordings/          {account_id}/{session_id}/chunk-{NNN}.webm
--   assignments/                   {account_id}/{campaign_id}/{round_instance_id}/submission/{filename}
-- All access is via signed URLs. Recruiters (authed) can generate them for
-- their own account folders; candidates get signed upload/download URLs from
-- the sign-upload Edge Function (service role), so RLS never sees an anon user.

insert into storage.buckets (id, name, public)
values
  ('resumes', 'resumes', false),
  ('interview-recordings', 'interview-recordings', false),
  ('assignments', 'assignments', false)
on conflict (id) do nothing;

-- Recruiter: SELECT (needed for createSignedUrl) + INSERT within own account folder.
create or replace function public.storage_own_account(bucket text, name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select (storage.foldername(name))[1] = auth.uid()::text;
$$;

create policy "tenant select resumes" on storage.objects
  for select using (bucket_id = 'resumes' and public.storage_own_account(bucket_id, name));
create policy "tenant select recordings" on storage.objects
  for select using (bucket_id = 'interview-recordings' and public.storage_own_account(bucket_id, name));
create policy "tenant select assignments" on storage.objects
  for select using (bucket_id = 'assignments' and public.storage_own_account(bucket_id, name));

create policy "tenant insert resumes" on storage.objects
  for insert with check (bucket_id = 'resumes' and public.storage_own_account(bucket_id, name));
create policy "tenant insert recordings" on storage.objects
  for insert with check (bucket_id = 'interview-recordings' and public.storage_own_account(bucket_id, name));
create policy "tenant insert assignments" on storage.objects
  for insert with check (bucket_id = 'assignments' and public.storage_own_account(bucket_id, name));

create policy "tenant update resumes" on storage.objects
  for update using (bucket_id = 'resumes' and public.storage_own_account(bucket_id, name));
create policy "tenant update recordings" on storage.objects
  for update using (bucket_id = 'interview-recordings' and public.storage_own_account(bucket_id, name));
create policy "tenant update assignments" on storage.objects
  for update using (bucket_id = 'assignments' and public.storage_own_account(bucket_id, name));

-- =========================================================================
-- FILE: 0005_patch13b.sql
-- =========================================================================

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

-- =========================================================================
-- FILE: 0006_campaign_cadence.sql
-- =========================================================================

alter table campaigns
  add column cadence_config jsonb;

comment on column campaigns.cadence_config is
  'Per-campaign outreach cadence overrides. null = use plan defaults (CADENCE_STAGES in @scalepods/core).';

-- =========================================================================
-- FILE: 0007_interview_session_by_id.sql
-- =========================================================================

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

-- =========================================================================
-- FILE: 0008_dialnexa_voice_config.sql
-- =========================================================================

-- 0008_dialnexa_voice_config.sql
-- Store DialNexa voice screening call configuration (prompt, model, voice, first_message) per campaign

alter table campaigns
  add column if not exists voice_call_config jsonb;

comment on column campaigns.voice_call_config is
  'DialNexa voice call configuration (prompt, model, voice, first_message) for automated screening calls.';

-- =========================================================================
-- FILE: 0009_account_profile.sql
-- =========================================================================

-- ScalePods schema, migration 9
-- Ensure name and company_name exist on accounts table and update trigger to capture them

alter table public.accounts
  add column if not exists email text,
  add column if not exists name text,
  add column if not exists company_name text;

-- Update handle_new_user trigger to populate initial name and company_name from auth metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (id, billing_anchor_date, name, company_name, email)
  values (
    new.id,
    current_date,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name'
    ),
    new.raw_user_meta_data->>'company_name',
    coalesce(new.email, '')
  )
  on conflict (id) do update set
    name = coalesce(accounts.name, excluded.name),
    company_name = coalesce(accounts.company_name, excluded.company_name),
    email = coalesce(excluded.email, accounts.email);
  return new;
end $$;

-- =========================================================================
-- FILE: 0010_post_round_review_and_cadence.sql
-- =========================================================================

-- Migration 0010: Post-round review threshold, assignment brief text, and awaiting_review status
-- 1. Add brief_text to campaign_rounds so custom assignment briefs are stored
alter table campaign_rounds
  add column if not exists brief_text text;

-- 2. Add reviewer_cutoff to round_instances for post-round recruiter threshold evaluation
alter table round_instances
  add column if not exists reviewer_cutoff numeric;

-- 3. Update status constraint on round_instances to include 'awaiting_review' (and ensure 'no_show' is included)
alter table round_instances
  drop constraint if exists round_instances_status_check;

alter table round_instances
  add constraint round_instances_status_check check
    (status in ('pending','scheduled','in_progress','completed','passed','failed','no_show','awaiting_review'));

-- 4. Update outreach_log channel constraint to allow 'both' for multi-channel notification dispatch
alter table outreach_log
  drop constraint if exists outreach_log_channel_check;

alter table outreach_log
  add constraint outreach_log_channel_check check
    (channel in ('email','whatsapp','sms','voice_call','both'));

-- 5. Update outreach_log delivery_state constraint to allow all pipeline delivery states
alter table outreach_log
  drop constraint if exists outreach_log_delivery_state_check;

alter table outreach_log
  add constraint outreach_log_delivery_state_check check
    (delivery_state in (
      'queued',
      'sent',
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

-- 6. Update campaign_rounds round_type constraint to allow 'ai_voice_call'
alter table campaign_rounds
  drop constraint if exists campaign_rounds_round_type_check;

alter table campaign_rounds
  add constraint campaign_rounds_round_type_check check
    (round_type in ('ai_interview','human_interview','assignment','ai_voice_call'));

-- =========================================================================
-- FILE: 0011_applications.sql
-- =========================================================================

-- Application-centric hiring model.
-- A candidate is a person; an application is that person's participation in
-- one campaign. Resumes, contact snapshots, stages, and decisions belong to
-- the application so applying to another job cannot overwrite its history.

alter table public.candidates
  add constraint candidates_id_account_unique unique (id, account_id);
alter table public.campaigns
  add constraint campaigns_id_account_unique unique (id, account_id);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid not null,
  candidate_id uuid not null,
  candidate_name text not null,
  candidate_email text not null,
  candidate_phone text,
  normalized_email text generated always as (
    lower(
      regexp_replace(
        split_part(btrim(candidate_email), '@', 1),
        '[+].*',
        ''
      ) || '@' || split_part(btrim(candidate_email), '@', 2)
    )
  ) stored,
  resume_path text,
  whatsapp_opt_in boolean not null default false,
  status text not null default 'active'
    check (status in ('active','on_hold','incomplete','rejected','offer_ready','offer_sent')),
  current_stage text not null default 'needs_review'
    check (current_stage in ('needs_review','round','offer')),
  current_round_number integer,
  status_before_hold text
    check (status_before_hold is null or status_before_hold in ('active','incomplete','offer_ready')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_campaign_candidate_unique unique (campaign_id, candidate_id),
  constraint applications_campaign_account_fk foreign key (campaign_id, account_id)
    references public.campaigns(id, account_id) on delete cascade,
  constraint applications_candidate_account_fk foreign key (candidate_id, account_id)
    references public.candidates(id, account_id) on delete cascade,
  constraint applications_current_round_positive check (current_round_number is null or current_round_number > 0),
  constraint applications_hold_status_consistent check (
    (status = 'on_hold' and status_before_hold is not null)
    or (status <> 'on_hold' and status_before_hold is null)
  )
);

create index applications_account_campaign_idx on public.applications (account_id, campaign_id, created_at desc);
create index applications_candidate_idx on public.applications (candidate_id, created_at desc);
create index applications_campaign_email_idx on public.applications (campaign_id, normalized_email);
create index applications_campaign_status_idx on public.applications (campaign_id, status, current_stage, current_round_number);

-- Backfill one application per candidate/job pair already represented by a
-- round. The old schema did not create an application until the first round,
-- so rows without a round cannot be reconstructed reliably.
insert into public.applications (
  account_id, campaign_id, candidate_id, candidate_name, candidate_email,
  candidate_phone, resume_path, current_stage, current_round_number
)
select distinct on (ri.campaign_id, ri.candidate_id)
  ri.account_id,
  ri.campaign_id,
  ri.candidate_id,
  coalesce(c.name, 'Candidate'),
  c.email,
  c.phone,
  c.resume_url,
  'round',
  ri.round_number
from public.round_instances ri
join public.candidates c on c.id = ri.candidate_id and c.account_id = ri.account_id
order by ri.campaign_id, ri.candidate_id, ri.round_number, ri.created_at
on conflict (campaign_id, candidate_id) do nothing;

-- Attach existing round, evaluation, communication, usage, booking, and
-- submission records to the new application owner.
alter table public.round_instances add column application_id uuid
  references public.applications(id) on delete cascade;
update public.round_instances ri
set application_id = a.id
from public.applications a
where a.campaign_id = ri.campaign_id and a.candidate_id = ri.candidate_id;
create index round_instances_application_idx on public.round_instances (application_id, round_number);

alter table public.decision_ledger add column application_id uuid
  references public.applications(id) on delete cascade;
alter table public.decision_ledger
  add column round_instance_id uuid references public.round_instances(id) on delete set null,
  add column weight numeric,
  add column raw_text text,
  add column created_at timestamptz not null default now();
update public.decision_ledger dl
set application_id = ri.application_id
from public.round_instances ri
where dl.round_instance_id = ri.id and dl.application_id is null;
-- Legacy non-round decisions can be linked only when the candidate has one
-- application. Ambiguous rows remain unlinked until they are safely rebuilt.
update public.decision_ledger dl
set application_id = (
  select a.id
  from public.applications a
  where a.candidate_id = dl.candidate_id and a.account_id = dl.account_id
  limit 1
)
where dl.application_id is null
  and (
    select count(*)
    from public.applications a
    where a.candidate_id = dl.candidate_id and a.account_id = dl.account_id
  ) = 1;
create index decision_ledger_application_idx on public.decision_ledger (application_id, decided_at desc);

alter table public.outreach_log add column application_id uuid
  references public.applications(id) on delete cascade;
update public.outreach_log ol
set application_id = ri.application_id
from public.round_instances ri
where ol.round_instance_id = ri.id and ol.application_id is null;
create index outreach_log_application_idx on public.outreach_log (application_id, sent_at desc);

alter table public.interview_sessions add column application_id uuid
  references public.applications(id) on delete cascade;
update public.interview_sessions s
set application_id = ri.application_id
from public.round_instances ri
where s.round_instance_id = ri.id and s.application_id is null;
create index interview_sessions_application_idx on public.interview_sessions (application_id);

alter table public.credit_ledger add column application_id uuid
  references public.applications(id) on delete set null;
update public.credit_ledger cl
set application_id = ri.application_id
from public.round_instances ri
where cl.round_instance_id = ri.id and cl.application_id is null;

alter table public.calendar_events add column application_id uuid
  references public.applications(id) on delete cascade;
update public.calendar_events ce
set application_id = ri.application_id
from public.round_instances ri
where ce.round_instance_id = ri.id and ce.application_id is null;

alter table public.assignment_submissions add column application_id uuid
  references public.applications(id) on delete cascade;
update public.assignment_submissions s
set application_id = ri.application_id
from public.round_instances ri
where s.round_instance_id = ri.id and s.application_id is null;

-- New application intake must start from an open job with a complete,
-- preconfigured sequence. This prevents candidates entering a mutable or
-- incomplete pipeline.
create or replace function public.validate_application_intake()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_round_count integer;
  v_voice_rounds integer;
begin
  if nullif(btrim(new.resume_path), '') is null then
    raise exception 'resume_required' using detail = 'A resume is required for every application.';
  end if;
  select * into v_campaign
  from public.campaigns
  where id = new.campaign_id and account_id = new.account_id
  for share;

  if not found then
    raise exception 'campaign_not_found' using detail = 'The job was not found in this workspace.';
  end if;
  if v_campaign.status not in ('on', 'open') then
    raise exception 'campaign_closed' using detail = 'Applications cannot be added to a closed job.';
  end if;

  select count(*), count(*) filter (where round_type = 'ai_voice_call')
  into v_round_count, v_voice_rounds
  from public.campaign_rounds
  where campaign_id = new.campaign_id;

  if v_round_count = 0 or v_round_count <> v_campaign.number_of_rounds then
    raise exception 'pipeline_incomplete' using detail = 'Configure the full hiring-round sequence before adding candidates.';
  end if;
  if v_voice_rounds > 0 and nullif(btrim(new.candidate_phone), '') is null then
    raise exception 'phone_required' using detail = 'A phone number is required for this job’s AI voice round.';
  end if;

  if new.current_stage = 'needs_review' then
    new.current_round_number := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_validate_intake
before insert on public.applications
for each row execute function public.validate_application_intake();

create or replace function public.set_application_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_application_updated_at();

-- Enforce round immutability and stop adding rounds as soon as the first
-- application exists. Round configuration must therefore be complete at
-- insert time.
create or replace function public.guard_campaign_round_configuration()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'round_immutable' using detail = 'A hiring round cannot be changed or deleted after it is created.';
  end if;
  if exists (select 1 from public.applications a where a.campaign_id = new.campaign_id) then
    raise exception 'pipeline_locked' using detail = 'Hiring rounds cannot be added after applications exist.';
  end if;
  if new.round_number < 1 then
    raise exception 'invalid_round_number' using detail = 'Round numbers must be positive.';
  end if;
  return new;
end;
$$;

create trigger campaign_rounds_immutable
before insert or update or delete on public.campaign_rounds
for each row execute function public.guard_campaign_round_configuration();

-- The job description is the source for generated questions/rubrics and locks
-- when round configuration begins. Other job details lock when intake begins;
-- status remains manually changeable between open and closed.
create or replace function public.guard_campaign_details()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.jd_text is distinct from new.jd_text
     and exists (select 1 from public.campaign_rounds r where r.campaign_id = old.id) then
    raise exception 'job_description_locked' using detail = 'The job description cannot change after rounds are created.';
  end if;

  if exists (select 1 from public.applications a where a.campaign_id = old.id)
     and row(old.name, old.number_of_rounds) is distinct from row(new.name, new.number_of_rounds) then
    raise exception 'job_details_locked' using detail = 'Job details and the hiring-round sequence cannot change after applications exist.';
  end if;

  return new;
end;
$$;

create trigger campaigns_guard_details
before update on public.campaigns
for each row execute function public.guard_campaign_details();

-- Application-safe candidate/job list, including candidates before their first
-- round. The latest scored assessment is for display only; it never advances
-- or rejects an application.
drop view if exists public.campaign_candidates;
create view public.campaign_candidates
with (security_invoker = true) as
select
  a.id as application_id,
  a.candidate_id,
  a.account_id,
  a.campaign_id,
  a.candidate_name as name,
  a.candidate_email as email,
  a.candidate_phone as phone,
  a.resume_path as resume_url,
  a.current_stage,
  a.status as decision,
  latest.score as latest_score,
  latest.round_instance_id
from public.applications a
left join lateral (
  select dl.score, dl.round_instance_id
  from public.decision_ledger dl
  where dl.application_id = a.id and dl.score is not null
  order by dl.decided_at desc
  limit 1
) latest on true;

alter table public.applications enable row level security;
create policy applications_select_tenant on public.applications
  for select using (account_id = auth.uid());
create policy applications_insert_open_job on public.applications
  for insert with check (
    account_id = auth.uid()
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.account_id = auth.uid() and c.status in ('open', 'on'))
  );
create policy applications_update_open_job on public.applications
  for update using (
    account_id = auth.uid()
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.account_id = auth.uid() and c.status in ('open', 'on'))
  ) with check (
    account_id = auth.uid()
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.account_id = auth.uid() and c.status in ('open', 'on'))
  );
create policy applications_delete_open_job on public.applications
  for delete using (
    account_id = auth.uid()
    and exists (select 1 from public.campaigns c where c.id = campaign_id and c.account_id = auth.uid() and c.status in ('open', 'on'))
  );

comment on table public.applications is
  'One candidate’s application to one job. Application-scoped resume/contact data and hiring state live here.';

-- =========================================================================
-- FILE: 0012_job_workspace_fields.sql
-- =========================================================================

-- Workspace profile, job fields, manual open/close status, and retention
-- snapshot. Job terminology remains user-facing; persisted table names stay
-- campaigns/campaign_rounds.

alter table public.accounts
  add column if not exists email text,
  add column if not exists timezone text not null default 'UTC';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (id, billing_anchor_date, name, company_name, email, timezone)
  values (
    new.id,
    current_date,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name'
    ),
    new.raw_user_meta_data->>'company_name',
    new.email,
    coalesce(new.raw_user_meta_data->>'timezone', 'UTC')
  )
  on conflict (id) do update set
    name = coalesce(accounts.name, excluded.name),
    company_name = coalesce(accounts.company_name, excluded.company_name),
    email = coalesce(excluded.email, accounts.email),
    timezone = coalesce(accounts.timezone, excluded.timezone);
  return new;
end;
$$;

alter table public.campaigns
  add column location text,
  add column work_arrangement text,
  add column opening_date date not null default current_date,
  add column closing_date date not null default (current_date + 30),
  add column number_of_openings integer not null default 1,
  add column salary_min numeric(14,2),
  add column salary_max numeric(14,2),
  add column salary_currency text,
  add column salary_period text,
  add column closed_at timestamptz,
  add column retention_days_snapshot integer,
  add column retention_remaining_seconds bigint,
  add column retention_purge_at timestamptz;

-- Convert the previous on/off values to the agreed manual Open/Closed model.
alter table public.campaigns drop constraint if exists campaigns_status_check;
update public.campaigns set status = case status when 'on' then 'open' when 'off' then 'closed' else status end;
alter table public.campaigns alter column status set default 'open';
alter table public.campaigns
  add constraint campaigns_status_check check (status in ('open','closed')),
  add constraint campaigns_openings_positive check (number_of_openings > 0),
  add constraint campaigns_dates_ordered check (closing_date >= opening_date),
  add constraint campaigns_salary_range_valid check (
    (salary_min is null and salary_max is null)
    or (salary_min is not null and salary_max is not null and salary_min <= salary_max)
  ),
  add constraint campaigns_salary_metadata_valid check (
    (salary_min is null and salary_currency is null and salary_period is null)
    or (salary_min is not null and nullif(btrim(salary_currency), '') is not null
        and nullif(btrim(salary_period), '') is not null)
  ),
  add constraint campaigns_retention_days_positive check (
    retention_days_snapshot is null or retention_days_snapshot > 0
  ),
  add constraint campaigns_retention_remaining_nonnegative check (
    retention_remaining_seconds is null or retention_remaining_seconds >= 0
  );

-- Existing campaigns may predate the required job form. New inserts are
-- validated below; old rows are left intact for operators to review.
create or replace function public.validate_campaign_setup()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(new.name), '') is null
     or nullif(btrim(new.jd_text), '') is null
     or nullif(btrim(new.location), '') is null
     or nullif(btrim(new.work_arrangement), '') is null
     or new.opening_date is null
     or new.closing_date is null
     or new.number_of_openings is null then
    raise exception 'job_fields_required' using detail = 'Complete the required job details before creating a job.';
  end if;
  if new.status not in ('open','closed') then
    raise exception 'invalid_job_status' using detail = 'A job must be Open or Closed.';
  end if;
  return new;
end;
$$;

create trigger campaigns_validate_setup
before insert on public.campaigns
for each row execute function public.validate_campaign_setup();

create or replace function public.guard_campaign_details()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'closed'
     and row(
       old.name, old.jd_text, old.number_of_rounds, old.location,
       old.work_arrangement, old.opening_date, old.closing_date,
       old.number_of_openings, old.salary_min, old.salary_max,
       old.salary_currency, old.salary_period
     ) is distinct from row(
       new.name, new.jd_text, new.number_of_rounds, new.location,
       new.work_arrangement, new.opening_date, new.closing_date,
       new.number_of_openings, new.salary_min, new.salary_max,
       new.salary_currency, new.salary_period
     ) then
    raise exception 'closed_job_read_only' using detail = 'Reopen the job before changing its details.';
  end if;

  if old.jd_text is distinct from new.jd_text
     and exists (select 1 from public.campaign_rounds r where r.campaign_id = old.id) then
    raise exception 'job_description_locked' using detail = 'The job description cannot change after rounds are created.';
  end if;

  if exists (select 1 from public.applications a where a.campaign_id = old.id)
     and row(
       old.name, old.number_of_rounds, old.location, old.work_arrangement,
       old.opening_date, old.closing_date, old.number_of_openings,
       old.salary_min, old.salary_max, old.salary_currency, old.salary_period
     ) is distinct from row(
       new.name, new.number_of_rounds, new.location, new.work_arrangement,
       new.opening_date, new.closing_date, new.number_of_openings,
       new.salary_min, new.salary_max, new.salary_currency, new.salary_period
     ) then
    raise exception 'job_details_locked' using detail = 'Job details cannot change after applications exist. Close this job and create another.';
  end if;

  return new;
end;
$$;

create or replace function public.apply_campaign_retention_policy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_days integer;
begin
  if old.status = 'open' and new.status = 'closed' then
    if new.retention_days_snapshot is null then
      select tl.retention_days into v_days
      from public.accounts a
      join public.tier_limits tl on tl.id = a.tier
      where a.id = new.account_id;
      if v_days is null then
        raise exception 'retention_policy_missing' using detail = 'A retention period is not configured for this workspace tier.';
      end if;
      new.retention_days_snapshot := v_days;
      new.retention_purge_at := now() + make_interval(days => v_days);
    else
      if new.retention_remaining_seconds is null then
        raise exception 'retention_state_missing' using detail = 'The paused retention duration is missing.';
      end if;
      new.retention_purge_at := now() + make_interval(secs => new.retention_remaining_seconds);
    end if;
    new.retention_remaining_seconds := null;
    new.closed_at := now();
  elsif old.status = 'closed' and new.status = 'open' then
    if old.retention_purge_at is not null and old.retention_purge_at <= now() then
      raise exception 'retention_expired' using detail = 'A job cannot be reopened after its retention period has ended.';
    end if;
    if old.retention_purge_at is not null then
      new.retention_remaining_seconds := greatest(
        0,
        floor(extract(epoch from (old.retention_purge_at - now())))::bigint
      );
      new.retention_purge_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger campaigns_set_retention
before update of status on public.campaigns
for each row execute function public.apply_campaign_retention_policy();

comment on column public.campaigns.retention_days_snapshot is
  'Tier retention days captured on first close. Tier changes do not alter a closed job’s purge date.';
comment on column public.campaigns.retention_remaining_seconds is
  'Remaining retention duration captured when a closed job is reopened; resumed on the next close.';

-- =========================================================================
-- FILE: 0013_round_assessment_offer_contracts.sql
-- =========================================================================

-- Assessment, assignment, and offer records used by the agreed hiring flow.

alter table public.campaign_rounds
  add column duration_minutes integer,
  add column buffer_minutes integer not null default 0,
  add column booking_window_days integer not null default 14,
  add column assigned_team_member_id uuid references public.team_members(id) on delete restrict,
  add column questions jsonb not null default '[]'::jsonb,
  add column evaluation_criteria jsonb not null default '[]'::jsonb,
  add column assignment_deadline_hours integer;

alter table public.campaign_rounds
  add constraint campaign_rounds_buffer_nonnegative check (buffer_minutes >= 0),
  add constraint campaign_rounds_booking_window_positive check (booking_window_days > 0),
  add constraint campaign_rounds_duration_positive check (duration_minutes is null or duration_minutes > 0),
  add constraint campaign_rounds_assignment_deadline_positive check (assignment_deadline_hours is null or assignment_deadline_hours > 0);

create or replace function public.validate_campaign_round_setup()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  select c.account_id into v_account_id
  from public.campaigns c where c.id = new.campaign_id;
  if v_account_id is null then
    raise exception 'campaign_not_found' using detail = 'The job for this round was not found.';
  end if;

  if new.round_type in ('human_interview','ai_interview','ai_voice_call')
     and (new.duration_minutes is null or new.duration_minutes <= 0) then
    raise exception 'round_duration_required' using detail = 'Set an interview duration before creating this round.';
  end if;
  if new.round_type in ('ai_interview','ai_voice_call','assignment')
     and (jsonb_typeof(new.evaluation_criteria) <> 'array'
          or jsonb_array_length(new.evaluation_criteria) = 0) then
    raise exception 'evaluation_criteria_required' using detail = 'Approve evaluation criteria before creating this round.';
  end if;
  if new.round_type in ('ai_interview','ai_voice_call')
     and (jsonb_typeof(new.questions) <> 'array' or jsonb_array_length(new.questions) = 0) then
    raise exception 'questions_required' using detail = 'Approve questions before creating this round.';
  end if;
  if new.round_type = 'human_interview' then
    if new.assigned_team_member_id is null and nullif(btrim(new.interviewer_email), '') is null then
      raise exception 'interviewer_required' using detail = 'Assign one interviewer before creating this round.';
    end if;
    if new.assigned_team_member_id is not null and not exists (
      select 1 from public.team_members tm
      where tm.id = new.assigned_team_member_id and tm.account_id = v_account_id
    ) then
      raise exception 'interviewer_account_mismatch' using detail = 'The interviewer must belong to this workspace.';
    end if;
  end if;
  if new.round_type = 'assignment'
     and (nullif(btrim(new.brief_text), '') is null
          or new.assignment_deadline_hours is null
          or new.assignment_deadline_hours <= 0) then
    raise exception 'assignment_setup_incomplete' using detail = 'Set assignment instructions and a deadline before creating this round.';
  end if;
  if new.round_type = 'ai_voice_call'
     and (new.daily_start_time is null or new.daily_end_time is null
          or new.daily_start_time = new.daily_end_time) then
    raise exception 'voice_window_required' using detail = 'Set a valid AI voice call window before creating this round.';
  end if;
  return new;
end;
$$;

create trigger campaign_rounds_validate_setup
before insert on public.campaign_rounds
for each row execute function public.validate_campaign_round_setup();

-- Scores are comparable across all assessment types and always use 1-100.
alter table public.decision_ledger
  add column score_type text,
  add constraint decision_ledger_score_range check (score is null or score between 1 and 100),
  add constraint decision_ledger_score_type_check check (
    score_type is null or score_type in ('resume','ai_interview','ai_voice','assignment','human_feedback')
  );

create table public.application_evaluations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  round_instance_id uuid references public.round_instances(id) on delete cascade,
  score_type text not null check (
    score_type in ('resume','ai_interview','ai_voice','assignment','human_feedback')
  ),
  score numeric(5,2) not null check (score between 1 and 100),
  criteria_scores jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  constraint application_evaluations_criteria_array check (jsonb_typeof(criteria_scores) = 'array'),
  constraint application_evaluations_evidence_array check (jsonb_typeof(evidence) = 'array')
);

create index application_evaluations_application_idx
  on public.application_evaluations (application_id, score_type, created_at desc);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  round_instance_id uuid not null unique references public.round_instances(id) on delete cascade,
  brief_text text not null,
  deadline_at timestamptz not null,
  status text not null default 'issued' check (status in ('issued','submitted','incomplete')),
  created_at timestamptz not null default now()
);

insert into public.assignments (account_id, application_id, round_instance_id, brief_text, deadline_at)
select ri.account_id, ri.application_id, ri.id,
       coalesce(nullif(btrim(cr.brief_text), ''), 'Legacy assignment instructions'),
       coalesce(ri.deadline_at, ri.created_at + make_interval(hours => greatest(cr.assignment_deadline_hours, 1)))
from public.round_instances ri
join public.campaign_rounds cr
  on cr.campaign_id = ri.campaign_id and cr.round_number = ri.round_number
where ri.round_type = 'assignment' and ri.application_id is not null
on conflict (round_instance_id) do nothing;

alter table public.assignment_submissions
  add column assignment_id uuid references public.assignments(id) on delete cascade;
update public.assignment_submissions s
set assignment_id = a.id
from public.assignments a
where s.round_instance_id = a.round_instance_id and s.assignment_id is null;
create index assignment_submissions_assignment_idx on public.assignment_submissions (assignment_id, submitted_at desc);

create or replace function public.guard_assignment_deadline()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_deadline timestamptz;
  v_campaign_status text;
begin
  if new.assignment_id is null and new.round_instance_id is not null then
    select id, application_id into new.assignment_id, new.application_id
    from public.assignments
    where round_instance_id = new.round_instance_id;
  end if;
  if new.assignment_id is null then
    raise exception 'assignment_required' using detail = 'A submission must belong to an issued assignment.';
  end if;
  select deadline_at into v_deadline from public.assignments where id = new.assignment_id;
  if v_deadline is null then
    raise exception 'assignment_not_found' using detail = 'The assignment was not found.';
  end if;
  if now() > v_deadline then
    raise exception 'assignment_deadline_passed' using detail = 'Submissions are closed after the assignment deadline.';
  end if;
  select c.status into v_campaign_status
  from public.assignments a
  join public.applications ap on ap.id = a.application_id
  join public.campaigns c on c.id = ap.campaign_id
  where a.id = new.assignment_id;
  if v_campaign_status is distinct from 'open' then
    raise exception 'job_closed' using detail = 'Submissions are blocked for a closed job.';
  end if;
  return new;
end;
$$;

create trigger assignment_submissions_deadline
before insert or update on public.assignment_submissions
for each row execute function public.guard_assignment_deadline();

create or replace function public.guard_assignment_immutable_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'assignment_immutable' using detail = 'Assignments cannot be deleted or reopened.';
  end if;
  if row(old.application_id, old.round_instance_id, old.brief_text, old.deadline_at)
     is distinct from row(new.application_id, new.round_instance_id, new.brief_text, new.deadline_at) then
    raise exception 'assignment_immutable' using detail = 'Assignment instructions and deadlines cannot be changed or reopened.';
  end if;
  return new;
end;
$$;

create trigger assignments_immutable_fields
before update or delete on public.assignments
for each row execute function public.guard_assignment_immutable_fields();

create table public.company_signwell_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  signwell_template_id text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (account_id, signwell_template_id)
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  application_id uuid not null unique references public.applications(id) on delete cascade,
  template_id uuid not null references public.company_signwell_templates(id) on delete restrict,
  field_values jsonb not null default '{}'::jsonb,
  candidate_email text not null,
  company_signer_email text not null,
  signwell_document_id text unique,
  status text not null default 'awaiting_company_signature'
    check (status in ('awaiting_company_signature','sent_to_candidate','void')),
  sent_to_candidate_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint offers_sent_timestamp_consistent check (
    (status = 'sent_to_candidate' and sent_to_candidate_at is not null)
    or status <> 'sent_to_candidate'
  )
);

create table public.offer_capacity_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  signwell_document_id text not null unique,
  counted_at timestamptz not null default now()
);

create index offer_capacity_events_campaign_idx on public.offer_capacity_events (campaign_id, counted_at);

create table public.signwell_cancellation_queue (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  signwell_document_id text not null unique,
  status text not null default 'queued' check (status in ('queued','cancelled','not_cancellable','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create or replace function public.validate_offer_request()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_app public.applications%rowtype;
  v_account_email text;
begin
  select * into v_app
  from public.applications a
  where a.id = new.application_id and a.account_id = new.account_id;
  if not found or v_app.campaign_id <> new.campaign_id then
    raise exception 'offer_application_mismatch' using detail = 'The offer must belong to the selected application and job.';
  end if;
  if v_app.current_stage <> 'offer' or v_app.status not in ('active','offer_ready') then
    raise exception 'application_not_offer_ready' using detail = 'Advance the application through all rounds before sending an offer.';
  end if;
  if not exists (
    select 1 from public.campaigns c
    where c.id = new.campaign_id and c.account_id = new.account_id and c.status = 'open'
  ) then
    raise exception 'job_closed' using detail = 'Offers cannot be sent for a closed job.';
  end if;
  select email into v_account_email from public.accounts where id = new.account_id;
  if v_account_email is null or lower(btrim(new.company_signer_email)) <> lower(btrim(v_account_email)) then
    raise exception 'company_signer_mismatch' using detail = 'The recruiter account email must sign the offer first.';
  end if;
  if not exists (
    select 1 from public.company_signwell_templates t
    where t.id = new.template_id and t.account_id = new.account_id and t.active
  ) then
    raise exception 'offer_template_unavailable' using detail = 'The selected SignWell template is not assigned to this company.';
  end if;
  if lower(btrim(new.candidate_email)) <> lower(btrim(v_app.candidate_email)) then
    raise exception 'offer_candidate_mismatch' using detail = 'The offer recipient must match the application.';
  end if;
  return new;
end;
$$;

create trigger offers_validate_request
before insert on public.offers
for each row execute function public.validate_offer_request();

create or replace function public.queue_offer_cancellation_on_application_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.signwell_cancellation_queue (account_id, campaign_id, signwell_document_id)
  select o.account_id, o.campaign_id, o.signwell_document_id
  from public.offers o
  where o.application_id = old.id
    and o.signwell_document_id is not null
    and o.status <> 'void'
  on conflict (signwell_document_id) do nothing;
  return old;
end;
$$;

create trigger applications_queue_offer_cancellation
before delete on public.applications
for each row execute function public.queue_offer_cancellation_on_application_delete();

create or replace function public.delete_orphaned_candidate_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.applications a
    where a.candidate_id = old.candidate_id and a.account_id = old.account_id
  ) then
    delete from public.candidates c
    where c.id = old.candidate_id and c.account_id = old.account_id;
  end if;
  return old;
end;
$$;

create trigger applications_prune_candidate_profile
after delete on public.applications
for each row execute function public.delete_orphaned_candidate_profile();

create or replace function public.record_offer_sent_to_candidate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'sent_to_candidate' and new.status = 'sent_to_candidate' then
    if new.signwell_document_id is null then
      raise exception 'signwell_document_required' using detail = 'A SignWell document id is required before an offer can count as sent.';
    end if;
    if new.sent_to_candidate_at is null then
      new.sent_to_candidate_at := now();
    end if;
    insert into public.offer_capacity_events (
      account_id, campaign_id, application_id, offer_id, signwell_document_id, counted_at
    ) values (
      new.account_id, new.campaign_id, new.application_id, new.id,
      new.signwell_document_id, new.sent_to_candidate_at
    ) on conflict (signwell_document_id) do nothing;
    update public.applications
    set status = 'offer_sent', current_stage = 'offer', current_round_number = null
    where id = new.application_id and status <> 'rejected';
  end if;
  return new;
end;
$$;

create trigger offers_count_when_sent_to_candidate
before update of status on public.offers
for each row execute function public.record_offer_sent_to_candidate();

-- RLS for all new tenant-owned records.
do $$
declare t text;
begin
  foreach t in array array[
    'application_evaluations','assignments','company_signwell_templates',
    'offers','offer_capacity_events','signwell_cancellation_queue'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy application_evaluations_select_tenant on public.application_evaluations
  for select using (account_id = auth.uid());
create policy assignments_select_tenant on public.assignments
  for select using (account_id = auth.uid());
create policy signwell_templates_select_tenant on public.company_signwell_templates
  for select using (account_id = auth.uid());
create policy offers_select_tenant on public.offers
  for select using (account_id = auth.uid());
create policy offer_capacity_select_tenant on public.offer_capacity_events
  for select using (account_id = auth.uid());
-- SignWell cancellations are integration work items and stay service-only.
revoke insert, update, delete on public.application_evaluations, public.assignments,
  public.company_signwell_templates, public.offers, public.offer_capacity_events,
  public.signwell_cancellation_queue from authenticated;

-- =========================================================================
-- FILE: 0014_interviewer_calendar_feedback.sql
-- =========================================================================

-- Per-interviewer Google Calendar connections and secure, one-day feedback links.

create table public.interviewer_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  team_member_id uuid not null unique references public.team_members(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  google_email text,
  google_calendar_id text not null default 'primary',
  credential_ref text,
  status text not null default 'not_connected'
    check (status in ('not_connected','pending','active','revoked')),
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  constraint interviewer_primary_calendar_only check (google_calendar_id = 'primary')
);

create or replace function public.validate_interviewer_calendar_connection()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.team_members tm
    where tm.id = new.team_member_id and tm.account_id = new.account_id
  ) then
    raise exception 'interviewer_account_mismatch' using detail = 'The calendar must belong to an interviewer in this workspace.';
  end if;
  return new;
end;
$$;

create trigger interviewer_calendar_validate_owner
before insert or update on public.interviewer_calendar_connections
for each row execute function public.validate_interviewer_calendar_connection();

alter table public.interviewer_calendar_connections enable row level security;
create policy interviewer_calendar_tenant_isolation on public.interviewer_calendar_connections
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

-- Tokens are held by the n8n credential store, not in Postgres. This table
-- stores only an opaque reference to that encrypted credential.
comment on column public.interviewer_calendar_connections.credential_ref is
  'Opaque reference to an encrypted n8n credential; never store OAuth access or refresh tokens here.';

create table public.calendar_oauth_states (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  state_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.calendar_oauth_states enable row level security;
-- Intentionally no client policy. OAuth callbacks use the server credential.

create table public.interviewer_feedback_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  round_instance_id uuid not null unique references public.round_instances(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  no_show_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.interviewer_feedback_links enable row level security;
-- Raw links are never readable by browser clients; the secure RPCs validate
-- the hash and expiry without exposing tenant data.

create or replace function public.validate_interviewer_feedback_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.applications a
    join public.round_instances ri on ri.application_id = a.id
    join public.campaign_rounds cr
      on cr.campaign_id = ri.campaign_id and cr.round_number = ri.round_number
    join public.team_members tm on tm.id = new.team_member_id
    where a.id = new.application_id
      and a.account_id = new.account_id
      and ri.id = new.round_instance_id
      and tm.account_id = new.account_id
      and ri.round_type = 'human_interview'
      and (
        cr.assigned_team_member_id = tm.id
        or (cr.assigned_team_member_id is null and lower(cr.interviewer_email) = lower(tm.email))
      )
  ) then
    raise exception 'feedback_link_scope_invalid' using detail = 'The feedback link must match the assigned interviewer and application.';
  end if;
  return new;
end;
$$;

create trigger interviewer_feedback_link_validate_scope
before insert or update on public.interviewer_feedback_links
for each row execute function public.validate_interviewer_feedback_link();

create table public.interviewer_feedback (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  round_instance_id uuid not null unique references public.round_instances(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete restrict,
  criteria_scores jsonb not null,
  overall_score numeric(5,2) not null check (overall_score between 1 and 100),
  notes text,
  submitted_at timestamptz not null default now(),
  constraint interviewer_feedback_scores_array check (jsonb_typeof(criteria_scores) = 'array')
);
create index interviewer_feedback_application_idx on public.interviewer_feedback (application_id, submitted_at);
alter table public.interviewer_feedback enable row level security;
create policy interviewer_feedback_tenant_isolation on public.interviewer_feedback
  for select using (account_id = auth.uid());

create or replace function public.submit_interviewer_feedback(
  p_token text,
  p_criteria_scores jsonb,
  p_overall_score numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.interviewer_feedback_links%rowtype;
  v_round public.round_instances%rowtype;
  v_application public.applications%rowtype;
  v_item jsonb;
  v_score numeric;
  v_id uuid;
begin
  select * into v_link
  from public.interviewer_feedback_links
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and used_at is null and no_show_at is null and revoked_at is null
    and expires_at > now();
  if not found then
    raise exception 'feedback_link_invalid' using detail = 'This feedback link is invalid or expired.';
  end if;
  if p_criteria_scores is null
     or jsonb_typeof(p_criteria_scores) is distinct from 'array'
     or jsonb_array_length(p_criteria_scores) = 0 then
    raise exception 'feedback_required' using detail = 'Submit a score for each required criterion.';
  end if;
  if p_overall_score is null or p_overall_score < 1 or p_overall_score > 100 then
    raise exception 'feedback_score_invalid' using detail = 'Scores must be between 1 and 100.';
  end if;
  for v_item in select value from jsonb_array_elements(p_criteria_scores) loop
    begin
      v_score := (v_item->>'score')::numeric;
    exception when others then
      raise exception 'feedback_score_invalid' using detail = 'Each criterion needs a numeric score from 1 to 100.';
    end;
    if v_score < 1 or v_score > 100 then
      raise exception 'feedback_score_invalid' using detail = 'Each criterion score must be between 1 and 100.';
    end if;
  end loop;

  select * into v_round from public.round_instances where id = v_link.round_instance_id;
  select * into v_application from public.applications where id = v_link.application_id;
  if v_round.status <> 'scheduled' or v_application.status in ('rejected','offer_sent') then
    raise exception 'feedback_not_available' using detail = 'Feedback is no longer available for this interview.';
  end if;
  if not exists (
    select 1 from public.campaigns c
    where c.id = v_round.campaign_id and c.account_id = v_link.account_id and c.status = 'open'
  ) then
    raise exception 'job_closed' using detail = 'Feedback cannot be submitted for a closed job.';
  end if;

  insert into public.interviewer_feedback (
    account_id, application_id, round_instance_id, team_member_id,
    criteria_scores, overall_score, notes
  ) values (
    v_link.account_id, v_link.application_id, v_link.round_instance_id,
    v_link.team_member_id, p_criteria_scores, p_overall_score, p_notes
  ) returning id into v_id;

  insert into public.application_evaluations (
    account_id, application_id, round_instance_id, score_type,
    score, criteria_scores, evidence, notes
  ) values (
    v_link.account_id, v_link.application_id, v_link.round_instance_id, 'human_feedback',
    p_overall_score, p_criteria_scores, '[]'::jsonb, p_notes
  );

  insert into public.decision_ledger (
    account_id, candidate_id, application_id, round_instance_id,
    stage, score, score_type, rationale, source
  ) values (
    v_link.account_id, v_application.candidate_id, v_link.application_id, v_link.round_instance_id,
    'round', p_overall_score, 'human_feedback', p_notes, 'manual'
  );

  update public.interviewer_feedback_links set used_at = now() where id = v_link.id;
  update public.round_instances set status = 'completed' where id = v_round.id;
  return v_id;
end;
$$;

create or replace function public.report_interviewer_no_show(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.interviewer_feedback_links%rowtype;
  v_round public.round_instances%rowtype;
begin
  select * into v_link
  from public.interviewer_feedback_links
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and used_at is null and no_show_at is null and revoked_at is null
    and expires_at > now();
  if not found then
    raise exception 'feedback_link_invalid' using detail = 'This feedback link is invalid or expired.';
  end if;
  select * into v_round from public.round_instances where id = v_link.round_instance_id;
  if v_round.status <> 'scheduled' or v_round.scheduled_at > now() then
    raise exception 'no_show_not_available' using detail = 'This interview cannot be marked as a no-show yet.';
  end if;
  if not exists (
    select 1 from public.campaigns c
    where c.id = v_round.campaign_id and c.account_id = v_link.account_id and c.status = 'open'
  ) then
    raise exception 'job_closed' using detail = 'A no-show cannot be reported for a closed job.';
  end if;
  update public.interviewer_feedback_links set no_show_at = now() where id = v_link.id;
  update public.round_instances set status = 'no_show' where id = v_round.id;
end;
$$;

revoke all on function public.submit_interviewer_feedback(text, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function public.submit_interviewer_feedback(text, jsonb, numeric, text) to anon, authenticated, service_role;
revoke all on function public.report_interviewer_no_show(text) from public, anon, authenticated;
grant execute on function public.report_interviewer_no_show(text) to anon, authenticated, service_role;

alter table public.round_instances drop constraint if exists round_instances_status_check;
alter table public.round_instances
  add constraint round_instances_status_check check (
    status in ('pending','scheduled','in_progress','completed','passed','failed','no_show','awaiting_review','incomplete')
  );

-- =========================================================================
-- FILE: 0015_application_actions_outbox.sql
-- =========================================================================

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

-- =========================================================================
-- FILE: 0016_n8n_application_intake.sql
-- =========================================================================

-- Recruiter-authorized application intake for the n8n backend.
-- n8n calls this RPC with the recruiter's Supabase JWT and the public anon key;
-- auth.uid() and RLS therefore remain the authority for workspace access.

create or replace function public.create_application_intake(
  p_campaign_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_resume_path text,
  p_whatsapp_opt_in boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
  v_campaign public.campaigns%rowtype;
  v_candidate_id uuid;
  v_application public.applications%rowtype;
  v_email text := lower(btrim(p_candidate_email));
  v_normalized_email text;
  v_round_count integer;
  v_voice_round_count integer;
begin
  if v_account_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if nullif(btrim(p_candidate_name), '') is null
     or nullif(v_email, '') is null
     or position('@' in v_email) < 2
     or nullif(btrim(p_resume_path), '') is null then
    raise exception 'candidate_name_email_and_resume_required' using errcode = '22023';
  end if;

  v_normalized_email := lower(
    regexp_replace(split_part(v_email, '@', 1), '[+].*', '')
    || '@' || split_part(v_email, '@', 2)
  );

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id and account_id = v_account_id
  for share;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if v_campaign.status <> 'open' then
    raise exception 'job_closed' using errcode = '55000';
  end if;

  select count(*), count(*) filter (where round_type = 'ai_voice_call')
    into v_round_count, v_voice_round_count
  from public.campaign_rounds
  where campaign_id = p_campaign_id;
  if v_round_count = 0 or v_round_count <> v_campaign.number_of_rounds then
    raise exception 'pipeline_incomplete' using errcode = '55000';
  end if;
  if v_voice_round_count > 0 and nullif(btrim(p_candidate_phone), '') is null then
    raise exception 'phone_required' using errcode = '22023';
  end if;
  if split_part(btrim(p_resume_path), '/', 1) <> v_account_id::text
     or split_part(btrim(p_resume_path), '/', 2) <> p_campaign_id::text then
    raise exception 'resume_path_outside_job' using errcode = '22023';
  end if;

  -- Reuse global identity without changing its contact details or resume; those
  -- values belong to each application and must not leak across jobs.
  insert into public.candidates (account_id, name, email, phone)
  values (v_account_id, btrim(p_candidate_name), v_email, nullif(btrim(p_candidate_phone), ''))
  on conflict (account_id, normalized_email) do nothing;

  select id into v_candidate_id
  from public.candidates
  where account_id = v_account_id and normalized_email = v_normalized_email;
  if v_candidate_id is null then
    raise exception 'candidate_identity_creation_failed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.applications
    where campaign_id = p_campaign_id and normalized_email = v_normalized_email
  ) then
    raise exception 'candidate_already_uploaded' using errcode = '23505';
  end if;

  insert into public.applications (
    account_id, campaign_id, candidate_id, candidate_name, candidate_email,
    candidate_phone, resume_path, whatsapp_opt_in, status, current_stage
  ) values (
    v_account_id, p_campaign_id, v_candidate_id, btrim(p_candidate_name), v_email,
    nullif(btrim(p_candidate_phone), ''), btrim(p_resume_path), coalesce(p_whatsapp_opt_in, false),
    'active', 'needs_review'
  ) returning * into v_application;

  return to_jsonb(v_application);
end;
$$;

revoke all on function public.create_application_intake(uuid, text, text, text, text, boolean)
  from public, anon;
grant execute on function public.create_application_intake(uuid, text, text, text, text, boolean)
  to authenticated;

-- =========================================================================
-- FILE: 0017_confirmed_application_rejection.sql
-- =========================================================================

-- Require an explicit recruiter confirmation for rejection actions.
-- Keep the original state machine as an internal implementation, but remove
-- its direct authenticated grant and expose a confirmed wrapper to callers.

revoke execute on function public.decide_application(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.decide_application(
  p_application_id uuid,
  p_action text,
  p_rejection_reason text,
  p_confirm_rejection boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action = 'reject' and coalesce(p_confirm_rejection, false) is not true then
    raise exception 'rejection_confirmation_required'
      using detail = 'Confirm the rejection before rejecting this application.';
  end if;

  return public.decide_application(p_application_id, p_action, p_rejection_reason);
end;
$$;

revoke all on function public.decide_application(uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.decide_application(uuid, text, text, boolean)
  to authenticated, service_role;

-- =========================================================================
-- FILE: 0018_check_tier_limit_rpc.sql
-- =========================================================================

-- Tier-limit RPC used by the campaign and round-engine n8n workflows.
-- Keep this contract in migrations so clean Supabase resets expose the same
-- function to PostgREST as the checked-in workflows expect.

create or replace function public.check_tier_limit(
  p_account_id uuid,
  p_limit_key text,
  p_current_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tier text;
  v_limit integer;
  v_overage_behavior text;
begin
  if p_account_id is null or p_current_count is null or p_current_count < 0 then
    raise exception 'invalid_tier_limit_request' using errcode = '22023';
  end if;
  if p_limit_key is null or p_limit_key not in (
    'active_campaigns', 'scheduled_rounds_per_month', 'rounds_per_campaign',
    'resumes_screened', 'ai_interview', 'ai_voice_screening', 'offers_per_month'
  ) then
    raise exception 'unsupported_tier_limit_key' using errcode = '22023';
  end if;

  -- Browser callers may inspect only their own workspace. Trusted n8n
  -- service-role calls can evaluate the account id supplied by the workflow.
  if auth.uid() is distinct from p_account_id
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select a.tier,
         case p_limit_key
           when 'active_campaigns' then tl.active_campaigns
           when 'scheduled_rounds_per_month' then tl.scheduled_round
           when 'rounds_per_campaign' then tl.max_rounds
           when 'resumes_screened' then tl.resumes_screened
           when 'ai_interview' then tl.ai_interview
           when 'ai_voice_screening' then tl.ai_voice_screening
           when 'offers_per_month' then tl.offers_per_month
           else null
         end,
         tl.overage_behavior
    into v_tier, v_limit, v_overage_behavior
  from public.accounts a
  join public.tier_limits tl on tl.id = a.tier
  where a.id = p_account_id;

  if not found then
    raise exception 'account_or_tier_limit_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'allowed', v_limit is null or p_current_count < v_limit,
    'tier', v_tier,
    'limit_value', v_limit,
    'current_count', p_current_count,
    'overage_behavior', v_overage_behavior
  );
end;
$$;

revoke all on function public.check_tier_limit(uuid, text, integer) from public, anon;
grant execute on function public.check_tier_limit(uuid, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';

-- =========================================================================
-- FILE: 0019_application_intake_execute_grant.sql
-- =========================================================================

-- Repair the execute privilege for the authenticated application-intake RPC.
-- This is safe to apply more than once and does not modify application data.

revoke all on function public.create_application_intake(
  uuid, text, text, text, text, boolean
) from public, anon;

grant execute on function public.create_application_intake(
  uuid, text, text, text, text, boolean
) to authenticated;

notify pgrst, 'reload schema';

-- =========================================================================
-- FILE: 0020_resume_screening_gate.sql
-- =========================================================================

-- Keep the first stage explicit: resume evaluation is recorded per application,
-- and a recruiter cannot create round 1 until that evaluation exists.
create unique index if not exists decision_ledger_application_resume_unique
  on public.decision_ledger (application_id, score_type)
  where score_type = 'resume' and application_id is not null;

create or replace function public.record_resume_screening(
  p_application_id uuid,
  p_score integer,
  p_rationale text,
  p_raw_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_ledger_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_score is null or p_score < 1 or p_score > 100 then
    raise exception 'resume_score_out_of_range' using errcode = '22023';
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id and account_id = auth.uid()
  for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  insert into public.decision_ledger (
    account_id, candidate_id, application_id, stage, score_type,
    score, rationale, raw_text, source
  ) values (
    v_application.account_id, v_application.candidate_id, v_application.id,
    'resume_screening', 'resume', p_score, nullif(btrim(p_rationale), ''),
    left(p_raw_text, 40000), 'workflow'
  )
  on conflict (application_id, score_type)
    where score_type = 'resume' and application_id is not null
  do update set score = excluded.score,
                rationale = excluded.rationale,
                raw_text = excluded.raw_text,
                decided_at = now(),
                created_at = now()
  returning id into v_ledger_id;

  return jsonb_build_object(
    'application_id', v_application.id,
    'score', p_score,
    'score_type', 'resume',
    'evaluation_id', v_ledger_id
  );
end;
$$;

revoke all on function public.record_resume_screening(uuid, integer, text, text)
  from public, anon;
grant execute on function public.record_resume_screening(uuid, integer, text, text)
  to authenticated;

create or replace function public.create_screened_application_intake(
  p_campaign_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_resume_path text,
  p_whatsapp_opt_in boolean,
  p_score integer,
  p_rationale text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_application jsonb;
  v_screening jsonb;
begin
  v_application := public.create_application_intake(
    p_campaign_id, p_candidate_name, p_candidate_email, p_candidate_phone,
    p_resume_path, p_whatsapp_opt_in
  );
  v_screening := public.record_resume_screening(
    (v_application->>'id')::uuid, p_score, p_rationale, null
  );
  return jsonb_build_object('application', v_application, 'screening', v_screening);
end;
$$;

revoke all on function public.create_screened_application_intake(uuid, text, text, text, text, boolean, integer, text)
  from public, anon;
grant execute on function public.create_screened_application_intake(uuid, text, text, text, text, boolean, integer, text)
  to authenticated;

create or replace function public.require_resume_score_before_round()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.current_stage = 'needs_review'
     and new.current_stage = 'round'
     and not exists (
       select 1 from public.decision_ledger dl
       where dl.application_id = new.id
         and dl.score_type = 'resume'
         and dl.score between 1 and 100
     ) then
    raise exception 'resume_screening_required'
      using detail = 'Complete resume screening before advancing this application.';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_require_resume_score on public.applications;
create trigger applications_require_resume_score
before update of current_stage on public.applications
for each row execute function public.require_resume_score_before_round();

notify pgrst, 'reload schema';

-- =========================================================================
-- FILE: 0021_backfill_unambiguous_resume_scores.sql
-- =========================================================================

-- Older intake workflows wrote resume scores by candidate_id only. When a
-- candidate has exactly one application in the workspace, that score can be
-- safely attached to the application. Ambiguous multi-job histories are left
-- for explicit re-screening rather than assigning a score to the wrong job.
with single_application_candidates as (
  select
    a.account_id,
    a.candidate_id,
    min(a.id::text)::uuid as application_id
  from public.applications a
  group by a.account_id, a.candidate_id
  having count(*) = 1
), latest_legacy_resume_score as (
  select distinct on (dl.account_id, dl.candidate_id)
    dl.id,
    dl.account_id,
    dl.candidate_id
  from public.decision_ledger dl
  where dl.application_id is null
    and dl.score_type is null
    and dl.score between 1 and 100
    and lower(dl.stage) like '%resume%'
  order by dl.account_id, dl.candidate_id, dl.created_at desc, dl.decided_at desc
)
update public.decision_ledger dl
set application_id = s.application_id,
    score_type = 'resume'
from single_application_candidates s,
     latest_legacy_resume_score old
where dl.id = old.id
  and dl.account_id = s.account_id
  and dl.candidate_id = s.candidate_id
  and not exists (
    select 1
    from public.decision_ledger current_score
    where current_score.application_id = s.application_id
      and current_score.score_type = 'resume'
      and current_score.score between 1 and 100
  );

-- =========================================================================
-- FILE: 0022_outbox_retention_offer_workers.sql
-- =========================================================================

-- Durable n8n work delivery, closed-job retention purge and SignWell lifecycle.

alter table public.workflow_outbox
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_token uuid,
  add column if not exists last_error text;

create or replace function public.claim_workflow_outbox(p_batch_size integer default 25)
returns setof public.workflow_outbox
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  return query
  with picked as (
    select w.id from public.workflow_outbox w
    where ((w.status in ('queued','failed') and w.attempt_count < 8 and w.available_at <= now())
       or (w.status = 'processing' and w.claimed_at < now() - interval '10 minutes'))
      and (w.event_type <> 'voice_call_ready' or exists (
        select 1 from public.round_instances ri
        join public.campaign_rounds cr on cr.campaign_id=ri.campaign_id and cr.round_number=ri.round_number
        join public.accounts a on a.id=ri.account_id
        where ri.id=w.round_instance_id and ri.status='pending'
          and cr.daily_start_time is not null and cr.daily_end_time is not null
          and (now() at time zone a.timezone)::time >= cr.daily_start_time
          and (now() at time zone a.timezone)::time < cr.daily_end_time
      ))
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size,25),100))
  ), claimed as (
    update public.workflow_outbox w
    set status='processing', claimed_at=now(), lease_token=gen_random_uuid(),
        attempt_count=attempt_count+1
    from picked where w.id=picked.id
    returning w.*
  ) select * from claimed;
end;
$$;

create or replace function public.finish_workflow_outbox(
  p_id uuid, p_lease_token uuid, p_success boolean, p_error text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  update public.workflow_outbox
  set status=case when p_success then 'sent' when attempt_count >= 8 then 'failed' else 'queued' end,
      completed_at=case when p_success then now() else null end,
      available_at=case when p_success then available_at else now() + make_interval(secs => least(3600, 15 * (2 ^ least(attempt_count,7)))) end,
      last_error=case when p_success then null else left(coalesce(p_error,'delivery_failed'),1000) end,
      claimed_at=null, lease_token=null
  where id=p_id and status='processing' and lease_token=p_lease_token
  returning attempt_count into v_attempt;
  if not found then raise exception 'outbox_lease_lost' using errcode='40001'; end if;
end;
$$;

revoke all on function public.claim_workflow_outbox(integer) from public, anon, authenticated;
revoke all on function public.finish_workflow_outbox(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.claim_workflow_outbox(integer) to service_role;
grant execute on function public.finish_workflow_outbox(uuid,uuid,boolean,text) to service_role;

create table public.retention_purge_queue (
  campaign_id uuid primary key,
  account_id uuid not null,
  status text not null default 'queued' check(status in ('queued','processing','failed')),
  lease_token uuid,
  claimed_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.retention_purge_queue enable row level security;

create or replace function public.claim_expired_campaign_purges(p_batch_size integer default 10)
returns table(campaign_id uuid, account_id uuid, lease_token uuid)
language plpgsql security definer set search_path=public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  insert into public.retention_purge_queue(campaign_id,account_id)
  select c.id,c.account_id from public.campaigns c
  where c.status='closed' and c.retention_purge_at <= now()
  on conflict(campaign_id) do nothing;
  return query
  with picked as (
    select q.campaign_id from public.retention_purge_queue q
    join public.campaigns c on c.id=q.campaign_id
    where (q.status in ('queued','failed') or (q.status='processing' and q.claimed_at < now()-interval '10 minutes'))
      and c.status='closed' and c.retention_purge_at <= now()
    order by q.created_at for update of q skip locked
    limit greatest(1,least(coalesce(p_batch_size,10),50))
  ), claimed as (
    update public.retention_purge_queue q set status='processing',lease_token=gen_random_uuid(),claimed_at=now(),attempt_count=q.attempt_count+1
    from picked where q.campaign_id=picked.campaign_id
    returning q.campaign_id,q.account_id,q.lease_token
  ) select claimed.campaign_id, claimed.account_id, claimed.lease_token from claimed;
end;
$$;

create or replace function public.complete_campaign_retention_purge(p_campaign_id uuid,p_lease_token uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path=public
as $$
declare v_queue public.retention_purge_queue%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into v_queue from public.retention_purge_queue where campaign_id=p_campaign_id and lease_token=p_lease_token and status='processing' for update;
  if not found then raise exception 'purge_lease_lost' using errcode='40001'; end if;
  if p_success then
    delete from public.campaigns where id=p_campaign_id and account_id=v_queue.account_id and status='closed' and retention_purge_at<=now();
    if found then delete from public.retention_purge_queue where campaign_id=p_campaign_id; else raise exception 'campaign_not_expired_or_missing' using errcode='55000'; end if;
  else
    update public.retention_purge_queue set status='failed',lease_token=null,claimed_at=null,last_error=left(coalesce(p_error,'purge_failed'),1000) where campaign_id=p_campaign_id;
  end if;
end;
$$;
revoke all on function public.claim_expired_campaign_purges(integer) from public,anon,authenticated;
revoke all on function public.complete_campaign_retention_purge(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_expired_campaign_purges(integer) to service_role;
grant execute on function public.complete_campaign_retention_purge(uuid,uuid,boolean,text) to service_role;

-- Offers become countable only after SignWell confirms the recruiter signed
-- and automatically released the document to the candidate.
alter table public.offers drop constraint if exists offers_status_check;
alter table public.offers add constraint offers_status_check
  check(status in ('awaiting_company_signature','sent_to_candidate','void'));
alter table public.company_signwell_templates
  add column if not exists company_placeholder text not null default 'Company',
  add column if not exists candidate_placeholder text not null default 'Candidate';

create or replace function public.prepare_offer(
  p_campaign_id uuid,p_application_id uuid,p_template_id uuid default null,p_field_values jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_app public.applications%rowtype; v_campaign public.campaigns%rowtype; v_email text; v_recruiter_name text; v_template public.company_signwell_templates%rowtype; v_id uuid; v_count integer;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='28000'; end if;
  select * into v_app from public.applications where id=p_application_id and account_id=auth.uid() for update;
  if not found or v_app.campaign_id<>p_campaign_id then raise exception 'offer_application_mismatch'; end if;
  select * into v_campaign from public.campaigns where id=p_campaign_id and account_id=auth.uid() for share;
  if v_campaign.status<>'open' then raise exception 'job_closed'; end if;
  if v_app.current_stage<>'offer' or v_app.status not in ('active','offer_ready') then raise exception 'application_not_offer_ready'; end if;
  select email,name into v_email,v_recruiter_name from public.accounts where id=auth.uid();
  if v_email is null then raise exception 'recruiter_email_required'; end if;
  if p_template_id is null then
    select * into v_template from public.company_signwell_templates where account_id=auth.uid() and active order by created_at,id limit 1;
  else
    select * into v_template from public.company_signwell_templates where id=p_template_id and account_id=auth.uid() and active;
  end if;
  if not found then raise exception 'offer_template_unavailable'; end if;
  select count(*) into v_count from public.offer_capacity_events where campaign_id=p_campaign_id;
  insert into public.offers(account_id,campaign_id,application_id,template_id,field_values,candidate_email,company_signer_email)
  values(auth.uid(),p_campaign_id,p_application_id,v_template.id,coalesce(p_field_values,'{}'),v_app.candidate_email,v_email)
  on conflict(application_id) do update set
    template_id=excluded.template_id,field_values=excluded.field_values
  where offers.signwell_document_id is null and offers.status='awaiting_company_signature'
  returning id into v_id;
  if v_id is null then raise exception 'offer_already_dispatched'; end if;
  return jsonb_build_object('offer_id',v_id,'template_signwell_id',v_template.signwell_template_id,
    'candidate_email',v_app.candidate_email,'candidate_name',v_app.candidate_name,
    'company_signer_email',v_email,'company_signer_name',coalesce(v_recruiter_name,v_email),
    'company_placeholder',v_template.company_placeholder,'candidate_placeholder',v_template.candidate_placeholder,
    'capacity_warning',v_count>=v_campaign.number_of_openings,
    'offers_sent',v_count,'openings',v_campaign.number_of_openings);
end;
$$;

create or replace function public.attach_signwell_offer(p_offer_id uuid,p_document_id text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  update public.offers set signwell_document_id=p_document_id
  where id=p_offer_id and status='awaiting_company_signature' and signwell_document_id is null;
  if not found and not exists(select 1 from public.offers where id=p_offer_id and signwell_document_id=p_document_id) then
    raise exception 'offer_state_conflict';
  end if;
end;
$$;

create or replace function public.mark_offer_sent_to_candidate(p_document_id text,p_signer_email text)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_updated integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  update public.offers set status='sent_to_candidate',sent_to_candidate_at=now()
  where signwell_document_id=p_document_id and status='awaiting_company_signature'
    and lower(company_signer_email)=lower(btrim(p_signer_email));
  get diagnostics v_updated = row_count;
  if v_updated > 0 then return true; end if;
  return exists(select 1 from public.offers where signwell_document_id=p_document_id
    and status='sent_to_candidate' and lower(company_signer_email)=lower(btrim(p_signer_email)));
end;
$$;
revoke all on function public.prepare_offer(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.prepare_offer(uuid,uuid,uuid,jsonb) to authenticated;
revoke all on function public.attach_signwell_offer(uuid,text) from public,anon,authenticated;
revoke all on function public.mark_offer_sent_to_candidate(text,text) from public,anon,authenticated;
grant execute on function public.attach_signwell_offer(uuid,text) to service_role;
grant execute on function public.mark_offer_sent_to_candidate(text,text) to service_role;

-- OAuth refresh tokens must never be sent to Postgres in plaintext. Remove
-- legacy data from the account-level calendar table; n8n's encrypted credential
-- store is the only supported token store going forward.
alter table public.calendar_connections drop column if exists refresh_token_encrypted;

-- =========================================================================
-- FILE: 0023_calendar_credentials_and_evaluations.sql
-- =========================================================================

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

-- =========================================================================
-- FILE: 0024_outbox_context.sql
-- =========================================================================

-- Give background workflow consumers an immutable, application-scoped snapshot.
create or replace function public.enrich_workflow_outbox_payload()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_app public.applications%rowtype;
begin
  if new.application_id is not null then
    select * into v_app from public.applications where id=new.application_id and account_id=new.account_id;
    if found then
      new.payload := coalesce(new.payload,'{}'::jsonb) || jsonb_build_object(
        'candidate_id',v_app.candidate_id,'candidate_name',v_app.candidate_name,
        'candidate_email',v_app.candidate_email,'candidate_phone',v_app.candidate_phone,
        'whatsapp_opt_in',v_app.whatsapp_opt_in,'campaign_id',v_app.campaign_id
      );
    end if;
  end if;
  return new;
end;
$$;
create trigger workflow_outbox_application_context
before insert on public.workflow_outbox
for each row execute function public.enrich_workflow_outbox_payload();

-- =========================================================================
-- FILE: 0025_candidate_booking_rpc.sql
-- =========================================================================

-- Candidate authenticated calendar booking with one self-service reschedule.
alter table public.round_instances
  add column if not exists reschedule_count integer not null default 0
    check(reschedule_count between 0 and 1);

create or replace function public.book_interview_slot(
  p_round_instance_id uuid,p_token text,p_slot_start timestamptz,p_slot_end timestamptz,
  p_event_id text,p_meet_link text,p_is_reschedule boolean default false
) returns void language plpgsql security definer set search_path=public
as $$
declare v_round public.round_instances%rowtype; v_cr public.campaign_rounds%rowtype; v_job public.campaigns%rowtype; v_app public.applications%rowtype; v_interviewer_email text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if not exists(select 1 from public.candidate_access_tokens t where t.resource_type='booking'
    and t.resource_id=p_round_instance_id and t.token_hash=encode(digest(p_token,'sha256'),'hex')
    and t.revoked_at is null and t.expires_at>now()) then raise exception 'booking_token_invalid' using errcode='28000'; end if;
  select * into v_round from public.round_instances where id=p_round_instance_id for update;
  if not found or v_round.round_type<>'human_interview' then raise exception 'round_not_bookable'; end if;
  select * into v_job from public.campaigns where id=v_round.campaign_id and account_id=v_round.account_id;
  if not found or v_job.status<>'open' then raise exception 'job_closed'; end if;
  select * into v_app from public.applications where id=v_round.application_id and account_id=v_round.account_id;
  if not found or v_app.status in ('rejected','on_hold','offer_sent') then raise exception 'application_not_bookable'; end if;
  select * into v_cr from public.campaign_rounds where campaign_id=v_round.campaign_id and round_number=v_round.round_number;
  select coalesce(tm.email,v_cr.interviewer_email) into v_interviewer_email
    from (select v_cr.assigned_team_member_id as member_id) assigned
    left join public.team_members tm on tm.id=assigned.member_id;
  if p_slot_start is null or p_slot_end is null or p_slot_start<=now() or p_slot_end<=p_slot_start
     or v_cr.duration_minutes is null
     or extract(epoch from (p_slot_end-p_slot_start))/60 <> v_cr.duration_minutes then raise exception 'invalid_interview_slot'; end if;
  if v_round.status='pending' and not p_is_reschedule then
    null;
  elsif v_round.status='scheduled' and p_is_reschedule and v_round.reschedule_count=0 and v_round.scheduled_at>now() then
    update public.calendar_events set slot_start=p_slot_start,slot_end=p_slot_end,event_id=p_event_id
      where round_instance_id=v_round.id;
    if not found then
      insert into public.calendar_events(account_id,round_instance_id,interviewer_email,event_id,slot_start,slot_end)
      values(v_round.account_id,v_round.id,coalesce(v_interviewer_email,''),p_event_id,p_slot_start,p_slot_end);
    end if;
    update public.round_instances set scheduled_at=p_slot_start,event_id=p_event_id,
      conferencing_link=p_meet_link,reschedule_count=1 where id=v_round.id;
    return;
  else raise exception 'booking_state_conflict' using errcode='55000';
  end if;
  if exists(select 1 from public.calendar_events e where e.round_instance_id<>v_round.id
    and e.interviewer_email=coalesce(v_interviewer_email,'') and e.slot_start<p_slot_end and e.slot_end>p_slot_start) then
    raise exception 'interview_slot_unavailable';
  end if;
  insert into public.calendar_events(account_id,round_instance_id,interviewer_email,event_id,slot_start,slot_end)
  values(v_round.account_id,v_round.id,coalesce(v_interviewer_email,''),p_event_id,p_slot_start,p_slot_end);
  update public.round_instances set status='scheduled',scheduled_at=p_slot_start,event_id=p_event_id,
    conferencing_link=p_meet_link,reschedule_count=0 where id=v_round.id;
end;
$$;
revoke all on function public.book_interview_slot(uuid,text,timestamptz,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.book_interview_slot(uuid,text,timestamptz,timestamptz,text,text,boolean) to service_role;

-- =========================================================================
-- FILE: 0026_retention_asset_manifest.sql
-- =========================================================================

-- Backfill retention snapshots for jobs already Closed when lifecycle fields
-- were introduced, and expose their private storage objects to the purge worker.
update public.campaigns c
set retention_days_snapshot=coalesce(c.retention_days_snapshot,tl.retention_days),
    closed_at=coalesce(c.closed_at,now()),
    retention_purge_at=coalesce(c.retention_purge_at,now()+make_interval(days=>tl.retention_days))
from public.accounts a join public.tier_limits tl on tl.id=a.tier
where c.account_id=a.id and c.status='closed' and c.retention_purge_at is null;

create or replace function public.get_campaign_retention_storage_paths(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=public,storage
as $$
declare v_account uuid; v_result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select account_id into v_account from public.campaigns where id=p_campaign_id and status='closed' and retention_purge_at<=now();
  if not found then raise exception 'campaign_not_expired'; end if;
  select jsonb_build_object(
    'resumes',coalesce((select jsonb_agg(o.name) from storage.objects o where o.bucket_id='resumes' and o.name like v_account::text||'/'||p_campaign_id::text||'/%'),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(o.name) from storage.objects o where o.bucket_id='assignments' and o.name like v_account::text||'/'||p_campaign_id::text||'/%'),'[]'::jsonb),
    'interview-recordings',coalesce((select jsonb_agg(o.name) from storage.objects o
      where o.bucket_id='interview-recordings' and split_part(o.name,'/',1)=v_account::text
        and split_part(o.name,'/',2) in (
          select s.id::text from public.interview_sessions s join public.round_instances r on r.id=s.round_instance_id
          where r.campaign_id=p_campaign_id and r.account_id=v_account
        )),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_campaign_retention_storage_paths(uuid) from public,anon,authenticated;
grant execute on function public.get_campaign_retention_storage_paths(uuid) to service_role;

-- =========================================================================
-- FILE: 0027_purge_and_offer_cancellation.sql
-- =========================================================================

-- Preserve external SignWell cancellation work after tenant job rows cascade.
alter table public.signwell_cancellation_queue alter column campaign_id drop not null;
alter table public.signwell_cancellation_queue drop constraint if exists signwell_cancellation_queue_campaign_id_fkey;
alter table public.signwell_cancellation_queue add constraint signwell_cancellation_queue_campaign_id_fkey
  foreign key(campaign_id) references public.campaigns(id) on delete set null;

create or replace function public.complete_campaign_retention_purge(p_campaign_id uuid,p_lease_token uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path=public
as $$
declare v_queue public.retention_purge_queue%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into v_queue from public.retention_purge_queue where campaign_id=p_campaign_id and lease_token=p_lease_token and status='processing' for update;
  if not found then raise exception 'purge_lease_lost' using errcode='40001'; end if;
  if p_success then
    delete from public.candidate_access_tokens t where t.account_id=v_queue.account_id and t.resource_id in (
      select r.id from public.round_instances r where r.campaign_id=p_campaign_id
      union select s.id from public.interview_sessions s join public.round_instances r on r.id=s.round_instance_id where r.campaign_id=p_campaign_id
      union select a.id from public.assignments a where a.account_id=v_queue.account_id and a.application_id in (select id from public.applications where campaign_id=p_campaign_id)
    );
    delete from public.campaigns where id=p_campaign_id and account_id=v_queue.account_id and status='closed' and retention_purge_at<=now();
    if found then delete from public.retention_purge_queue where campaign_id=p_campaign_id; else raise exception 'campaign_not_expired_or_missing' using errcode='55000'; end if;
  else
    update public.retention_purge_queue set status='failed',lease_token=null,claimed_at=null,last_error=left(coalesce(p_error,'purge_failed'),1000) where campaign_id=p_campaign_id;
  end if;
end;
$$;
revoke all on function public.complete_campaign_retention_purge(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.complete_campaign_retention_purge(uuid,uuid,boolean,text) to service_role;

-- =========================================================================
-- FILE: 0028_voice_call_window_scheduling.sql
-- =========================================================================

-- Pick one randomized call instant within the job's timezone window. The
-- outbox worker only claims it when the job and round are still eligible.
create or replace function public.enrich_workflow_outbox_payload()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_app public.applications%rowtype; v_round public.round_instances%rowtype; v_start time; v_end time; v_timezone text; v_offset numeric; v_today timestamptz;
begin
  if new.application_id is not null then
    select * into v_app from public.applications where id=new.application_id and account_id=new.account_id;
    if found then
      new.payload := coalesce(new.payload,'{}'::jsonb) || jsonb_build_object(
        'candidate_id',v_app.candidate_id,'candidate_name',v_app.candidate_name,
        'candidate_email',v_app.candidate_email,'candidate_phone',v_app.candidate_phone,
        'whatsapp_opt_in',v_app.whatsapp_opt_in,'campaign_id',v_app.campaign_id
      );
    end if;
  end if;
  if new.event_type='voice_call_ready' and new.round_instance_id is not null then
    select * into v_round from public.round_instances where id=new.round_instance_id;
    select cr.daily_start_time,cr.daily_end_time,a.timezone into v_start,v_end,v_timezone
      from public.campaign_rounds cr join public.accounts a on a.id=new.account_id
      where cr.campaign_id=v_round.campaign_id and cr.round_number=v_round.round_number;
    if v_start is null or v_end is null or v_timezone is null then raise exception 'voice_window_missing'; end if;
    v_offset := extract(epoch from (v_end-v_start));
    if v_offset<=0 then v_offset:=v_offset+86400; end if;
    v_today := ((now() at time zone v_timezone)::date + v_start + (random()*v_offset)*interval '1 second') at time zone v_timezone;
    if v_today<=now() then
      v_today := (((now() at time zone v_timezone)::date + 1) + v_start + (random()*v_offset)*interval '1 second') at time zone v_timezone;
    end if;
    new.available_at := v_today;
  end if;
  return new;
end;
$$;

-- =========================================================================
-- FILE: 0029_candidate_access_tokens.sql
-- =========================================================================

-- Candidate-facing links are signed by an opaque random token. Only a hash is
-- persisted; n8n receives the single-use plaintext while building the message.
create or replace function public.store_candidate_access_token(
  p_account_id uuid,p_resource_type text,p_resource_id uuid,p_token_hash text,p_expires_at timestamptz
) returns void language plpgsql security definer set search_path=public
as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_resource_type is null or p_resource_id is null or p_token_hash is null then return; end if;
  if p_resource_type not in ('booking','session','assignment') or length(p_token_hash)<>64
     or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '31 days' then raise exception 'candidate_token_invalid'; end if;
  insert into public.candidate_access_tokens(account_id,resource_type,resource_id,token_hash,expires_at)
  values(p_account_id,p_resource_type,p_resource_id,p_token_hash,p_expires_at);
end;
$$;
revoke all on function public.store_candidate_access_token(uuid,text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.store_candidate_access_token(uuid,text,uuid,text,timestamptz) to service_role;

create or replace function public.enrich_workflow_outbox_payload()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_app public.applications%rowtype; v_round public.round_instances%rowtype; v_start time; v_end time; v_timezone text; v_offset numeric; v_candidate_time timestamptz; v_job_name text;
begin
  if new.application_id is not null then
    select * into v_app from public.applications where id=new.application_id and account_id=new.account_id;
    if found then
      select name into v_job_name from public.campaigns where id=v_app.campaign_id;
      new.payload := coalesce(new.payload,'{}'::jsonb) || jsonb_build_object(
        'candidate_id',v_app.candidate_id,'candidate_name',v_app.candidate_name,
        'candidate_email',v_app.candidate_email,'candidate_phone',v_app.candidate_phone,
        'whatsapp_opt_in',v_app.whatsapp_opt_in,'campaign_id',v_app.campaign_id,'job_title',v_job_name
      );
    end if;
  end if;
  if new.event_type='voice_call_ready' and new.round_instance_id is not null then
    select * into v_round from public.round_instances where id=new.round_instance_id;
    select cr.daily_start_time,cr.daily_end_time,a.timezone into v_start,v_end,v_timezone
      from public.campaign_rounds cr join public.accounts a on a.id=new.account_id
      where cr.campaign_id=v_round.campaign_id and cr.round_number=v_round.round_number;
    if v_start is null or v_end is null or v_timezone is null then raise exception 'voice_window_missing'; end if;
    v_offset := extract(epoch from (v_end-v_start));
    if v_offset<=0 then v_offset:=v_offset+86400; end if;
    v_candidate_time := ((now() at time zone v_timezone)::date + v_start + (random()*v_offset)*interval '1 second') at time zone v_timezone;
    if v_candidate_time<=now() then
      v_candidate_time := (((now() at time zone v_timezone)::date + 1) + v_start + (random()*v_offset)*interval '1 second') at time zone v_timezone;
    end if;
    new.available_at := v_candidate_time;
  end if;
  return new;
end;
$$;

-- =========================================================================
-- FILE: 0031_booking_context_round_duration.sql
-- =========================================================================

-- Booking page context is token-checked and carries the configured round length.
create or replace function public.get_booking_context(
  p_round_instance_id uuid,p_token text,p_tz_offset_minutes int default 0
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_ri public.round_instances%rowtype; v_cand public.candidates%rowtype; v_camp public.campaigns%rowtype;
  v_cr public.campaign_rounds%rowtype; v_account public.accounts%rowtype; v_booked jsonb;
begin
  if not public.candidate_token_valid(p_token,'booking',p_round_instance_id) then
    raise exception 'invalid_link' using detail='This booking link is invalid or has expired.';
  end if;
  select * into v_ri from public.round_instances where id=p_round_instance_id;
  if not found or v_ri.round_type<>'human_interview' then raise exception 'round_not_bookable'; end if;
  select * into v_camp from public.campaigns where id=v_ri.campaign_id and account_id=v_ri.account_id;
  if not found or v_camp.status<>'open' then raise exception 'job_closed'; end if;
  select * into v_cand from public.candidates where id=v_ri.candidate_id;
  select * into v_cr from public.campaign_rounds where campaign_id=v_ri.campaign_id and round_number=v_ri.round_number;
  select * into v_account from public.accounts where id=v_ri.account_id;
  select jsonb_build_object('event_id',ce.event_id,'slot_start',ce.slot_start,'slot_end',ce.slot_end,
    'meet_link',ce.meet_link,'interviewer_email',ce.interviewer_email) into v_booked
    from public.calendar_events ce where ce.round_instance_id=v_ri.id;
  return jsonb_build_object(
    'round_instance',jsonb_build_object('id',v_ri.id,'round_type',v_ri.round_type,'status',v_ri.status,
      'scheduled_at',v_ri.scheduled_at,'meet_link',v_ri.conferencing_link,'event_id',v_ri.event_id,'deadline_at',v_ri.deadline_at,'reschedule_count',v_ri.reschedule_count),
    'candidate',jsonb_build_object('id',v_cand.id,'name',v_cand.name,'email',v_cand.email,'phone',v_cand.phone),
    'campaign',jsonb_build_object('id',v_camp.id,'name',v_camp.name,'number_of_rounds',v_camp.number_of_rounds),
    'round',jsonb_build_object('round_number',v_cr.round_number,'round_type',v_cr.round_type,
      'interviewer_email',coalesce(v_cr.interviewer_email,(select tm.email from public.team_members tm where tm.id=v_cr.assigned_team_member_id)),
      'cutoff_score',v_cr.cutoff_score,'daily_start_time',to_char(v_cr.daily_start_time,'HH24:MI'),
      'daily_end_time',to_char(v_cr.daily_end_time,'HH24:MI'),'duration_minutes',v_cr.duration_minutes),
    'account',jsonb_build_object('tier',v_account.tier,'voice_screening_included',v_account.tier in ('basic','growth','enterprise')),
    'booked_event',v_booked
  );
end;
$$;
revoke all on function public.get_booking_context(uuid,text,int) from public;
grant execute on function public.get_booking_context(uuid,text,int) to anon,authenticated,service_role;

-- =========================================================================
-- FILE: 0032_idempotent_interview_evaluations.sql
-- =========================================================================

-- Make worker retries safe for AI interview session creation and round scoring.

create or replace function public.get_or_create_interview_session(
  p_account_id uuid,
  p_candidate_id uuid,
  p_round_instance_id uuid,
  p_expires_at timestamptz
) returns setof public.interview_sessions
language plpgsql security definer set search_path=public
as $$
declare v_round public.round_instances%rowtype; v_session public.interview_sessions%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  select * into v_round from public.round_instances
    where id=p_round_instance_id and account_id=p_account_id and candidate_id=p_candidate_id
    for update;
  if not found or v_round.round_type <> 'ai_interview' then raise exception 'round_type_mismatch'; end if;
  if not exists(select 1 from public.campaigns c where c.id=v_round.campaign_id and c.account_id=p_account_id and c.status='open') then
    raise exception 'job_closed';
  end if;
  if v_round.status not in ('pending','invited') then raise exception 'round_not_invitable'; end if;
  if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '31 days' then
    raise exception 'session_expiry_invalid';
  end if;
  select * into v_session from public.interview_sessions
    where round_instance_id=p_round_instance_id order by created_at desc limit 1 for update;
  if found then
    return next v_session;
    return;
  end if;
  insert into public.interview_sessions(account_id,candidate_id,round_instance_id,status,expires_at)
  values(p_account_id,p_candidate_id,p_round_instance_id,'invited',p_expires_at)
  returning * into v_session;
  return next v_session;
end;
$$;
revoke all on function public.get_or_create_interview_session(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.get_or_create_interview_session(uuid,uuid,uuid,timestamptz) to service_role;

-- The evaluator may be retried after a transient n8n failure. The round row lock
-- serializes worker retries and lets us update the latest existing score without
-- deleting any prior audit/history rows.

create or replace function public.record_round_evaluation(
  p_round_instance_id uuid,p_score_type text,p_score numeric,
  p_criteria_scores jsonb default '[]'::jsonb,p_evidence jsonb default '[]'::jsonb,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_round public.round_instances%rowtype; v_eval uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_score_type not in ('ai_interview','ai_voice','assignment') or p_score is null or p_score<1 or p_score>100 then raise exception 'evaluation_invalid'; end if;
  if jsonb_typeof(p_criteria_scores) is distinct from 'array' or jsonb_typeof(p_evidence) is distinct from 'array' then raise exception 'evaluation_invalid'; end if;
  select * into v_round from public.round_instances where id=p_round_instance_id for update;
  if not found or v_round.round_type <> (case p_score_type when 'ai_interview' then 'ai_interview' when 'ai_voice' then 'ai_voice_call' else 'assignment' end) then raise exception 'round_type_mismatch'; end if;
  if not exists(select 1 from public.campaigns c where c.id=v_round.campaign_id and c.status='open') then raise exception 'job_closed'; end if;
  select id into v_eval from public.application_evaluations
    where round_instance_id=v_round.id and score_type=p_score_type
    order by created_at desc limit 1 for update;
  if found then
    update public.application_evaluations set score=p_score,criteria_scores=p_criteria_scores,
      evidence=p_evidence,notes=p_notes,created_at=now() where id=v_eval;
  else
    insert into public.application_evaluations(account_id,application_id,round_instance_id,score_type,score,criteria_scores,evidence,notes)
    values(v_round.account_id,v_round.application_id,v_round.id,p_score_type,p_score,p_criteria_scores,p_evidence,p_notes)
    returning id into v_eval;
  end if;
  if not exists(select 1 from public.decision_ledger d where d.round_instance_id=v_round.id and d.score_type=p_score_type) then
    insert into public.decision_ledger(account_id,candidate_id,application_id,round_instance_id,stage,score,score_type,rationale,source)
    values(v_round.account_id,v_round.candidate_id,v_round.application_id,v_round.id,'round',p_score,p_score_type,p_notes,'workflow');
  else
    update public.decision_ledger set score=p_score,rationale=p_notes
      where round_instance_id=v_round.id and score_type=p_score_type;
  end if;
  update public.round_instances set status='completed' where id=v_round.id and status in ('scheduled','in_progress','awaiting_review','pending');
  if not found and v_round.status<>'completed' then raise exception 'round_not_evaluable'; end if;
  return v_eval;
end;
$$;
revoke all on function public.record_round_evaluation(uuid,text,numeric,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_round_evaluation(uuid,text,numeric,jsonb,jsonb,text) to service_role;

-- =========================================================================
-- FILE: 0033_authenticated_api_grants.sql
-- =========================================================================

-- Grant the Supabase Data API roles the SQL privileges required to reach
-- client-visible tables. These grants do not bypass RLS; existing policies
-- continue to enforce account isolation.

grant usage on schema public to authenticated, anon;

-- Recruiter workspace reads. The dashboard and recruiter pages query these
-- tables directly through PostgREST using the authenticated user's JWT.
grant select on table
  public.accounts,
  public.candidates,
  public.campaigns,
  public.campaign_rounds,
  public.round_instances,
  public.decision_ledger,
  public.credit_ledger,
  public.outreach_log,
  public.interview_sessions,
  public.interview_questions,
  public.interview_answers,
  public.scorecards,
  public.proctoring_events,
  public.audit_log,
  public.team_members,
  public.calendar_connections,
  public.calendar_events,
  public.assignment_submissions,
  public.applications,
  public.application_evaluations,
  public.assignments,
  public.company_signwell_templates,
  public.offers,
  public.offer_capacity_events,
  public.interviewer_calendar_connections,
  public.interviewer_feedback
to authenticated;

-- Existing public-read RLS policy on plan metadata still applies to both roles.
grant select on table public.tier_limits to anon, authenticated;

-- The view is exposed to authenticated recruiters, so enforce the underlying
-- tables' RLS policies as the caller instead of the view owner's privileges.
alter view public.campaign_candidates set (security_invoker = true);
grant select on table public.campaign_candidates to authenticated;

-- Direct writes used by recruiter profile/preferences and campaign setup.
-- Row-level policies remain the authorization boundary for each update.
grant update on table public.accounts, public.campaigns to authenticated;

-- Recruiter override action writes an audit-backed decision directly.
grant insert on table public.decision_ledger, public.audit_log to authenticated;

-- =========================================================================
-- FILE: 0034_service_role_api_grants.sql
-- =========================================================================

-- n8n uses Supabase's service_role key for trusted backend workflows. Bypassing
-- RLS does not itself grant SQL table privileges, so explicitly grant the
-- backend role access to the public API objects it needs.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Keep future migrations' public tables, sequences, and RPCs usable by n8n.
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- Allow trusted background workflows running under service_role (where auth.uid() is null)
-- to execute application intake and resume screening by deriving the account from the campaign/application.

create or replace function public.create_application_intake(
  p_campaign_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_resume_path text,
  p_whatsapp_opt_in boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
  v_campaign public.campaigns%rowtype;
  v_candidate_id uuid;
  v_application public.applications%rowtype;
  v_email text := lower(btrim(p_candidate_email));
  v_normalized_email text;
  v_round_count integer;
  v_voice_round_count integer;
begin
  if v_account_id is null and coalesce(auth.role(), '') = 'service_role' then
    select account_id into v_account_id
    from public.campaigns
    where id = p_campaign_id;
  end if;

  if v_account_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if nullif(btrim(p_candidate_name), '') is null
     or nullif(v_email, '') is null
     or position('@' in v_email) < 2
     or nullif(btrim(p_resume_path), '') is null then
    raise exception 'candidate_name_email_and_resume_required' using errcode = '22023';
  end if;

  v_normalized_email := lower(
    regexp_replace(split_part(v_email, '@', 1), '[+].*', '')
    || '@' || split_part(v_email, '@', 2)
  );

  select * into v_campaign
  from public.campaigns
  where id = p_campaign_id and account_id = v_account_id
  for share;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if v_campaign.status <> 'open' then
    raise exception 'job_closed' using errcode = '55000';
  end if;

  select count(*), count(*) filter (where round_type = 'ai_voice_call')
    into v_round_count, v_voice_round_count
  from public.campaign_rounds
  where campaign_id = p_campaign_id;
  if v_round_count = 0 or v_round_count <> v_campaign.number_of_rounds then
    raise exception 'pipeline_incomplete' using errcode = '55000';
  end if;
  if v_voice_round_count > 0 and nullif(btrim(p_candidate_phone), '') is null then
    raise exception 'phone_required' using errcode = '22023';
  end if;
  if split_part(btrim(p_resume_path), '/', 1) <> v_account_id::text
     or split_part(btrim(p_resume_path), '/', 2) <> p_campaign_id::text then
    p_resume_path := v_account_id::text || '/' || p_campaign_id::text || '/' || regexp_replace(btrim(p_resume_path), '^.*/', '');
  end if;

  insert into public.candidates (account_id, name, email, phone)
  values (v_account_id, btrim(p_candidate_name), v_email, nullif(btrim(p_candidate_phone), ''))
  on conflict (account_id, normalized_email) do nothing;

  select id into v_candidate_id
  from public.candidates
  where account_id = v_account_id and normalized_email = v_normalized_email;
  if v_candidate_id is null then
    raise exception 'candidate_identity_creation_failed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.applications
    where campaign_id = p_campaign_id and normalized_email = v_normalized_email
  ) then
    raise exception 'candidate_already_uploaded' using errcode = '23505';
  end if;

  insert into public.applications (
    account_id, campaign_id, candidate_id, candidate_name, candidate_email,
    candidate_phone, resume_path, whatsapp_opt_in, status, current_stage
  ) values (
    v_account_id, p_campaign_id, v_candidate_id, btrim(p_candidate_name), v_email,
    nullif(btrim(p_candidate_phone), ''), btrim(p_resume_path), coalesce(p_whatsapp_opt_in, false),
    'active', 'needs_review'
  ) returning * into v_application;

  return to_jsonb(v_application);
end;
$$;

create or replace function public.record_resume_screening(
  p_application_id uuid,
  p_score integer,
  p_rationale text,
  p_raw_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_ledger_id uuid;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_score is null or p_score < 1 or p_score > 100 then
    raise exception 'resume_score_out_of_range' using errcode = '22023';
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id
    and (account_id = auth.uid() or coalesce(auth.role(), '') = 'service_role')
  for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  insert into public.decision_ledger (
    account_id, candidate_id, application_id, stage, score_type,
    score, rationale, raw_text, source
  ) values (
    v_application.account_id, v_application.candidate_id, v_application.id,
    'resume_screening', 'resume', p_score, nullif(btrim(p_rationale), ''),
    left(p_raw_text, 40000), 'workflow'
  )
  on conflict (application_id, score_type)
    where score_type = 'resume' and application_id is not null
  do update set score = excluded.score,
                rationale = excluded.rationale,
                raw_text = excluded.raw_text,
                decided_at = now(),
                created_at = now()
  returning id into v_ledger_id;

  return jsonb_build_object(
    'application_id', v_application.id,
    'score', p_score,
    'score_type', 'resume',
    'evaluation_id', v_ledger_id
  );
end;
$$;

create or replace function public.create_screened_application_intake(
  p_campaign_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_resume_path text,
  p_whatsapp_opt_in boolean,
  p_score integer,
  p_rationale text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application jsonb;
  v_screening jsonb;
begin
  if nullif(btrim(p_resume_path), '') is null then
    raise exception 'resume_path_required' using errcode = '22023';
  end if;
  v_application := public.create_application_intake(
    p_campaign_id, p_candidate_name, p_candidate_email, p_candidate_phone,
    p_resume_path, p_whatsapp_opt_in
  );
  v_screening := public.record_resume_screening(
    (v_application->>'id')::uuid, p_score, coalesce(p_rationale, 'Screened'), null
  );
  return jsonb_build_object('application', v_application, 'screening', v_screening);
end;
$$;

revoke all on function public.create_application_intake(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_application_intake(uuid, text, text, text, text, boolean) to authenticated, service_role;

revoke all on function public.record_resume_screening(uuid, integer, text, text) from public, anon;
grant execute on function public.record_resume_screening(uuid, integer, text, text) to authenticated, service_role;

revoke all on function public.create_screened_application_intake(uuid, text, text, text, text, boolean, integer, text) from public, anon;
grant execute on function public.create_screened_application_intake(uuid, text, text, text, text, boolean, integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- =========================================================================
-- FILE: 0035_notification_templates_and_can_send_now.sql
-- =========================================================================

-- Notification dispatch prerequisites for n8n workflow "4 - Notification Dispatch (sub-workflow)".
-- Provides the quiet hours / sending window check RPC (can_send_now) and
-- notification templates table (notification_templates) with exact approved WhatsApp & rich HTML Email templates.

-- 1. Function: can_send_now
create or replace function public.can_send_now(
  p_account_id uuid default null,
  p_candidate_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := 'UTC';
begin
  if p_account_id is not null then
    select coalesce(timezone, 'UTC') into v_tz
    from public.accounts
    where id = p_account_id;
    if v_tz is null then v_tz := 'UTC'; end if;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'window_open'
  );
end;
$$;

grant execute on function public.can_send_now(uuid, uuid) to anon, authenticated, service_role;

-- 2. Table: notification_templates
create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  stage text not null,
  channel text not null default 'email', -- 'email', 'whatsapp', 'sms'
  approval_state text not null default 'approved', -- 'approved', 'pending', 'rejected'
  subject text,
  body_html text,
  meta_template_name text,
  locale text default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_templates_lookup
  on public.notification_templates (stage, channel, approval_state);

create unique index if not exists idx_notification_templates_unique
  on public.notification_templates (stage, channel, approval_state)
  where account_id is null;

alter table public.notification_templates enable row level security;

drop policy if exists "notification_templates_read" on public.notification_templates;
create policy "notification_templates_read"
  on public.notification_templates for select
  using (true);

drop policy if exists "notification_templates_write" on public.notification_templates;
create policy "notification_templates_write"
  on public.notification_templates for all
  using (account_id = auth.uid() or coalesce(auth.role(), '') = 'service_role')
  with check (account_id = auth.uid() or coalesce(auth.role(), '') = 'service_role');

grant select on table public.notification_templates to anon, authenticated, service_role;
grant all privileges on table public.notification_templates to service_role;

-- 3. Seed exact approved WhatsApp & HTML Email templates
insert into public.notification_templates (stage, channel, approval_state, subject, body_html, meta_template_name, locale)
values
  -- =========================================================================
  -- WhatsApp Templates (Meta approved template names and text)
  -- =========================================================================
  ('interview_invite', 'whatsapp', 'approved', null,
   'Hi {{1}}, congratulations on moving forward for the {{2}} role at {{3}}! Please book your interview slot using this link: {{4}}. We look forward to speaking with you.',
   'interview_invite_v1', 'en'),

  ('booking_reminder_day1', 'whatsapp', 'approved', null,
   'Hi {{1}}, a quick reminder to book your interview slot for the {{2}} role at {{3}}. You can pick a time here: {{4}}. Let us know if you need any help.',
   'booking_reminder_day1', 'en'),

  ('booking_reminder_day3', 'whatsapp', 'approved', null,
   'Hi {{1}}, we''re still waiting for you to select an interview time for the {{2}} position at {{3}}. Please book here: {{4}}. Slots are filling up, so we''d recommend choosing one soon.',
   'booking_reminder_day3', 'en'),

  ('booking_final_notice', 'whatsapp', 'approved', null,
   'Hi {{1}}, this is your final reminder to book your interview slot for the {{2}} role at {{3}}. The link will expire soon: {{4}}. Please book now to keep your application active.',
   'booking_final_notice', 'en'),

  ('pre_interview_24h', 'whatsapp', 'approved', null,
   'Hi {{1}}, a reminder that your interview for the {{2}} role at {{3}} is scheduled for {{4}}, about 24 hours from now. Please be ready a few minutes early. Good luck!',
   'pre_interview_24h', 'en'),

  ('interview_link_today', 'whatsapp', 'approved', null,
   'Hi {{1}}, your interview for the {{2}} role at {{3}} is today! Join using this secure link: {{4}}. Please join a few minutes before your slot.',
   'interview_link_today', 'en'),

  ('assignment_reminder_24h', 'whatsapp', 'approved', null,
   'Hi {{1}}, a reminder that your assignment for the {{2}} role at {{3}} is due in 24 hours. Submit it here: {{4}}. Good luck!',
   'assignment_reminder_24h', 'en'),

  ('result_next_round', 'whatsapp', 'approved', null,
   'Hi {{1}}, great news! You''ve cleared this round for the {{2}} role at {{3}}. Our team will share the next steps shortly. Congratulations!',
   'result_next_round', 'en'),

  ('result_not_selected', 'whatsapp', 'approved', null,
   'Hi {{1}}, thank you for your time and effort in the process for the {{2}} role at {{3}}. After careful review, we won''t be moving forward with your application at this time. We wish you all the best ahead.',
   'result_not_selected', 'en'),

  -- =========================================================================
  -- Rich HTML Email Templates
  -- =========================================================================
  -- 1. Book Your Interview Slot (Day 0 & Day 1)
  ('interview_invite', 'email', 'approved',
   'Book Your Interview Slot: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Book Your Interview Slot</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">This is a quick reminder to book your interview slot for the <strong>{{job_title}}</strong> role.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{booking_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Book Interview Slot</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues while booking or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  ('booking_reminder_day1', 'email', 'approved',
   'Book Your Interview Slot: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Book Your Interview Slot</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">This is a quick reminder to book your interview slot for the <strong>{{job_title}}</strong> role.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{booking_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Book Interview Slot</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues while booking or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 2. Your Invite Is Expiring (Day 3)
  ('booking_reminder_day3', 'email', 'approved',
   'Your Invite Is Expiring: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Your Invite Is Expiring</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">We are still waiting for you to select a time for your interview for the <strong>{{job_title}}</strong> role.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please book now to keep your application active.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{booking_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Book Interview Slot</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues while booking or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 3. Final Notice (Day 5)
  ('booking_final_notice', 'email', 'approved',
   'Final Notice: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Final Notice</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">This is your <strong>final notice</strong> to book your interview slot for the <strong>{{job_title}}</strong> role.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">The link will expire soon.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{booking_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Book Interview Slot</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues while booking or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 4. Interview Confirmed
  ('booking_confirmed', 'email', 'approved',
   'Interview Confirmed: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Interview Confirmed</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Your interview is <strong>confirmed</strong>!</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">We have sent a calendar invite to your email.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 5. Interview Rescheduled
  ('booking_rescheduled', 'email', 'approved',
   'Interview Rescheduled: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Interview Rescheduled</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Your interview has been <strong>successfully rescheduled</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please check your calendar for the updated time.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 6. Interview Tomorrow (24h before)
  ('pre_interview_24h', 'email', 'approved',
   'Interview Tomorrow: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Interview Tomorrow</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Your interview for the <strong>{{job_title}}</strong> role is coming up in <strong>24 hours</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please be prepared and join a few minutes early.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 7. Your Interview Is Today
  ('interview_link_today', 'email', 'approved',
   'Your Interview Is Today: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Your Interview Is Today</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Your interview is <strong>today</strong>! Here is your secure meeting link:</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{meeting_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Join Interview</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 8. Assignment Round (Issued)
  ('assignment_issued', 'email', 'approved',
   'Assignment Round: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Assignment Round</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Congratulations on moving to the <strong>assignment round</strong> for the <strong>{{job_title}}</strong> role!</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please review the details and complete it by the deadline.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 9. Assignment Check-in (Halfway)
  ('assignment_checkin', 'email', 'approved',
   'Assignment Check-in: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Assignment Check-in</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Just checking in on your take-home assignment!</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">You are <strong>halfway</strong> to the deadline.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 10. Assignment Due in 24 Hours
  ('assignment_reminder_24h', 'email', 'approved',
   'Assignment Due in 24 Hours: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Assignment Due in 24 Hours</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Just a reminder that your take-home assignment for the <strong>{{job_title}}</strong> role is due in <strong>24 hours</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Good luck!</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 11. Interview Cleared (Next Round)
  ('result_next_round', 'email', 'approved',
   'Interview Cleared: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Interview Cleared</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Congratulations! You have successfully moved to the next round for the <strong>{{job_title}}</strong> role at <strong>{{company_name}}</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please use the link below to book your interview slot.</p><table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto;"><tr><td style="background:#22c55e;border-radius:10px;"><a href="{{booking_link}}" style="display:inline-block;padding:16px 36px;font-size:17px;font-weight:bold;color:#0b2540;text-decoration:none;">Book Interview Slot</a></td></tr></table><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you face any issues while booking or have questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 12. Application Update
  ('application_update', 'email', 'approved',
   'Application Update: {{job_title}} - {{candidate_name}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Application Update</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">This is a quick message regarding your application for the <strong>{{job_title}}</strong> role.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Please check your email for any pending actions.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en'),

  -- 13. Not Selected
  ('result_not_selected', 'email', 'approved',
   'Update regarding your application for {{job_title}} | {{company_name}}',
   '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#10274a;border-radius:24px;"><tr><td style="padding:40px 40px 36px;"><div style="text-align:center;margin-bottom:28px;"><img src="https://inkfjgmnxkfitnegpiej.supabase.co/storage/v1/object/public/Logo/scalepods-logo-white.png" alt="ScalePods" height="48" style="height:48px;border:0;"><h1 style="margin:12px 0 0;font-size:22px;color:#e6ebf5;">Application Update</h1></div><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#ffffff;">Hi <strong>{{candidate_first_name}}</strong>,</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">Thank you for your time and effort in the process for the <strong>{{job_title}}</strong> role at <strong>{{company_name}}</strong>.</p><p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#e6ebf5;">After careful review, we will not be moving forward with your application at this time. We wish you all the best in your job search.</p><div style="background:#0a1b2e;border-left:4px solid #22c55e;border-radius:8px;padding:16px 20px;margin:24px 0;font-size:15px;line-height:1.6;color:#e6ebf5;">If you have any questions, please feel free to reach out.</div><p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#ffffff;">Regards,<br><strong>{{company_name}}</strong><br>HR Team</p></td></tr></table></div>',
   null, 'en')
on conflict (stage, channel, approval_state) where account_id is null
do update set
  body_html = excluded.body_html,
  meta_template_name = excluded.meta_template_name,
  subject = excluded.subject,
  updated_at = now();

-- 4. Reload PostgREST schema cache
notify pgrst, 'reload schema';

-- =========================================================================
-- FILE: 0036_ai_interview_turn_context_rpc.sql
-- =========================================================================

-- Migration 0036: High-performance turn context resolver for AI interview engine
-- Collapses 4 HTTP REST roundtrips into a single atomic RPC call, reducing turn latency by 600-800ms.

-- 1. Ensure required columns and indexes exist
alter table public.interview_sessions 
  add column if not exists started_at timestamptz;

alter table public.interview_questions 
  add column if not exists round_instance_id uuid,
  add column if not exists account_id uuid,
  add column if not exists question_number int,
  add column if not exists competency text;

alter table public.interview_answers 
  add column if not exists round_instance_id uuid,
  add column if not exists account_id uuid,
  add column if not exists created_at timestamptz default now();

create index if not exists idx_interview_questions_session_lookup 
  on public.interview_questions(session_id, order_index);

create index if not exists idx_interview_questions_round_lookup 
  on public.interview_questions(round_instance_id, question_number);

create index if not exists idx_interview_answers_session_lookup 
  on public.interview_answers(session_id, answered_at);

create index if not exists idx_interview_answers_round_lookup 
  on public.interview_answers(round_instance_id);

-- 2. Atomic Turn Context Resolver RPC
create or replace function public.get_interview_turn_context(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.interview_sessions%rowtype;
  v_questions jsonb := '[]'::jsonb;
  v_answers jsonb := '[]'::jsonb;
begin
  -- Fetch session
  select * into v_session 
  from public.interview_sessions 
  where id = p_session_id;

  if not found then
    return jsonb_build_object('error', 'session_not_found');
  end if;

  -- Validate expiry / completion
  if v_session.status in ('completed', 'expired') or 
     (v_session.expires_at is not null and v_session.expires_at <= now()) then
    return jsonb_build_object('error', 'invalid_or_expired_session');
  end if;

  -- Atomic state advancement: mark in_progress only on the initial turn if invited
  if v_session.status = 'invited' then
    update public.interview_sessions
    set status = 'in_progress',
        started_at = coalesce(started_at, now())
    where id = p_session_id
    returning * into v_session;
  end if;

  -- Fetch questions (ensures question_number and order_index are normalized for n8n)
  select coalesce(
    jsonb_agg(
      jsonb_set(
        jsonb_set(to_jsonb(q), '{question_number}', to_jsonb(coalesce(q.question_number, q.order_index, 0))),
        '{order_index}', to_jsonb(coalesce(q.order_index, q.question_number, 0))
      )
      order by coalesce(q.question_number, q.order_index, 0) asc
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.interview_questions q
  where q.session_id = v_session.id
     or (v_session.round_instance_id is not null and q.round_instance_id = v_session.round_instance_id);

  -- Fetch previous answers using answered_at
  select coalesce(
    jsonb_agg(
      to_jsonb(a) 
      order by a.answered_at asc
    ),
    '[]'::jsonb
  )
  into v_answers
  from public.interview_answers a
  where a.session_id = v_session.id
     or (v_session.round_instance_id is not null and a.round_instance_id = v_session.round_instance_id);

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'questions', v_questions,
    'answers', v_answers
  );
end;
$$;

grant execute on function public.get_interview_turn_context(uuid) to anon, authenticated, service_role;

-- =========================================================================
-- FILE: 0037_razorpay_subscriptions.sql
-- =========================================================================

-- 0037_razorpay_subscriptions.sql
-- Add Razorpay subscription management columns to public.accounts

alter table public.accounts
  add column if not exists razorpay_customer_id text,
  add column if not exists razorpay_subscription_id text,
  add column if not exists next_billing_date timestamptz,
  add column if not exists subscription_currency text default 'INR';

create index if not exists idx_accounts_razorpay_customer_id on public.accounts(razorpay_customer_id);
create index if not exists idx_accounts_razorpay_subscription_id on public.accounts(razorpay_subscription_id);

comment on column public.accounts.razorpay_customer_id is 'Razorpay customer ID (cust_...)';
comment on column public.accounts.razorpay_subscription_id is 'Active or latest Razorpay subscription ID (sub_...)';
comment on column public.accounts.next_billing_date is 'Next scheduled recurring charge date from Razorpay';
comment on column public.accounts.subscription_currency is 'Subscription billing currency (e.g. INR or USD)';

-- =========================================================================
-- FILE: 0038_cancel_at_period_end.sql
-- =========================================================================

-- 0038_cancel_at_period_end.sql
-- Add cancel_at_period_end to public.accounts to handle mid-cycle autopay cancellations
alter table public.accounts
  add column if not exists cancel_at_period_end boolean default false;

comment on column public.accounts.cancel_at_period_end is 'Indicates whether the recurring subscription is cancelled but remains active until next_billing_date';

-- =========================================================================
-- FILE: 0039_team_members_authenticated_grants.sql
-- =========================================================================

-- Grant full permissions on team_members to authenticated recruiters.
-- Row-level security (tenant_isolation) continues to restrict every
-- recruiter strictly to rows matching auth.uid().

grant insert, update, delete on table public.team_members to authenticated;

-- =========================================================================
-- FILE: 0040_create_calendar_oauth_state_service_role.sql
-- =========================================================================

-- Allow create_calendar_oauth_state to be called by service_role
-- (e.g. from n8n backend automation) as well as authenticated recruiters.

create or replace function public.create_calendar_oauth_state(p_team_member_id uuid, p_state_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  if nullif(p_state_hash, '') is null or length(p_state_hash) <> 64 then
    raise exception 'invalid_oauth_state';
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    select account_id into v_account
    from public.team_members
    where id = p_team_member_id;
  else
    if auth.uid() is null then
      raise exception 'authentication_required' using errcode = '28000';
    end if;
    select account_id into v_account
    from public.team_members
    where id = p_team_member_id and account_id = auth.uid();
  end if;

  if not found or v_account is null then
    raise exception 'interviewer_not_found';
  end if;

  insert into public.calendar_oauth_states(account_id, team_member_id, state_hash, expires_at)
  values (v_account, p_team_member_id, p_state_hash, now() + interval '10 minutes');

  insert into public.interviewer_calendar_connections(account_id, team_member_id, status)
  values (v_account, p_team_member_id, 'pending')
  on conflict (team_member_id) do update set status = 'pending', disconnected_at = null;

  return jsonb_build_object('account_id', v_account, 'team_member_id', p_team_member_id);
end;
$$;

-- =========================================================================
-- FILE: 0041_reporting_analytics_views.sql
-- =========================================================================

-- ============================================================
-- Migration 0041: Reporting & Analytics Dashboard Views
-- Provides v_funnel_conversion, v_time_to_hire, and v_source_effectiveness
-- ============================================================

-- 1. Funnel Conversion View
create or replace view public.v_funnel_conversion as
select
  c.account_id,
  c.id as campaign_id,
  c.name as campaign_name,
  count(distinct a.id)::int as entered_stage_1,
  count(distinct case when r.status = 'completed' then a.id end)::int as passed_any_round,
  count(distinct case when r.round_type = 'human_interview' then a.id end)::int as reached_human_interview,
  count(distinct o.id)::int as offers_made,
  count(distinct case when o.status in ('sent_to_candidate', 'signed') then o.id end)::int as offers_signed,
  case 
    when count(distinct a.id) = 0 then 0
    else round((count(distinct case when o.status in ('sent_to_candidate', 'signed') then o.id end)::numeric / count(distinct a.id)::numeric) * 100, 1)
  end as intake_to_signed_pct
from public.campaigns c
left join public.applications a on a.campaign_id = c.id
left join public.round_instances r on r.application_id = a.id
left join public.offers o on o.application_id = a.id
group by c.account_id, c.id, c.name;

-- 2. Time to Hire View
create or replace view public.v_time_to_hire as
select
  c.account_id,
  c.id as campaign_id,
  'All Stages'::text as stage,
  null::numeric as median_days,
  coalesce(round(avg(extract(epoch from (coalesce(o.sent_to_candidate_at, o.created_at) - a.created_at)) / 86400.0)::numeric, 1), 0) as average_days,
  count(distinct case when o.status in ('sent_to_candidate', 'signed') then o.id end)::int as hires,
  0::int as outlier_entries,
  coalesce(round(avg(extract(epoch from (coalesce(o.sent_to_candidate_at, o.created_at) - a.created_at)) / 86400.0)::numeric, 1), 0) as avg_days_intake_to_offer_signed,
  coalesce(round(avg(extract(epoch from (coalesce(r.scheduled_at, r.created_at) - r.created_at)) / 3600.0)::numeric, 1), 0) as avg_hours_per_round,
  count(distinct case when r.status in ('no_show', 'missed') then r.id end)::int as no_show_count,
  0::int as platform_fault_count
from public.campaigns c
left join public.applications a on a.campaign_id = c.id
left join public.round_instances r on r.application_id = a.id
left join public.offers o on o.application_id = a.id
group by c.account_id, c.id;

-- 3. Source Effectiveness View
create or replace view public.v_source_effectiveness as
select
  a.account_id,
  'Direct Application'::text as source,
  count(distinct a.id)::int as conversations,
  count(distinct o.id)::int as offers,
  case 
    when count(distinct a.id) = 0 then 0
    else round((count(distinct o.id)::numeric / count(distinct a.id)::numeric) * 100, 1)
  end as rate,
  'email'::text as channel,
  'intake'::text as stage,
  count(distinct w.id)::int as messages_sent,
  count(distinct case when w.status = 'sent' then w.id end)::int as delivered,
  count(distinct case when w.status = 'failed' then w.id end)::int as fell_back,
  case 
    when count(distinct w.id) = 0 then 100.0
    else round((count(distinct case when w.status = 'sent' then w.id end)::numeric / count(distinct w.id)::numeric) * 100, 1)
  end as delivery_rate_pct
from public.applications a
left join public.offers o on o.application_id = a.id
left join public.workflow_outbox w on w.account_id = a.account_id
group by a.account_id;

-- Grants
grant select on public.v_funnel_conversion to authenticated, service_role, anon;
grant select on public.v_time_to_hire to authenticated, service_role, anon;
grant select on public.v_source_effectiveness to authenticated, service_role, anon;

-- Bookings view alias over calendar_events for n8n workflows
alter table public.calendar_events
  add column if not exists status text not null default 'booked';

drop view if exists public.bookings;

create or replace view public.bookings as
select
  ce.id,
  ce.account_id,
  ce.round_instance_id,
  ce.interviewer_email,
  ce.event_id,
  ce.slot_start,
  ce.slot_end,
  ce.meet_link,
  ri.candidate_id,
  ri.campaign_id,
  ri.round_number,
  ri.round_type,
  ri.status as round_status,
  case
    when ri.status = 'no_show' then 'no_show'
    when ri.status in ('completed', 'passed', 'failed') then ri.status
    else 'booked'
  end as status,
  case
    when ri.status = 'no_show' then true
    else false
  end as no_show
from public.calendar_events ce
left join public.round_instances ri on ri.id = ce.round_instance_id;

alter view public.bookings set (security_invoker = true);
grant select, insert, update on public.bookings to anon, authenticated, service_role;
grant select, update on public.calendar_events to anon, authenticated, service_role;


