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
