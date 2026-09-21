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