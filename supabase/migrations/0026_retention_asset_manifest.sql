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

