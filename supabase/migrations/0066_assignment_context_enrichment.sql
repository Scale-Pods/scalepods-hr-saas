-- Migration 0066: Enrich get_assignment_context with account company details (company_name, company_logo_url, timezone)

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
declare v_account accounts%rowtype;
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
  select * into v_account from accounts
    where id = v_camp.account_id;

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
    'account', case when v_account.id is not null then jsonb_build_object(
      'id', v_account.id,
      'company_name', v_account.company_name,
      'company_logo_url', v_account.company_logo_url,
      'name', v_account.name,
      'timezone', coalesce(v_account.timezone, 'Asia/Kolkata')
    ) else null end,
    'submission', v_sub
  );
end $$;

revoke all on function public.get_assignment_context(uuid,text,int) from public;
grant execute on function public.get_assignment_context(uuid,text,int) to anon,authenticated,service_role;

notify pgrst, 'reload schema';

