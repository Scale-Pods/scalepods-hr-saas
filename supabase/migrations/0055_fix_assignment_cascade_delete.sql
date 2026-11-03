-- Migration 0055: Fix assignment cascade deletion and assignment context RPC
--
-- 1. Allow DELETE on public.assignments (cascading deletes when an application, round, or campaign is removed).
-- 2. Update get_assignment_context RPC to return campaign.number_of_rounds and round.brief_text.

create or replace function public.guard_assignment_immutable_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Allow DELETE (e.g. cascading deletes when an application, round, or campaign is removed)
  if tg_op = 'DELETE' then
    return old;
  end if;

  if row(old.application_id, old.round_instance_id, old.brief_text, old.deadline_at)
     is distinct from row(new.application_id, new.round_instance_id, new.brief_text, new.deadline_at) then
    raise exception 'assignment_immutable' using detail = 'Assignment instructions and deadlines cannot be changed or reopened.';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_immutable_fields on public.assignments;
create trigger assignments_immutable_fields
before update or delete on public.assignments
for each row execute function public.guard_assignment_immutable_fields();

-- Update get_assignment_context RPC
create or replace function public.get_assignment_context(
  p_round_instance_id uuid,
  p_token text,
  p_tz_offset_minutes int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ri round_instances%rowtype;
declare v_camp campaigns%rowtype;
declare v_cr campaign_rounds%rowtype;
declare v_assign assignments%rowtype;
declare v_sub jsonb;
begin
  if not public.candidate_token_valid(p_token, 'assignment', p_round_instance_id) then
    raise exception 'invalid_link' using detail = 'This assignment link is invalid or has expired.';
  end if;
  select * into v_ri from round_instances where id = p_round_instance_id;
  if not found then raise exception 'invalid_link' using detail = 'Round not found.'; end if;
  select * into v_camp from campaigns where id = v_ri.campaign_id;
  select * into v_cr from campaign_rounds
    where campaign_id = v_ri.campaign_id and round_number = v_ri.round_number;
  select * into v_assign from assignments
    where round_instance_id = v_ri.id;

  select jsonb_build_object(
    'id', s.id, 'text_response', s.text_response, 'file_paths', s.file_paths, 'submitted_at', s.submitted_at
  ) into v_sub
  from assignment_submissions s
  where s.round_instance_id = v_ri.id
  order by s.submitted_at desc
  limit 1;

  return jsonb_build_object(
    'round_instance', jsonb_build_object(
      'id', v_ri.id, 'round_type', v_ri.round_type,
      'status', v_ri.status, 'deadline_at', coalesce(v_assign.deadline_at, v_ri.deadline_at)
    ),
    'campaign', jsonb_build_object(
      'id', v_camp.id, 'name', v_camp.name, 'jd_text', v_camp.jd_text,
      'number_of_rounds', coalesce(v_camp.number_of_rounds, 1)
    ),
    'round', jsonb_build_object(
      'round_number', v_cr.round_number, 'round_type', v_cr.round_type,
      'cutoff_score', v_cr.cutoff_score,
      'brief_text', coalesce(v_assign.brief_text, v_cr.brief_text)
    ),
    'submission', v_sub
  );
end $$;

notify pgrst, 'reload schema';
