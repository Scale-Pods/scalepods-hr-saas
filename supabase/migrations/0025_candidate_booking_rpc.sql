-- Candidate authenticated calendar booking with one self-service reschedule.
alter table public.round_instances
  add column if not exists reschedule_count integer not null default 0
    check(reschedule_count between 0 and 1);

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
  select * into v_app from public.applications where id=v_round.application_id and account_id=v_round.account_id;
  if not found or v_app.status in ('rejected','on_hold','offer_sent') then raise exception 'application_not_bookable'; end if;
  select * into v_cr from public.campaign_rounds where campaign_id=v_round.campaign_id and round_number=v_round.round_number;
  select coalesce(tm.email,v_cr.interviewer_email) into v_interviewer_email
    from (select v_cr.assigned_team_member_id as member_id) assigned
    left join public.team_members tm on tm.id=assigned.member_id;
  if p_slot_start is null or p_slot_end is null or p_slot_start<=now() or p_slot_end<=p_slot_start
     or v_cr.duration_minutes is null
     or extract(epoch from (p_slot_end-p_slot_start))/60 <> v_cr.duration_minutes then raise exception 'invalid_interview_slot'; end if;
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
      conferencing_link=p_meet_link,reschedule_count=1 where id=v_round.id;
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
    conferencing_link=p_meet_link,reschedule_count=0 where id=v_round.id;
end;
$$;
revoke all on function public.book_interview_slot(uuid,text,timestamptz,timestamptz,text,text,boolean) from public,anon,authenticated;
grant execute on function public.book_interview_slot(uuid,text,timestamptz,timestamptz,text,text,boolean) to service_role;
