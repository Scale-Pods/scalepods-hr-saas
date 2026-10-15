-- 0038_cancel_at_period_end.sql
-- Add cancel_at_period_end to public.accounts to handle mid-cycle autopay cancellations
alter table public.accounts
  add column if not exists cancel_at_period_end boolean default false;

comment on column public.accounts.cancel_at_period_end is 'Indicates whether the recurring subscription is cancelled but remains active until next_billing_date';
