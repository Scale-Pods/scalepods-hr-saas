import type { Database } from "@scalepods/core";
import { createBrowserClient } from "@supabase/ssr";
import { getEnv } from "@/env";

export type SupabaseBrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let client: SupabaseBrowserClient | undefined;

/** One RLS-scoped browser client, memoised for the whole app. */
export function supabaseBrowser(): SupabaseBrowserClient {
  if (!client) {
    const env = getEnv();
    client = createBrowserClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return client;
}

/** Bearer token for recruiter webhook calls (undefined when signed out). */
export async function accessToken(): Promise<string | undefined> {
  const { data } = await supabaseBrowser().auth.getSession();
  return data.session?.access_token;
}
