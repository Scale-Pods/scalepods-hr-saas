import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@scalepods/core";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function assertEnv(): { url: string; key: string } {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example)."
    );
  }
  return { url, key: anonKey };
}

function makeClient(persistSession: boolean): SupabaseClient<Database> {
  const { url: u, key: k } = assertEnv();
  return createClient<Database>(u, k, {
    auth: {
      persistSession,
      autoRefreshToken: persistSession,
      detectSessionInUrl: true,
      storage: persistSession ? undefined : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
  });
}

let _browser: SupabaseClient<Database> | null = null;
let _anon: SupabaseClient<Database> | null = null;

/** Authed client shared across recruiter flows (persists the session). */
export function browserClient(): SupabaseClient<Database> {
  if (!_browser) _browser = makeClient(true);
  return _browser;
}

/**
 * Anonymous client used on candidate-facing pages. Never carries a recruiter
 * session, so anon RLS policies + token-gated RPCs are the only access path.
 */
export function anonClient(): SupabaseClient<Database> {
  if (!_anon) _anon = makeClient(false);
  return _anon;
}

export function isSupabaseConfigured(): boolean {
  const liveUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const liveKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return Boolean(liveUrl && liveKey);
}