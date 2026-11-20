-- Migration 0063: Sync application resume_path to candidate and enrich get_booking_context

-- 1. Backfill candidates.resume_url from applications.resume_path
update public.candidates c
set resume_url = a.resume_path
from public.applications a
where a.candidate_id = c.id
  and a.resume_path is not null
  and (c.resume_url is null or c.resume_url = '');

-- 2. Trigger to keep candidates.resume_url synced with applications.resume_path
create or replace function public.sync_candidate_resume_from_application()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.resume_path is not null and btrim(new.resume_path) <> '' then
    update public.candidates
    set resume_url = btrim(new.resume_path)
    where id = new.candidate_id
      and (resume_url is null or resume_url = '' or resume_url <> btrim(new.resume_path));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_candidate_resume on public.applications;
create trigger trg_sync_candidate_resume
  after insert or update of resume_path on public.applications
  for each row execute function public.sync_candidate_resume_from_application();

-- 3. Update get_booking_context to pull resume from applications table with candidates fallback
create or replace function public.get_booking_context(
  p_round_instance_id uuid,p_token text,p_tz_offset_minutes int default 0
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare 
  v_ri public.round_instances%rowtype; 
  v_cand public.candidates%rowtype; 
  v_camp public.campaigns%rowtype;
  v_cr public.campaign_rounds%rowtype; 
  v_account public.accounts%rowtype; 
  v_booked jsonb;
  v_resume_url text;
begin
  if not public.candidate_token_valid(p_token,'booking',p_round_instance_id) then
    raise exception 'invalid_link' using detail='This booking link is invalid or has expired.';
  end if;
  select * into v_ri from public.round_instances where id=p_round_instance_id;
  if not found or v_ri.round_type<>'human_interview' then raise exception 'round_not_bookable'; end if;
  select * into v_camp from public.campaigns where id=v_ri.campaign_id and account_id=v_ri.account_id;
  if not found or v_camp.status<>'open' then raise exception 'job_closed'; end if;
  select * into v_cand from public.candidates where id=v_ri.candidate_id;
  select * into v_cr from public.campaign_rounds where campaign_id=v_ri.campaign_id and round_number=v_ri.round_number;
  select * into v_account from public.accounts where id=v_ri.account_id;

  -- Resolve resume from applications table first, then candidate
  select a.resume_path into v_resume_url
  from public.applications a
  where (a.id = v_ri.application_id)
     or (a.campaign_id = v_ri.campaign_id and a.candidate_id = v_ri.candidate_id)
  order by a.created_at desc
  limit 1;

  if v_resume_url is null or v_resume_url = '' then
    v_resume_url := v_cand.resume_url;
  end if;

  select jsonb_build_object('event_id',ce.event_id,'slot_start',ce.slot_start,'slot_end',ce.slot_end,
    'meet_link',ce.meet_link,'interviewer_email',ce.interviewer_email) into v_booked
    from public.calendar_events ce where ce.round_instance_id=v_ri.id;
  return jsonb_build_object(
    'round_instance',jsonb_build_object('id',v_ri.id,'round_type',v_ri.round_type,'status',v_ri.status,
      'scheduled_at',v_ri.scheduled_at,'meet_link',coalesce(v_ri.meet_link, v_ri.conferencing_link, v_booked->>'meet_link'),'event_id',v_ri.event_id,'deadline_at',v_ri.deadline_at,'reschedule_count',v_ri.reschedule_count),
    'candidate',jsonb_build_object('id',v_cand.id,'name',v_cand.name,'email',v_cand.email,'phone',v_cand.phone,'resume_url',v_resume_url),
    'campaign',jsonb_build_object('id',v_camp.id,'name',v_camp.name,'number_of_rounds',v_camp.number_of_rounds,'opening_date',v_camp.opening_date,'closing_date',v_camp.closing_date),
    'round',jsonb_build_object('round_number',v_cr.round_number,'round_type',v_cr.round_type,
      'interviewer_email',coalesce(v_cr.interviewer_email,(select tm.email from public.team_members tm where tm.id=v_cr.assigned_team_member_id)),
      'cutoff_score',v_cr.cutoff_score,'daily_start_time',to_char(v_cr.daily_start_time,'HH24:MI'),
      'daily_end_time',to_char(v_cr.daily_end_time,'HH24:MI'),'duration_minutes',v_cr.duration_minutes),
    'account',jsonb_build_object('id',v_account.id,'company_name',v_account.company_name,'company_logo_url',v_account.company_logo_url,'name',v_account.name,'timezone',coalesce(v_account.timezone, 'Asia/Kolkata'),'tier',v_account.tier,'voice_screening_included',v_account.tier in ('basic','growth','enterprise')),
    'booked_event',v_booked
  );
end;
$$;

revoke all on function public.get_booking_context(uuid,text,int) from public;
grant execute on function public.get_booking_context(uuid,text,int) to anon,authenticated,service_role;

