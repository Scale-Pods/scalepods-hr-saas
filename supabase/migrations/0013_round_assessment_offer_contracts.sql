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
