-- Migration 0042: Add offer template columns to campaigns and make template_id optional in offers

alter table public.campaigns
  add column if not exists offer_template_text text,
  add column if not exists offer_template_file_name text;

alter table public.offers
  alter column template_id drop not null;

alter table public.offers
  add column if not exists generated_document_text text;

comment on column public.campaigns.offer_template_text is 'Raw unstructured offer letter & NDA template uploaded during campaign creation';
comment on column public.campaigns.offer_template_file_name is 'File name of the uploaded template document';
comment on column public.offers.generated_document_text is 'Final AI-generated populated offer letter text dispatched to the candidate';
