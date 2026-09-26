-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- 1. Enable pgcrypto extension (for gen_salt() and crypt())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create RPC function to sync password hash to public.users
-- The client calls this after sign-up or password reset
CREATE OR REPLACE FUNCTION sync_password_hash(p_email text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (email, password_hash, full_name, created_at, passwords_changed_at)
  VALUES (
    p_email,
    crypt(p_password, gen_salt('bf')),
    COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE email = p_email), 'User'),
    now(),
    now()
  )
  ON CONFLICT (email) DO UPDATE SET
    password_hash = crypt(p_password, gen_salt('bf')),
    passwords_changed_at = now();
END;
$$;

-- 3. Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION sync_password_hash TO anon, authenticated;

-- 4. Verify the function
SELECT proname FROM pg_proc WHERE proname = 'sync_password_hash';
