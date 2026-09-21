import type { Database } from "@scalepods/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/env";

/**
 * Anonymous client used on candidate-facing pages. Never carries a recruiter
 * session, so anon RLS policies + token-gated RPCs are the only access path.
 */
let _anon: SupabaseClient<Database> | null = null;

export function anonClient(): SupabaseClient<Database> {
  if (!_anon) {
    const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = getEnv();
    _anon = createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      },
    });
  }
  return _anon;
}
