-- Fix missing conferencing_link column on round_instances and update get_booking_context and book_interview_slot RPCs

-- 1. Ensure conferencing_link exists on round_instances alongside meet_link
alter table public.round_instances
  add column if not exists conferencing_link text;

-- Sync existing meet_link to conferencing_link if null
update public.round_instances
  set conferencing_link = meet_link
  where conferencing_link is null and meet_link is not null;

-- 2. Update get_booking_context to safely use coalesce(v_ri.meet_link, v_ri.conferencing_link)
create or replace function public.get_booking_context(
  p_round_instance_id uuid,p_token text,p_tz_offset_minutes int default 0
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_ri public.round_instances%rowtype; v_cand public.candidates%rowtype; v_camp public.campaigns%rowtype;
  v_cr public.campaign_rounds%rowtype; v_account public.accounts%rowtype; v_booked jsonb;
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
  select jsonb_build_object('event_id',ce.event_id,'slot_start',ce.slot_start,'slot_end',ce.slot_end,
    'meet_link',ce.meet_link,'interviewer_email',ce.interviewer_email) into v_booked
    from public.calendar_events ce where ce.round_instance_id=v_ri.id;
  return jsonb_build_object(
    'round_instance',jsonb_build_object('id',v_ri.id,'round_type',v_ri.round_type,'status',v_ri.status,
      'scheduled_at',v_ri.scheduled_at,'meet_link',coalesce(v_ri.meet_link, v_ri.conferencing_link, v_booked->>'meet_link'),'event_id',v_ri.event_id,'deadline_at',v_ri.deadline_at,'reschedule_count',v_ri.reschedule_count),
    'candidate',jsonb_build_object('id',v_cand.id,'name',v_cand.name,'email',v_cand.email,'phone',v_cand.phone),
    'campaign',jsonb_build_object('id',v_camp.id,'name',v_camp.name,'number_of_rounds',v_camp.number_of_rounds),
    'round',jsonb_build_object('round_number',v_cr.round_number,'round_type',v_cr.round_type,
      'interviewer_email',coalesce(v_cr.interviewer_email,(select tm.email from public.team_members tm where tm.id=v_cr.assigned_team_member_id)),
      'cutoff_score',v_cr.cutoff_score,'daily_start_time',to_char(v_cr.daily_start_time,'HH24:MI'),
      'daily_end_time',to_char(v_cr.daily_end_time,'HH24:MI'),'duration_minutes',v_cr.duration_minutes),
    'account',jsonb_build_object('tier',v_account.tier,'voice_screening_included',v_account.tier in ('basic','growth','enterprise')),
    'booked_event',v_booked
  );
end;
$$;
revoke all on function public.get_booking_context(uuid,text,int) from public;
grant execute on function public.get_booking_context(uuid,text,int) to anon,authenticated,service_role;

-- 3. Update book_interview_slot to update both meet_link and conferencing_link
create or replace function public.book_interview_slot(
  p_round_instance_id uuid,p_token text,p_slot_start timestamptz,p_slot_end timestamptz,
  p_event_id text,p_meet_link text,p_is_reschedule boolean default false
) returns void language plpgsql security definer set search_path=public
as $$
declare v_round public.round_instances%rowtype; v_cr public.campaign_rounds%rowtype; v_job public.campaigns%rowtype; v_app public.applications%rowtype; v_interviewer_email text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if not exists(select 1 from public.candidate_access_tokens t where t.resource_type='booking'
    and t.resource_id=p_round_instance_id and t.token_hash=encode(digest(p_token,'sha256'),'hex')
    and t.revoked_at is null and t.expires_at>now()) then raise exception 'booking_token_invalid' using errcode='28000'; end if;
  select * into v_round from public.round_instances where id=p_round_instance_id for update;
  if not found or v_round.round_type<>'human_interview' then raise exception 'round_not_bookable'; end if;
  select * into v_job from public.campaigns where id=v_round.campaign_id and account_id=v_round.account_id;
  if not found or v_job.status<>'open' then raise exception 'job_closed'; end if;
  select * into v_cr from public.campaign_rounds where campaign_id=v_round.campaign_id and round_number=v_round.round_number;
  v_interviewer_email := coalesce(v_cr.interviewer_email,(select tm.email from public.team_members tm where tm.id=v_cr.assigned_team_member_id));
  if v_round.status='pending' and not p_is_reschedule then
    null;
  elsif v_round.status='scheduled' and p_is_reschedule and v_round.reschedule_count=0 and v_round.scheduled_at>now() then
    update public.calendar_events set slot_start=p_slot_start,slot_end=p_slot_end,event_id=p_event_id
      where round_instance_id=v_round.id;
    if not found then
      insert into public.calendar_events(account_id,round_instance_id,interviewer_email,event_id,slot_start,slot_end)
      values(v_round.account_id,v_round.id,coalesce(v_interviewer_email,''),p_event_id,p_slot_start,p_slot_end);
    end if;
    update public.round_instances set scheduled_at=p_slot_start,event_id=p_event_id,
      meet_link=p_meet_link,conferencing_link=p_meet_link,reschedule_count=1 where id=v_round.id;
    return;
  else raise exception 'booking_state_conflict' using errcode='55000';
  end if;
  if exists(select 1 from public.calendar_events e where e.round_instance_id<>v_round.id
    and e.interviewer_email=coalesce(v_interviewer_email,'') and e.slot_start<p_slot_end and e.slot_end>p_slot_start) then
    raise exception 'interview_slot_unavailable';
  end if;
  insert into public.calendar_events(account_id,round_instance_id,interviewer_email,event_id,slot_start,slot_end)
  values(v_round.account_id,v_round.id,coalesce(v_interviewer_email,''),p_event_id,p_slot_start,p_slot_end);
  update public.round_instances set status='scheduled',scheduled_at=p_slot_start,event_id=p_event_id,
    meet_link=p_meet_link,conferencing_link=p_meet_link,reschedule_count=0 where id=v_round.id;
end;
$$;
revoke all on function public.book_interview_slot(uuid,text,timestamptz,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.book_interview_slot(uuid,text,timestamptz,timestamptz,text,text,boolean) to service_role;
