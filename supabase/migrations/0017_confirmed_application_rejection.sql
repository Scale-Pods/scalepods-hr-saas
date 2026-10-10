-- Require an explicit recruiter confirmation for rejection actions.
-- Keep the original state machine as an internal implementation, but remove
-- its direct authenticated grant and expose a confirmed wrapper to callers.

revoke execute on function public.decide_application(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.decide_application(
  p_application_id uuid,
  p_action text,
  p_rejection_reason text,
  p_confirm_rejection boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action = 'reject' and coalesce(p_confirm_rejection, false) is not true then
    raise exception 'rejection_confirmation_required'
      using detail = 'Confirm the rejection before rejecting this application.';
  end if;

  return public.decide_application(p_application_id, p_action, p_rejection_reason);
end;
$$;

revoke all on function public.decide_application(uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.decide_application(uuid, text, text, boolean)
  to authenticated, service_role;
