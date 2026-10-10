-- Keep the first stage explicit: resume evaluation is recorded per application,
-- and a recruiter cannot create round 1 until that evaluation exists.
create unique index if not exists decision_ledger_application_resume_unique
  on public.decision_ledger (application_id, score_type)
  where score_type = 'resume' and application_id is not null;

create or replace function public.record_resume_screening(
  p_application_id uuid,
  p_score integer,
  p_rationale text,
  p_raw_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.applications%rowtype;
  v_ledger_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_score is null or p_score < 1 or p_score > 100 then
    raise exception 'resume_score_out_of_range' using errcode = '22023';
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id and account_id = auth.uid()
  for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  insert into public.decision_ledger (
    account_id, candidate_id, application_id, stage, score_type,
    score, rationale, raw_text, source
  ) values (
    v_application.account_id, v_application.candidate_id, v_application.id,
    'resume_screening', 'resume', p_score, nullif(btrim(p_rationale), ''),
    left(p_raw_text, 40000), 'workflow'
  )
  on conflict (application_id, score_type)
    where score_type = 'resume' and application_id is not null
  do update set score = excluded.score,
                rationale = excluded.rationale,
                raw_text = excluded.raw_text,
                decided_at = now(),
                created_at = now()
  returning id into v_ledger_id;

  return jsonb_build_object(
    'application_id', v_application.id,
    'score', p_score,
    'score_type', 'resume',
    'evaluation_id', v_ledger_id
  );
end;
$$;

revoke all on function public.record_resume_screening(uuid, integer, text, text)
  from public, anon;
grant execute on function public.record_resume_screening(uuid, integer, text, text)
  to authenticated;

create or replace function public.create_screened_application_intake(
  p_campaign_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_resume_path text,
  p_whatsapp_opt_in boolean,
  p_score integer,
  p_rationale text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_application jsonb;
  v_screening jsonb;
begin
  v_application := public.create_application_intake(
    p_campaign_id, p_candidate_name, p_candidate_email, p_candidate_phone,
    p_resume_path, p_whatsapp_opt_in
  );
  v_screening := public.record_resume_screening(
    (v_application->>'id')::uuid, p_score, p_rationale, null
  );
  return jsonb_build_object('application', v_application, 'screening', v_screening);
end;
$$;

revoke all on function public.create_screened_application_intake(uuid, text, text, text, text, boolean, integer, text)
  from public, anon;
grant execute on function public.create_screened_application_intake(uuid, text, text, text, text, boolean, integer, text)
  to authenticated;

create or replace function public.require_resume_score_before_round()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.current_stage = 'needs_review'
     and new.current_stage = 'round'
     and not exists (
       select 1 from public.decision_ledger dl
       where dl.application_id = new.id
         and dl.score_type = 'resume'
         and dl.score between 1 and 100
     ) then
    raise exception 'resume_screening_required'
      using detail = 'Complete resume screening before advancing this application.';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_require_resume_score on public.applications;
create trigger applications_require_resume_score
before update of current_stage on public.applications
for each row execute function public.require_resume_score_before_round();

notify pgrst, 'reload schema';
