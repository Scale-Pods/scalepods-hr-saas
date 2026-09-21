import type { Database } from "@scalepods/core";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv } from "@/env";

export type SupabaseServerClient = ReturnType<typeof createServerClient<Database>>;

/**
 * RLS-scoped server client bound to Next.js cookies. Server Components read
 * initial data directly through this (no client-side waterfall on first paint).
 */
export async function supabaseServer(): Promise<SupabaseServerClient> {
  const cookieStore = await cookies();
  const env = getEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component. Safe to ignore: middleware
            // refreshes the session cookie on every request.
          }
        },
      },
    },
  );
}
