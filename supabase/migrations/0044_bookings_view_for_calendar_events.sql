-- Migration 0044: Expose public.bookings view with no_show and status support for n8n

-- 1. Add status column to calendar_events if not exists
alter table public.calendar_events
  add column if not exists status text not null default 'booked';

-- 2. Drop and recreate view with exact columns expected by n8n (no_show, status, slot_end)
drop view if exists public.bookings;

create or replace view public.bookings as
select
  ce.id,
  ce.account_id,
  ce.round_instance_id,
  ce.interviewer_email,
  ce.event_id,
  ce.slot_start,
  ce.slot_end,
  ce.meet_link,
  ri.candidate_id,
  ri.campaign_id,
  ri.round_number,
  ri.round_type,
  ri.status as round_status,
  case
    when ri.status = 'no_show' then 'no_show'
    when ri.status in ('completed', 'passed', 'failed') then ri.status
    else 'booked'
  end as status,
  case
    when ri.status = 'no_show' then true
    else false
  end as no_show
from public.calendar_events ce
left join public.round_instances ri on ri.id = ce.round_instance_id;

alter view public.bookings set (security_invoker = true);

grant select, insert, update on public.bookings to anon, authenticated, service_role;
grant select, update on public.calendar_events to anon, authenticated, service_role;

-- 3. Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
