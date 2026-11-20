-- 0060_company_domain_restrictions.sql
-- Enforce company domain restrictions and anti-abuse policies:
-- 1. scalepods.co (and *.scalepods.co) is permanently exempt: unlimited accounts,
--    never blocked by free-tier exhaustion or single-account limits.
-- 2. Consumer/public email providers (Gmail, Yahoo, Outlook, etc.) are prohibited for recruiter signups.
-- 3. Corporate domains: Exactly 1 recruiter account permitted per company on Free tier.
-- 4. Free tier exhaustion: If a company domain exhausts its free tier, all logins and
--    further registrations for that domain are blocked until upgraded to a paid plan.

-- =========================================================================
-- 1. COMPANY DOMAINS REGISTRY TABLE
-- =========================================================================
create table if not exists public.company_domains (
  domain text primary key,
  primary_account_id uuid references public.accounts(id) on delete set null,
  tier text not null default 'free' check (tier in ('free','basic','growth','enterprise')),
  is_free_tier_exhausted boolean not null default false,
  exhausted_at timestamptz,
  is_exempt boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed scalepods.co as an exempt domain
insert into public.company_domains (domain, primary_account_id, tier, is_free_tier_exhausted, is_exempt)
values ('scalepods.co', null, 'enterprise', false, true)
on conflict (domain) do update set is_exempt = true;

-- Add company_domain reference to accounts
alter table public.accounts
  add column if not exists company_domain text references public.company_domains(domain);

create index if not exists idx_accounts_company_domain on public.accounts(company_domain);
create index if not exists idx_company_domains_primary_account on public.company_domains(primary_account_id);

-- Enable RLS
alter table public.company_domains enable row level security;

-- Allow read access for authenticated and anonymous users to check domain state
drop policy if exists "company_domains_select" on public.company_domains;
create policy "company_domains_select"
  on public.company_domains for select
  using (true);

grant select on public.company_domains to authenticated, anon;

-- =========================================================================
-- 2. DOMAIN RECOGNITION HELPERS
-- =========================================================================
create or replace function public.is_domain_exempt(p_domain text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_norm text;
begin
  if p_domain is null then
    return false;
  end if;
  v_norm := lower(trim(p_domain));
  if v_norm = 'scalepods.co' or v_norm like '%.scalepods.co' then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.is_blocked_consumer_domain(p_domain text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_norm text;
begin
  if p_domain is null then
    return false;
  end if;
  v_norm := lower(trim(p_domain));
  if v_norm in (
    'gmail.com', 'googlemail.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'passport.com',
    'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.ca', 'ymail.com', 'rocketmail.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'zoho.com', 'zohomail.com', 'proton.me', 'protonmail.com',
    'mail.com', 'gmx.com', 'gmx.net', 'yandex.com', 'yandex.ru',
    'tutanota.com', 'tuta.io', 'fastmail.com', 'rediffmail.com',
    'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
    'trashmail.com', 'throwawaymail.com', 'sharklasers.com', 'dispostable.com'
  ) then
    return true;
  end if;
  return false;
end;
$$;

-- Pre-check function exposed for signup forms and API route
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
begin
  if p_email is null or position('@' in p_email) <= 1 then
    return jsonb_build_object(
      'allowed', false,
      'code', 'INVALID_EMAIL',
      'reason', 'Please provide a valid email address.'
    );
  end if;

  v_domain := lower(split_part(trim(p_email), '@', 2));

  -- 1. scalepods.co exemption
  if public.is_domain_exempt(v_domain) then
    return jsonb_build_object(
      'allowed', true,
      'domain', v_domain,
      'is_exempt', true,
      'is_exhausted', false,
      'tier', 'enterprise'
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

    -- If on free tier and an account already exists
    if v_domain_row.tier = 'free' and (p_account_id is null or v_domain_row.primary_account_id <> p_account_id) then
      return jsonb_build_object(
        'allowed', false,
        'domain', v_domain,
        'is_exempt', false,
        'is_exhausted', false,
        'tier', 'free',
        'code', 'DOMAIN_EXISTS_FREE',
        'reason', 'An account for ' || v_domain || ' already exists. On the Free tier, only one recruiter account is allowed per company. Please sign in with the registered email or ask your admin to invite you.'
      );
    end if;

    -- Domain is on a paid plan
    return jsonb_build_object(
      'allowed', true,
      'domain', v_domain,
      'is_exempt', false,
      'is_exhausted', false,
      'tier', v_domain_row.tier
    );
  end if;

  -- Brand new company domain on free tier
  return jsonb_build_object(
    'allowed', true,
    'domain', v_domain,
    'is_exempt', false,
    'is_exhausted', false,
    'tier', 'free'
  );
end;
$$;

grant execute on function public.check_domain_admissibility(text, uuid) to authenticated, anon, service_role;

-- =========================================================================
-- 3. UPDATE HANDLE_NEW_USER TRIGGER (SUPABASE AUTH)
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

        -- Reject if free tier and another account exists
        if v_domain_row.tier = 'free' and v_domain_row.primary_account_id is not null and v_domain_row.primary_account_id <> new.id then
          raise exception 'An account for domain % already exists. Only one recruiter account per company is allowed on the Free tier.', v_domain using errcode = '22023';
        end if;
      else
        -- Register new company domain
        insert into public.company_domains (domain, primary_account_id, tier, is_free_tier_exhausted, is_exempt)
        values (v_domain, new.id, 'free', false, false)
        on conflict (domain) do nothing;
      end if;
    else
      -- scalepods.co exemption: ensure domain row exists
      insert into public.company_domains (domain, primary_account_id, tier, is_free_tier_exhausted, is_exempt)
      values ('scalepods.co', null, 'enterprise', false, true)
      on conflict (domain) do update set is_exempt = true;
    end if;
  end if;

  -- Create accounts row
  insert into public.accounts (id, billing_anchor_date, name, company_name, email, company_domain)
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
    case when v_is_exempt then 'scalepods.co' else v_domain end
  )
  on conflict (id) do update set
    name = coalesce(accounts.name, excluded.name),
    company_name = coalesce(accounts.company_name, excluded.company_name),
    email = coalesce(excluded.email, accounts.email),
    company_domain = coalesce(accounts.company_domain, excluded.company_domain);

  return new;
end $$;

-- =========================================================================
-- 4. SYNC TIER CHANGES ON PAYMENT UPGRADE
-- =========================================================================
create or replace function public.sync_domain_tier_on_account_update()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.tier is distinct from old.tier or new.billing_status is distinct from old.billing_status then
    update public.company_domains
    set tier = new.tier,
        -- When upgraded from free to paid, reset exhausted flag
        is_free_tier_exhausted = case when new.tier <> 'free' then false else is_free_tier_exhausted end,
        updated_at = now()
    where (primary_account_id = new.id or domain = new.company_domain)
      and is_exempt = false;
  end if;
  return new;
end;
$$;

drop trigger if exists on_account_tier_changed on public.accounts;
create trigger on_account_tier_changed
  after update of tier, billing_status on public.accounts
  for each row execute function public.sync_domain_tier_on_account_update();

-- =========================================================================
-- 5. UPDATE CHECK_TIER_LIMIT TO TRIP DOMAIN EXHAUSTION
-- =========================================================================
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
  v_domain text;
  v_is_exempt boolean := false;
  v_is_domain_exhausted boolean := false;
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
         tl.overage_behavior,
         a.company_domain
    into v_tier, v_limit, v_overage_behavior, v_domain
  from public.accounts a
  join public.tier_limits tl on tl.id = a.tier
  where a.id = p_account_id;

  if not found then
    raise exception 'account_or_tier_limit_not_found' using errcode = 'P0002';
  end if;

  -- Check domain exemption
  if v_domain is not null then
    select is_exempt, is_free_tier_exhausted into v_is_exempt, v_is_domain_exhausted
    from public.company_domains
    where domain = v_domain;
  end if;

  -- If free tier limit is reached or exceeded, trip the domain exhaustion flag
  if v_tier = 'free' and not coalesce(v_is_exempt, false) and v_limit is not null and p_current_count >= v_limit then
    update public.company_domains
    set is_free_tier_exhausted = true,
        exhausted_at = coalesce(exhausted_at, now()),
        updated_at = now()
    where domain = v_domain
      and is_exempt = false;
    v_is_domain_exhausted := true;
  end if;

  return jsonb_build_object(
    'allowed', v_limit is null or (p_current_count < v_limit and not v_is_domain_exhausted),
    'tier', v_tier,
    'limit_value', v_limit,
    'current_count', p_current_count,
    'overage_behavior', v_overage_behavior,
    'domain', v_domain,
    'is_free_tier_exhausted', v_is_domain_exhausted
  );
end;
$$;

revoke all on function public.check_tier_limit(uuid, text, integer) from public, anon;
grant execute on function public.check_tier_limit(uuid, text, integer) to authenticated, service_role;

-- Helper to mark a company domain exhausted directly
create or replace function public.mark_company_domain_exhausted(
  p_account_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_domain text;
begin
  select company_domain into v_domain
  from public.accounts
  where id = p_account_id;

  if v_domain is null then
    return jsonb_build_object('success', false, 'reason', 'domain_not_found');
  end if;

  if public.is_domain_exempt(v_domain) then
    return jsonb_build_object('success', true, 'is_exempt', true);
  end if;

  update public.company_domains
  set is_free_tier_exhausted = true,
      exhausted_at = now(),
      updated_at = now()
  where domain = v_domain
    and is_exempt = false;

  return jsonb_build_object('success', true, 'domain', v_domain, 'exhausted', true);
end;
$$;

grant execute on function public.mark_company_domain_exhausted(uuid, text) to authenticated, service_role;

-- Backfill company_domains and accounts.company_domain for existing records
do $$
declare
  r record;
  v_dom text;
begin
  for r in select id, email, tier from public.accounts where email is not null and email like '%@%' loop
    v_dom := lower(split_part(trim(r.email), '@', 2));
    if v_dom = 'scalepods.co' or v_dom like '%.scalepods.co' then
      update public.accounts set company_domain = 'scalepods.co' where id = r.id and company_domain is null;
    elsif not public.is_blocked_consumer_domain(v_dom) then
      insert into public.company_domains (domain, primary_account_id, tier, is_free_tier_exhausted, is_exempt)
      values (v_dom, r.id, r.tier, false, false)
      on conflict (domain) do nothing;

      update public.accounts set company_domain = v_dom where id = r.id and company_domain is null;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

