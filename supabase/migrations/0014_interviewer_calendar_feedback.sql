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
