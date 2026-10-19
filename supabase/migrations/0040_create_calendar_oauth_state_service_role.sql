-- Allow create_calendar_oauth_state to be called by service_role
-- (e.g. from n8n backend automation) as well as authenticated recruiters.

create or replace function public.create_calendar_oauth_state(p_team_member_id uuid, p_state_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  if nullif(p_state_hash, '') is null or length(p_state_hash) <> 64 then
    raise exception 'invalid_oauth_state';
  end if;

  if coalesce(auth.role(), '') = 'service_role' then
    select account_id into v_account
    from public.team_members
    where id = p_team_member_id;
  else
    if auth.uid() is null then
      raise exception 'authentication_required' using errcode = '28000';
    end if;
    select account_id into v_account
    from public.team_members
    where id = p_team_member_id and account_id = auth.uid();
  end if;

  if not found or v_account is null then
    raise exception 'interviewer_not_found';
  end if;

  insert into public.calendar_oauth_states(account_id, team_member_id, state_hash, expires_at)
  values (v_account, p_team_member_id, p_state_hash, now() + interval '10 minutes');

  insert into public.interviewer_calendar_connections(account_id, team_member_id, status)
  values (v_account, p_team_member_id, 'pending')
  on conflict (team_member_id) do update set status = 'pending', disconnected_at = null;

  return jsonb_build_object('account_id', v_account, 'team_member_id', p_team_member_id);
end;
$$;
