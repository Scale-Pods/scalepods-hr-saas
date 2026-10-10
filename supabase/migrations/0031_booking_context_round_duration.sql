-- Booking page context is token-checked and carries the configured round length.
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
      'scheduled_at',v_ri.scheduled_at,'meet_link',v_ri.conferencing_link,'event_id',v_ri.event_id,'deadline_at',v_ri.deadline_at,'reschedule_count',v_ri.reschedule_count),
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

