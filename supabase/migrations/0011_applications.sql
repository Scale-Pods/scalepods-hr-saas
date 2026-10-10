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
