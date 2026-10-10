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
