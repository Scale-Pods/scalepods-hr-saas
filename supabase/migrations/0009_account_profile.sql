-- ScalePods schema, migration 9
-- Ensure name and company_name exist on accounts table and update trigger to capture them

alter table public.accounts
  add column if not exists name text,
  add column if not exists company_name text;

-- Update handle_new_user trigger to populate initial name and company_name from auth metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (id, billing_anchor_date, name, company_name, email)
  values (
    new.id,
    current_date,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name'
    ),
    new.raw_user_meta_data->>'company_name',
    coalesce(new.email, '')
  )
  on conflict (id) do update set
    name = coalesce(accounts.name, excluded.name),
    company_name = coalesce(accounts.company_name, excluded.company_name),
    email = coalesce(excluded.email, accounts.email);
  return new;
end $$;
