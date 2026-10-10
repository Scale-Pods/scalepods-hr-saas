-- Pick one randomized call instant within the job's timezone window. The
-- outbox worker only claims it when the job and round are still eligible.
create or replace function public.enrich_workflow_outbox_payload()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_app public.applications%rowtype; v_round public.round_instances%rowtype; v_start time; v_end time; v_timezone text; v_offset numeric; v_today timestamptz;
begin
  if new.application_id is not null then
    select * into v_app from public.applications where id=new.application_id and account_id=new.account_id;
    if found then
      new.payload := coalesce(new.payload,'{}'::jsonb) || jsonb_build_object(
        'candidate_id',v_app.candidate_id,'candidate_name',v_app.candidate_name,
        'candidate_email',v_app.candidate_email,'candidate_phone',v_app.candidate_phone,
        'whatsapp_opt_in',v_app.whatsapp_opt_in,'campaign_id',v_app.campaign_id
      );
    end if;
  end if;
  if new.event_type='voice_call_ready' and new.round_instance_id is not null then
    select * into v_round from public.round_instances where id=new.round_instance_id;
    select cr.daily_start_time,cr.daily_end_time,a.timezone into v_start,v_end,v_timezone
      from public.campaign_rounds cr join public.accounts a on a.id=new.account_id
      where cr.campaign_id=v_round.campaign_id and cr.round_number=v_round.round_number;
    if v_start is null or v_end is null or v_timezone is null then raise exception 'voice_window_missing'; end if;
    v_offset := extract(epoch from (v_end-v_start));
    if v_offset<=0 then v_offset:=v_offset+86400; end if;
    v_today := ((now() at time zone v_timezone)::date + v_start + (random()*v_offset)*interval '1 second') at time zone v_timezone;
    if v_today<=now() then
      v_today := (((now() at time zone v_timezone)::date + 1) + v_start + (random()*v_offset)*interval '1 second') at time zone v_timezone;
    end if;
    new.available_at := v_today;
  end if;
  return new;
end;
$$;

