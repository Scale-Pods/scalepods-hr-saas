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
    update public.retention_purge_queue q set status='processing',lease_token=gen_random_uuid(),claimed_at=now(),attempt_count=attempt_count+1
    from picked where q.campaign_id=picked.campaign_id
    returning q.campaign_id,q.account_id,q.lease_token
  ) select * from claimed;
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
