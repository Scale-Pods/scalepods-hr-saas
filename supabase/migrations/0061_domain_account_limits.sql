-- 0061_domain_account_limits.sql
-- Tiered account allowance per company domain:
-- Free: 3 accounts
-- Basic: 3 accounts
-- Growth: 5 accounts
-- Enterprise: 10 accounts
-- scalepods.co remains permanently exempt with unlimited accounts.

-- =========================================================================
-- 1. HELPER FUNCTION TO GET MAX ACCOUNTS FOR TIER
-- =========================================================================
create or replace function public.get_domain_max_accounts(p_tier text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_tier, 'free'))
    when 'enterprise' then 10
    when 'growth' then 5
    when 'basic' then 3
    when 'free' then 3
    else 3
  end;
$$;

grant execute on function public.get_domain_max_accounts(text) to authenticated, anon, service_role;

-- =========================================================================
-- 2. UPDATE CHECK_DOMAIN_ADMISSIBILITY
-- =========================================================================
create or replace function public.check_domain_admissibility(
  p_email text,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_domain text;
  v_domain_row public.company_domains%rowtype;
  v_account_count integer := 0;
  v_max_accounts integer := 3;
begin
  if p_email is null or position('@' in p_email) <= 1 then
    return jsonb_build_object(
      'allowed', false,
      'code', 'INVALID_EMAIL',
      'reason', 'Please provide a valid email address.'
    );
  end if;

  v_domain := lower(split_part(trim(p_email), '@', 2));

  -- 1. scalepods.co exemption (unlimited)
  if public.is_domain_exempt(v_domain) then
    return jsonb_build_object(
      'allowed', true,
      'domain', v_domain,
      'is_exempt', true,
      'is_exhausted', false,
      'tier', 'enterprise',
      'max_accounts', null
    );
  end if;

  -- 2. Consumer domain check
  if public.is_blocked_consumer_domain(v_domain) then
    return jsonb_build_object(
      'allowed', false,
      'domain', v_domain,
      'is_exempt', false,
      'code', 'BLOCKED_CONSUMER',
      'reason', 'Personal email providers like Gmail and Yahoo are not permitted for recruiter accounts. Please use your official company work email.'
    );
  end if;

  -- 3. Check existing company domain status
  select * into v_domain_row
  from public.company_domains
  where domain = v_domain;

  if found then
    -- If free tier is exhausted and still on free tier
    if v_domain_row.is_free_tier_exhausted and v_domain_row.tier = 'free' then
      return jsonb_build_object(
        'allowed', false,
        'domain', v_domain,
        'is_exempt', false,
        'is_exhausted', true,
        'tier', v_domain_row.tier,
        'code', 'FREE_TIER_EXHAUSTED',
        'reason', 'Your organization (' || v_domain || ') has exhausted its free tier trial. No new accounts can be created under this domain. Please upgrade to a paid plan.'
      );
    end if;

    -- Count existing accounts under this company domain
    select count(*) into v_account_count
    from public.accounts
    where company_domain = v_domain;

    v_max_accounts := public.get_domain_max_accounts(v_domain_row.tier);

    -- Check if limit reached
    if v_account_count >= v_max_accounts then
      return jsonb_build_object(
        'allowed', false,
        'domain', v_domain,
        'is_exempt', false,
        'is_exhausted', false,
        'tier', v_domain_row.tier,
        'current_count', v_account_count,
        'max_accounts', v_max_accounts,
        'code', 'DOMAIN_ACCOUNT_LIMIT_REACHED',
        'reason', 'Your organization (' || v_domain || ') has reached its limit of ' || v_max_accounts || ' free tier accounts for the ' || upper(v_domain_row.tier) || ' plan. Please upgrade your plan to add more team members.'
      );
    end if;

    return jsonb_build_object(
      'allowed', true,
      'domain', v_domain,
      'is_exempt', false,
      'is_exhausted', false,
      'tier', v_domain_row.tier,
      'current_count', v_account_count,
      'max_accounts', v_max_accounts
    );
  end if;

  -- Brand new company domain on free tier (allows up to 3 accounts)
  return jsonb_build_object(
    'allowed', true,
    'domain', v_domain,
    'is_exempt', false,
    'is_exhausted', false,
    'tier', 'free',
    'current_count', 0,
    'max_accounts', 3
  );
end;
$$;

grant execute on function public.check_domain_admissibility(text, uuid) to authenticated, anon, service_role;

-- =========================================================================
-- 3. UPDATE HANDLE_NEW_USER TRIGGER
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_domain text;
  v_domain_row public.company_domains%rowtype;
  v_is_exempt boolean := false;
  v_account_count integer := 0;
  v_max_accounts integer := 3;
  v_tier_to_assign text := 'free';
begin
  v_email := coalesce(new.email, '');
  if position('@' in v_email) > 1 then
    v_domain := lower(split_part(trim(v_email), '@', 2));
    v_is_exempt := public.is_domain_exempt(v_domain);

    if not v_is_exempt then
      -- Reject consumer webmail
      if public.is_blocked_consumer_domain(v_domain) then
        raise exception 'Consumer email domains are not permitted for recruiter signups. Please use your company work email.' using errcode = '22023';
      end if;

      -- Check existing domain entry
      select * into v_domain_row
      from public.company_domains
      where domain = v_domain;

      if found then
        -- Reject if domain exhausted free tier
        if v_domain_row.is_free_tier_exhausted and v_domain_row.tier = 'free' then
          raise exception 'Your company domain (%) has exhausted its free tier trial. Upgrade is required.', v_domain using errcode = '22023';
        end if;

        -- Count accounts under domain
        select count(*) into v_account_count
        from public.accounts
        where company_domain = v_domain;

        v_max_accounts := public.get_domain_max_accounts(v_domain_row.tier);

        -- Reject if account limit reached for the company's tier
        if v_account_count >= v_max_accounts then
          raise exception 'Your organization (%) has reached its limit of % free tier accounts for the % plan. Please upgrade to add more accounts.', v_domain, v_max_accounts, upper(v_domain_row.tier) using errcode = '22023';
        end if;

        -- Newly registered accounts for the company domain are given free tier accounts
        v_tier_to_assign := 'free';
      else
        -- Register new company domain on free tier
        insert into public.company_domains (domain, primary_account_id, tier, is_free_tier_exhausted, is_exempt)
        values (v_domain, new.id, 'free', false, false)
        on conflict (domain) do nothing;

        v_tier_to_assign := 'free';
      end if;
    else
      -- scalepods.co exemption: ensure domain row exists
      insert into public.company_domains (domain, primary_account_id, tier, is_free_tier_exhausted, is_exempt)
      values ('scalepods.co', null, 'enterprise', false, true)
      on conflict (domain) do update set is_exempt = true;

      v_tier_to_assign := 'enterprise';
    end if;
  end if;

  -- Create accounts row
  insert into public.accounts (id, billing_anchor_date, name, company_name, email, company_domain, tier)
  values (
    new.id,
    current_date,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name'
    ),
    new.raw_user_meta_data->>'company_name',
    v_email,
    case when v_is_exempt then 'scalepods.co' else v_domain end,
    v_tier_to_assign
  )
  on conflict (id) do update set
    name = coalesce(accounts.name, excluded.name),
    company_name = coalesce(accounts.company_name, excluded.company_name),
    email = coalesce(excluded.email, accounts.email),
    company_domain = coalesce(accounts.company_domain, excluded.company_domain);

  return new;
end $$;

notify pgrst, 'reload schema';
