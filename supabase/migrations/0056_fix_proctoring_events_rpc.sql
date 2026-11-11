-- Restore proctoring_events insert_proctoring_event RPC to match the actual
-- proctoring_events table schema (session_id, event_type, severity, detail).
create or replace function public.insert_proctoring_event(
  p_session_id uuid,
  p_token text,
  p_event_type text,
  p_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.interview_sessions
    where id = p_session_id and (expires_at is null or expires_at > now())
  ) then
    raise exception 'invalid_link' using detail = 'Invalid or expired session link.';
  end if;
  insert into public.proctoring_events (session_id, event_type, severity, detail)
  values (p_session_id, p_event_type, 'warning', p_detail);
end $$;
