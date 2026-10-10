-- Repair the execute privilege for the authenticated application-intake RPC.
-- This is safe to apply more than once and does not modify application data.

revoke all on function public.create_application_intake(
  uuid, text, text, text, text, boolean
) from public, anon;

grant execute on function public.create_application_intake(
  uuid, text, text, text, text, boolean
) to authenticated;

notify pgrst, 'reload schema';
