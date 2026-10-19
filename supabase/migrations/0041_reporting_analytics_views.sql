-- ============================================================
-- Migration 0041: Reporting & Analytics Dashboard Views
-- Provides v_funnel_conversion, v_time_to_hire, and v_source_effectiveness
-- ============================================================

-- 1. Funnel Conversion View
create or replace view public.v_funnel_conversion as
select
  c.account_id,
  c.id as campaign_id,
  c.name as campaign_name,
  count(distinct a.id)::int as entered_stage_1,
  count(distinct case when r.status = 'completed' then a.id end)::int as passed_any_round,
  count(distinct case when r.round_type = 'human_interview' then a.id end)::int as reached_human_interview,
  count(distinct o.id)::int as offers_made,
  count(distinct case when o.status in ('sent_to_candidate', 'signed') then o.id end)::int as offers_signed,
  case 
    when count(distinct a.id) = 0 then 0
    else round((count(distinct case when o.status in ('sent_to_candidate', 'signed') then o.id end)::numeric / count(distinct a.id)::numeric) * 100, 1)
  end as intake_to_signed_pct
from public.campaigns c
left join public.applications a on a.campaign_id = c.id
left join public.round_instances r on r.application_id = a.id
left join public.offers o on o.application_id = a.id
group by c.account_id, c.id, c.name;

-- 2. Time to Hire View
create or replace view public.v_time_to_hire as
select
  c.account_id,
  c.id as campaign_id,
  'All Stages'::text as stage,
  null::numeric as median_days,
  coalesce(round(avg(extract(epoch from (coalesce(o.sent_to_candidate_at, o.created_at) - a.created_at)) / 86400.0)::numeric, 1), 0) as average_days,
  count(distinct case when o.status in ('sent_to_candidate', 'signed') then o.id end)::int as hires,
  0::int as outlier_entries,
  coalesce(round(avg(extract(epoch from (coalesce(o.sent_to_candidate_at, o.created_at) - a.created_at)) / 86400.0)::numeric, 1), 0) as avg_days_intake_to_offer_signed,
  coalesce(round(avg(extract(epoch from (coalesce(r.scheduled_at, r.created_at) - r.created_at)) / 3600.0)::numeric, 1), 0) as avg_hours_per_round,
  count(distinct case when r.status in ('no_show', 'missed') then r.id end)::int as no_show_count,
  0::int as platform_fault_count
from public.campaigns c
left join public.applications a on a.campaign_id = c.id
left join public.round_instances r on r.application_id = a.id
left join public.offers o on o.application_id = a.id
group by c.account_id, c.id;

-- 3. Source Effectiveness View
create or replace view public.v_source_effectiveness as
select
  a.account_id,
  'Direct Application'::text as source,
  count(distinct a.id)::int as conversations,
  count(distinct o.id)::int as offers,
  case 
    when count(distinct a.id) = 0 then 0
    else round((count(distinct o.id)::numeric / count(distinct a.id)::numeric) * 100, 1)
  end as rate,
  'email'::text as channel,
  'intake'::text as stage,
  count(distinct w.id)::int as messages_sent,
  count(distinct case when w.status = 'sent' then w.id end)::int as delivered,
  count(distinct case when w.status = 'failed' then w.id end)::int as fell_back,
  case 
    when count(distinct w.id) = 0 then 100.0
    else round((count(distinct case when w.status = 'sent' then w.id end)::numeric / count(distinct w.id)::numeric) * 100, 1)
  end as delivery_rate_pct
from public.applications a
left join public.offers o on o.application_id = a.id
left join public.workflow_outbox w on w.account_id = a.account_id
group by a.account_id;

-- Grants
grant select on public.v_funnel_conversion to authenticated, service_role, anon;
grant select on public.v_time_to_hire to authenticated, service_role, anon;
grant select on public.v_source_effectiveness to authenticated, service_role, anon;
