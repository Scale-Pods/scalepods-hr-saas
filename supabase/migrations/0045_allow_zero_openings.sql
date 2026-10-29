-- Migration 0045: Allow campaign number_of_openings to be 0 or greater (supporting 0 to infinite positions for evergreen/continuous hiring)
alter table public.campaigns drop constraint if exists campaigns_openings_positive;
alter table public.campaigns add constraint campaigns_openings_positive check (number_of_openings >= 0);
