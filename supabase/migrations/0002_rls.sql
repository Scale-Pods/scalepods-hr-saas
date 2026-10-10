-- ScalePods schema, migration 2 of 4
-- View for the campaign candidate table + RLS on every table + realtime.

-- =========================================================================
-- CAMPAIGN CANDIDATE VIEW (drives /campaigns/:id table)
-- =========================================================================
create or replace view public.campaign_candidates as
with ranked as (
  select
    c.id as candidate_id,
    c.account_id,
    rl.campaign_id,
    c.name,
    c.email,
    c.phone,
    c.resume_url,
    dl.stage,
    dl.score,
    latest.status,
    row_number() over (
      partition by c.id, rl.campaign_id
      order by coalesce(dl.decided_at, latest.created_at, now()) desc
    ) as rn
  from candidates c
  join round_instances rl on rl.candidate_id = c.id
  left join decision_ledger dl on dl.candidate_id = c.id
  left join lateral (
    select rr.status, rr.created_at
    from round_instances rr
    where rr.candidate_id = c.id
    order by rr.created_at desc
    limit 1
  ) latest on true
)
select candidate_id, account_id, campaign_id, name, email, phone, resume_url,
       stage as current_stage,
       score as latest_score,
       status as decision
from ranked
where rn = 1;

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

-- accounts: a user only ever sees their own row.
alter table accounts enable row level security;
create policy accounts_isolation on accounts
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Generic tenant isolation: account_id must match the signed-in user id.
-- Applied per-table so each table keeps one clear policy.
do $$
declare t text;
begin
  foreach t in array array[
    'candidates','campaigns','round_instances','decision_ledger',
    'credit_ledger','outreach_log','interview_sessions','audit_log','team_members',
    'calendar_events','assignment_submissions','candidate_access_tokens'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all using (account_id = auth.uid()) with check (account_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- calendar_connections' primary key IS the account id.
alter table calendar_connections enable row level security;
create policy calendar_connections_isolation on calendar_connections
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

-- campaign_rounds inherits tenant isolation from campaigns.
alter table campaign_rounds enable row level security;
create policy tenant_isolation on campaign_rounds
  for all using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_rounds.campaign_id
        and c.account_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from campaigns c
      where c.id = campaign_rounds.campaign_id
        and c.account_id = auth.uid()
    )
  );

-- interview questions, answers, scorecards, and proctoring events inherit tenant isolation from interview_sessions.
alter table interview_questions enable row level security;
create policy tenant_isolation on interview_questions
  for select using (
    exists (
      select 1 from interview_sessions s
      where s.id = interview_questions.session_id
        and s.account_id = auth.uid()
    )
  );

alter table interview_answers enable row level security;
create policy tenant_isolation on interview_answers
  for all using (
    exists (
      select 1 from interview_sessions s
      where s.id = interview_answers.session_id
        and s.account_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from interview_sessions s
      where s.id = interview_answers.session_id
        and s.account_id = auth.uid()
    )
  );

alter table scorecards enable row level security;
create policy tenant_isolation on scorecards
  for all using (
    exists (
      select 1 from interview_sessions s
      where s.id = scorecards.session_id
        and s.account_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from interview_sessions s
      where s.id = scorecards.session_id
        and s.account_id = auth.uid()
    )
  );

alter table proctoring_events enable row level security;
create policy tenant_isolation on proctoring_events
  for all using (
    exists (
      select 1 from interview_sessions s
      where s.id = proctoring_events.session_id
        and s.account_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from interview_sessions s
      where s.id = proctoring_events.session_id
        and s.account_id = auth.uid()
    )
  );

-- Anonymous access to candidate resources is NOT granted via plain RLS.
-- Candidate-facing reads/writes go through the token-gated SECURITY DEFINER
-- RPCs in migration 0003 - this keeps the anon surface to literally zero.

-- =========================================================================
-- REALTIME (opt-in: use for live intake progress if preferred over polling)
-- =========================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.decision_ledger, public.round_instances';
  end if;
end $$;