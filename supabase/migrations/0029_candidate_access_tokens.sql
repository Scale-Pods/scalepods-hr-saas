-- Candidate-facing links are signed by an opaque random token. Only a hash is
-- persisted; n8n receives the single-use plaintext while building the message.
create or replace function public.store_candidate_access_token(
  p_account_id uuid,p_resource_type text,p_resource_id uuid,p_token_hash text,p_expires_at timestamptz
) returns void language plpgsql security definer set search_path=public
as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_resource_type is null or p_resource_id is null or p_token_hash is null then return; end if;
  if p_resource_type not in ('booking','session','assignment') or length(p_token_hash)<>64
     or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '31 days' then raise exception 'candidate_token_invalid'; end if;
  insert into public.candidate_access_tokens(account_id,resource_type,resource_id,token_hash,expires_at)
  values(p_account_id,p_resource_type,p_resource_id,p_token_hash,p_expires_at);
end;
$$;
revoke all on function public.store_candidate_access_token(uuid,text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.store_candidate_access_token(uuid,text,uuid,text,timestamptz) to service_role;

create or replace function public.enrich_workflow_outbox_payload()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_app public.applications%rowtype; v_round public.round_instances%rowtype; v_start time; v_end time; v_timezone text; v_offset numeric; v_candidate_time timestamptz; v_job_name text;
begin
  if new.application_id is not null then
    select * into v_app from public.applications where id=new.application_id and account_id=new.account_id;
    if found then
      select name into v_job_name from public.campaigns where id=v_app.campaign_id;
      new.payload := coalesce(new.payload,'{}'::jsonb) || jsonb_build_object(
        'candidate_id',v_app.candidate_id,'candidate_name',v_app.candidate_name,
        'candidate_email',v_app.candidate_email,'candidate_phone',v_app.candidate_phone,
        'whatsapp_opt_in',v_app.whatsapp_opt_in,'campaign_id',v_app.campaign_id,'job_title',v_job_name
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
    v_candidate_time := ((now() at time zone v_timezone)::date + v_start + (random()*v_offset)*interval '1 second') at time zone v_timezone;
    if v_candidate_time<=now() then
      v_candidate_time := (((now() at time zone v_timezone)::date + 1) + v_start + (random()*v_offset)*interval '1 second') at time zone v_timezone;
    end if;
    new.available_at := v_candidate_time;
  end if;
  return new;
end;
$$;

