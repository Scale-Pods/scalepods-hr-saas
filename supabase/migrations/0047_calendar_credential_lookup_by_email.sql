-- Allow get_interviewer_calendar_credential to fall back to interviewer_email
-- when assigned_team_member_id is null or when the campaign admin assigns themselves by email.

drop function if exists public.get_interviewer_calendar_credential(uuid);

create or replace function public.get_interviewer_calendar_credential(
  p_team_member_id uuid default null,
  p_email text default null
)
returns table(
  account_id uuid,
  team_member_id uuid,
  google_email text,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  refresh_token_tag text
)
language plpgsql security definer set search_path=public
as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;

  -- 1. Try by team_member_id if provided
  if p_team_member_id is not null then
    return query select c.account_id,c.team_member_id,c.google_email,c.refresh_token_ciphertext,c.refresh_token_iv,c.refresh_token_tag
      from public.interviewer_calendar_credentials c join public.interviewer_calendar_connections x using(team_member_id)
      where c.team_member_id=p_team_member_id and x.status='active';
    if found then
      return;
    end if;
  end if;

  -- 2. Fallback: match by interviewer email or connected Google calendar email
  if p_email is not null and trim(p_email) <> '' then
    return query select c.account_id,c.team_member_id,c.google_email,c.refresh_token_ciphertext,c.refresh_token_iv,c.refresh_token_tag
      from public.interviewer_calendar_credentials c join public.interviewer_calendar_connections x using(team_member_id)
      where x.status='active'
        and (
          lower(c.google_email) = lower(trim(p_email))
          or c.team_member_id in (
            select tm.id from public.team_members tm where lower(tm.email) = lower(trim(p_email))
          )
        )
      order by c.updated_at desc
      limit 1;
  end if;
end;
$$;

revoke all on function public.get_interviewer_calendar_credential(uuid, text) from public,anon,authenticated;
grant execute on function public.get_interviewer_calendar_credential(uuid, text) to service_role;
