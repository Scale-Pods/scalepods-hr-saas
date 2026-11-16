-- Migration 0059: Generic Multi-Tenant DOCX Offer Letter Template Engine
-- Adds support for raw .docx template storage, source template linkages,
-- finished-letter classification, and audit paths for filled .docx & generated PDFs.

-- 1. Extend offer_templates table
alter table public.offer_templates
  add column if not exists source_template_id uuid references public.offer_templates(id) on delete set null,
  add column if not exists is_finished_letter boolean not null default false,
  add column if not exists placeholders       text[] not null default '{}';

comment on column public.offer_templates.source_template_id is 'If created via Make Reusable wizard, points to the original uploaded letter.';
comment on column public.offer_templates.is_finished_letter is 'True if uploaded document had 0 detected placeholders (a finished letter).';
comment on column public.offer_templates.placeholders       is 'List of fillable {{placeholder}} names detected in the .docx file.';

-- 2. Extend offers table with audit trail paths
alter table public.offers
  add column if not exists filled_docx_path    text,
  add column if not exists generated_pdf_path  text,
  add column if not exists send_as_is          boolean not null default false;

comment on column public.offers.filled_docx_path   is 'Path inside offer-templates bucket for the filled .docx binary.';
comment on column public.offers.generated_pdf_path is 'Path inside offer-templates bucket for the final candidate PDF.';
comment on column public.offers.send_as_is         is 'True if offer was sent using an un-filled finished letter.';
