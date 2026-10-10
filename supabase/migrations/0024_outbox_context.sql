-- Give background workflow consumers an immutable, application-scoped snapshot.
create or replace function public.enrich_workflow_outbox_payload()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_app public.applications%rowtype;
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
  return new;
end;
$$;
create trigger workflow_outbox_application_context
before insert on public.workflow_outbox
for each row execute function public.enrich_workflow_outbox_payload();

