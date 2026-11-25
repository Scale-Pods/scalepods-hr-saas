-- Fix PGRST203: PostgREST function overloading ambiguity
-- Drop the legacy 2-argument signature so PostgREST resolves to the 4-argument signature with defaults.
drop function if exists public.can_send_now(uuid, uuid);
