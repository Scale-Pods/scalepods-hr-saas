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

