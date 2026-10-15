-- 0037_razorpay_subscriptions.sql
-- Add Razorpay subscription management columns to public.accounts

alter table public.accounts
  add column if not exists razorpay_customer_id text,
  add column if not exists razorpay_subscription_id text,
  add column if not exists next_billing_date timestamptz,
  add column if not exists subscription_currency text default 'INR';

create index if not exists idx_accounts_razorpay_customer_id on public.accounts(razorpay_customer_id);
create index if not exists idx_accounts_razorpay_subscription_id on public.accounts(razorpay_subscription_id);

comment on column public.accounts.razorpay_customer_id is 'Razorpay customer ID (cust_...)';
comment on column public.accounts.razorpay_subscription_id is 'Active or latest Razorpay subscription ID (sub_...)';
comment on column public.accounts.next_billing_date is 'Next scheduled recurring charge date from Razorpay';
comment on column public.accounts.subscription_currency is 'Subscription billing currency (e.g. INR or USD)';
