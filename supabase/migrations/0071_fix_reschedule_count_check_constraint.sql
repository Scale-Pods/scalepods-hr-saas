-- 0071_fix_reschedule_count_check_constraint.sql
-- Migration 0025 added `check (reschedule_count between 0 and 1)`, which conflicts with
-- migration 0050/0068 allowing up to 3 reschedules and blocks 2nd+ reschedules.

alter table public.round_instances
  drop constraint if exists round_instances_reschedule_count_check;

alter table public.round_instances
  add constraint round_instances_reschedule_count_check
  check (reschedule_count >= 0);

