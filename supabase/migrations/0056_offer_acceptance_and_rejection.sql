-- Migration 0056: Support offer acceptance and rejection states
-- Allows candidate offer decisions (accepted / rejected) from email workflows & candidate responses

-- 1. Expand applications.status check constraint
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('active','on_hold','incomplete','rejected','offer_ready','offer_sent','offer_accepted','offer_rejected','offer_declined'));

-- 2. Expand offers.status check constraint
alter table public.offers drop constraint if exists offers_status_check;
alter table public.offers add constraint offers_status_check
  check (status in ('awaiting_company_signature','sent_to_candidate','void','accepted','rejected','declined'));

-- 3. Add offer decision timestamps and response details to offers table
alter table public.offers
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists signed_document_url text,
  add column if not exists candidate_response_notes text;

-- 4. Add comments
comment on column public.offers.accepted_at is 'Timestamp when candidate accepted the offer via email or signing';
comment on column public.offers.rejected_at is 'Timestamp when candidate declined or rejected the offer';
comment on column public.offers.signed_document_url is 'URL to signed offer letter or NDA attachment';
comment on column public.offers.candidate_response_notes is 'AI-extracted summary notes from candidate reply email';

