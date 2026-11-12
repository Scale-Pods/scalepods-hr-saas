-- Migration 0058: Company-Wide Offer Letter Templates
-- Adds a reusable offer_templates table (account-scoped) and links it to the offers table.
-- Template files are stored in Supabase Storage bucket "offer-templates".

-- 1. Create offer_templates table (idempotent)
create table if not exists public.offer_templates (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  name            text not null,
  file_name       text not null,
  storage_path    text not null,         -- path in "offer-templates" bucket
  raw_text        text not null,         -- extracted plain text (used for variable detection + preview)
  html_content    text,                  -- structured HTML extracted from DOCX (tables, headings, lists)
  variables       text[] not null default '{}',  -- detected {{VAR_NAME}} placeholders
  is_default      boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Ensure columns exist if an older offer_templates table was already present
alter table public.offer_templates
  add column if not exists file_name    text,
  add column if not exists storage_path text,
  add column if not exists raw_text     text,
  add column if not exists html_content text,
  add column if not exists variables    text[] not null default '{}',
  add column if not exists is_default   boolean not null default false,
  add column if not exists created_by   uuid references auth.users(id) on delete set null,
  add column if not exists created_at   timestamptz not null default now(),
  add column if not exists updated_at   timestamptz not null default now();

comment on table  public.offer_templates                    is 'Company-wide reusable offer letter templates, one per upload.';
comment on column public.offer_templates.storage_path       is 'Path inside the "offer-templates" Supabase Storage bucket.';
comment on column public.offer_templates.raw_text           is 'Extracted text with {{VAR_NAME}} placeholders intact, used for preview rendering and variable detection.';
comment on column public.offer_templates.variables          is 'Non-standard {{VAR_NAME}} placeholders found in the template text, e.g. DEPARTMENT, LOCATION.';
comment on column public.offer_templates.is_default         is 'At most one template per account should have is_default=true (enforced by application logic).';

-- 2. Enable RLS (account_id = auth.uid(), matching accounts.id)
alter table public.offer_templates enable row level security;

drop policy if exists "offer_templates_account_read" on public.offer_templates;
create policy "offer_templates_account_read" on public.offer_templates
  for select
  using (account_id = auth.uid());

drop policy if exists "offer_templates_admin_write" on public.offer_templates;
create policy "offer_templates_admin_write" on public.offer_templates
  for all
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- 2b. Ensure "offer-templates" Supabase Storage bucket exists (private)
insert into storage.buckets (id, name, public)
values ('offer-templates', 'offer-templates', false)
on conflict (id) do nothing;

drop policy if exists "offer_templates_storage_owner" on storage.objects;
create policy "offer_templates_storage_owner" on storage.objects
  for all
  using (bucket_id = 'offer-templates' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'offer-templates' and auth.uid()::text = (storage.foldername(name))[1]);

-- 3. Add offer_template_id + rendered_text + rendered_html to offers table
alter table public.offers
  add column if not exists offer_template_id uuid references public.offer_templates(id) on delete set null,
  add column if not exists rendered_text     text,
  add column if not exists rendered_html     text;

comment on column public.offers.offer_template_id is 'Which offer_templates row was used to generate this offer (nullable for legacy offers using branded template).';
comment on column public.offers.rendered_text     is 'Snapshot of the fully rendered offer letter text at time of sending (variables already substituted).';

-- 4. updated_at trigger for offer_templates
create or replace function public.set_offer_templates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists offer_templates_updated_at on public.offer_templates;
create trigger offer_templates_updated_at
  before update on public.offer_templates
  for each row execute function public.set_offer_templates_updated_at();
