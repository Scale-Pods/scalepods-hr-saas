-- Older intake workflows wrote resume scores by candidate_id only. When a
-- candidate has exactly one application in the workspace, that score can be
-- safely attached to the application. Ambiguous multi-job histories are left
-- for explicit re-screening rather than assigning a score to the wrong job.
with single_application_candidates as (
  select
    a.account_id,
    a.candidate_id,
    min(a.id::text)::uuid as application_id
  from public.applications a
  group by a.account_id, a.candidate_id
  having count(*) = 1
), latest_legacy_resume_score as (
  select distinct on (dl.account_id, dl.candidate_id)
    dl.id,
    dl.account_id,
    dl.candidate_id
  from public.decision_ledger dl
  where dl.application_id is null
    and dl.score_type is null
    and dl.score between 1 and 100
    and lower(dl.stage) like '%resume%'
  order by dl.account_id, dl.candidate_id, dl.created_at desc, dl.decided_at desc
)
update public.decision_ledger dl
set application_id = s.application_id,
    score_type = 'resume'
from single_application_candidates s,
     latest_legacy_resume_score old
where dl.id = old.id
  and dl.account_id = s.account_id
  and dl.candidate_id = s.candidate_id
  and not exists (
    select 1
    from public.decision_ledger current_score
    where current_score.application_id = s.application_id
      and current_score.score_type = 'resume'
      and current_score.score between 1 and 100
  );
