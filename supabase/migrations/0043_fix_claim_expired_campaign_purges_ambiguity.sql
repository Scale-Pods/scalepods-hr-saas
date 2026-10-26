-- Fix ambiguous column reference error 42702 in claim_expired_campaign_purges
-- When RETURNS TABLE defines campaign_id, PL/pgSQL variable substitution collides
-- with SQL column references (such as in ON CONFLICT).
-- We add #variable_conflict use_column and explicitly qualify all table references.

create or replace function public.claim_expired_campaign_purges(p_batch_size integer default 10)
returns table(campaign_id uuid, account_id uuid, lease_token uuid)
language plpgsql security definer set search_path=public
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  insert into public.retention_purge_queue(campaign_id, account_id)
  select c.id, c.account_id
  from public.campaigns c
  where c.status = 'closed' and c.retention_purge_at <= now()
  on conflict (campaign_id) do nothing;

  return query
  with picked as (
    select q.campaign_id
    from public.retention_purge_queue q
    join public.campaigns c on c.id = q.campaign_id
    where (q.status in ('queued', 'failed') or (q.status = 'processing' and q.claimed_at < now() - interval '10 minutes'))
      and c.status = 'closed'
      and c.retention_purge_at <= now()
    order by q.created_at
    for update of q skip locked
    limit greatest(1, least(coalesce(p_batch_size, 10), 50))
  ),
  claimed as (
    update public.retention_purge_queue q
    set status = 'processing',
        lease_token = gen_random_uuid(),
        claimed_at = now(),
        attempt_count = q.attempt_count + 1
    from picked
    where q.campaign_id = picked.campaign_id
    returning q.campaign_id, q.account_id, q.lease_token
  )
  select claimed.campaign_id, claimed.account_id, claimed.lease_token
  from claimed;
end;
$$;

revoke all on function public.claim_expired_campaign_purges(integer) from public, anon, authenticated;
grant execute on function public.claim_expired_campaign_purges(integer) to service_role;
