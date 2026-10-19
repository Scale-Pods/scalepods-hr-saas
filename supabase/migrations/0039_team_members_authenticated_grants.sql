-- Grant full permissions on team_members to authenticated recruiters.
-- Row-level security (tenant_isolation) continues to restrict every
-- recruiter strictly to rows matching auth.uid().

grant insert, update, delete on table public.team_members to authenticated;
