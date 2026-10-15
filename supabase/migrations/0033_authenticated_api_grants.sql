-- Grant the Supabase Data API roles the SQL privileges required to reach
-- client-visible tables. These grants do not bypass RLS; existing policies
-- continue to enforce account isolation.

grant usage on schema public to authenticated, anon;

-- Recruiter workspace reads. The dashboard and recruiter pages query these
-- tables directly through PostgREST using the authenticated user's JWT.
grant select on table
  public.accounts,
  public.candidates,
  public.campaigns,
  public.campaign_rounds,
  public.round_instances,
  public.decision_ledger,
  public.credit_ledger,
  public.outreach_log,
  public.interview_sessions,
  public.interview_questions,
  public.interview_answers,
  public.scorecards,
  public.proctoring_events,
  public.audit_log,
  public.team_members,
  public.calendar_connections,
  public.calendar_events,
  public.assignment_submissions,
  public.applications,
  public.application_evaluations,
  public.assignments,
  public.company_signwell_templates,
  public.offers,
  public.offer_capacity_events,
  public.interviewer_calendar_connections,
  public.interviewer_feedback
to authenticated;

-- Existing public-read RLS policy on plan metadata still applies to both roles.
grant select on table public.tier_limits to anon, authenticated;

-- The view is exposed to authenticated recruiters, so enforce the underlying
-- tables' RLS policies as the caller instead of the view owner's privileges.
alter view public.campaign_candidates set (security_invoker = true);
grant select on table public.campaign_candidates to authenticated;

-- Direct writes used by recruiter profile/preferences and campaign setup.
-- Row-level policies remain the authorization boundary for each update.
grant update on table public.accounts, public.campaigns to authenticated;

-- Recruiter override action writes an audit-backed decision directly.
grant insert on table public.decision_ledger, public.audit_log to authenticated;

