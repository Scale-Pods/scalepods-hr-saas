-- Migration 0067: Account Channel Integrations (Email OAuth2 & Meta WhatsApp Embedded Signup)
-- Provides multi-tenant "Bring Your Own Identity" (BYOI) for candidate communications,
-- with automatic fallback to platform (info@scalepods.tech) and ScalePods WhatsApp (+91 77385 58481).

create table if not exists public.account_channel_integrations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'voice')),
  provider text not null check (provider in ('google_oauth', 'microsoft_oauth', 'smtp', 'meta_embedded', 'meta_manual', 'dialnexa_verified')),
  status text not null default 'active' check (status in ('active', 'pending', 'expired', 'revoked', 'disconnected')),
  
  -- Email specific fields
  sender_email text,
  sender_name text,
  
  -- WhatsApp / Voice specific fields
  phone_number text,
  phone_number_id text,
  waba_id text,
  
  -- Encrypted / OAuth credential storage
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  
  -- Generic provider metadata
  metadata jsonb not null default '{}'::jsonb,
  
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint account_channel_provider_unique unique (account_id, channel, provider)
);

create index if not exists aci_account_channel_status_idx 
  on public.account_channel_integrations (account_id, channel, status);

alter table public.account_channel_integrations enable row level security;

-- Tenant isolation: recruiters only access their own integrations
create policy account_channel_integrations_isolation on public.account_channel_integrations
  for all 
  using (account_id = auth.uid()) 
  with check (account_id = auth.uid());

-- Permissions for authenticated recruiters and service role
grant select, insert, update, delete on table public.account_channel_integrations to authenticated;
grant all on table public.account_channel_integrations to service_role;

-- Helper RPC function to query active sending channel or return fallback info
create or replace function public.get_account_sending_channel(p_account_id uuid, p_channel text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_account_email text;
  v_company_name text;
begin
  select auth_u.email, acc.company_name
  into v_account_email, v_company_name
  from public.accounts acc
  left join auth.users auth_u on auth_u.id = acc.id
  where acc.id = p_account_id;

  select *
  into v_rec
  from public.account_channel_integrations
  where account_id = p_account_id
    and channel = p_channel
    and status = 'active'
  order by updated_at desc
  limit 1;

  if p_channel = 'email' then
    if v_rec.id is not null and v_rec.sender_email is not null then
      return jsonb_build_object(
        'channel', 'email',
        'is_fallback', false,
        'provider', v_rec.provider,
        'sender_email', v_rec.sender_email,
        'sender_name', coalesce(v_rec.sender_name, v_company_name, 'ScalePods'),
        'has_token', v_rec.access_token is not null,
        'reply_to', v_rec.sender_email
      );
    else
      return jsonb_build_object(
        'channel', 'email',
        'is_fallback', true,
        'provider', 'scalepods_fallback',
        'sender_email', 'info@scalepods.tech',
        'sender_name', coalesce(v_company_name, 'ScalePods') || ' via ScalePods',
        'reply_to', coalesce(v_account_email, 'info@scalepods.tech')
      );
    end if;
  elsif p_channel = 'whatsapp' then
    if v_rec.id is not null and v_rec.phone_number_id is not null then
      return jsonb_build_object(
        'channel', 'whatsapp',
        'is_fallback', false,
        'provider', v_rec.provider,
        'phone_number', v_rec.phone_number,
        'phone_number_id', v_rec.phone_number_id,
        'waba_id', v_rec.waba_id,
        'has_token', v_rec.access_token is not null
      );
    else
      return jsonb_build_object(
        'channel', 'whatsapp',
        'is_fallback', true,
        'provider', 'platform_fallback',
        'phone_number', '+91 77385 58481',
        'phone_number_id', '1080270115170890'
      );
    end if;
  end if;

  return jsonb_build_object('error', 'unknown_channel');
end;
$$;

grant execute on function public.get_account_sending_channel(uuid, text) to authenticated, anon, service_role;

