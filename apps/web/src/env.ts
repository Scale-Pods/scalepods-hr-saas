import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_N8N_BASE_URL: z.string().url(),
  NEXT_PUBLIC_FRONTEND_URL: z.string().url(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().transform((v) => v || undefined).optional(),
  NEXT_PUBLIC_DEEPGRAM_API_KEY: z.string().transform((v) => v || undefined).optional(),
  NEXT_PUBLIC_APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
});

export type Env = z.infer<typeof schema>;

/**
 * Pure, testable parser. Throws a single error listing every invalid/missing
 * key so a blank var fails the build with a clear message instead of crashing
 * three clicks into the app.
 */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const bad = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment. Check these variables: ${bad}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

/**
 * Reads the public env with literal property access so Next.js can statically
 * inline the NEXT_PUBLIC_* values into the client bundle. Call this from a
 * Server Component (see app/layout.tsx) to fail the build early when a
 * required var is missing.
 */
export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_N8N_BASE_URL: process.env.NEXT_PUBLIC_N8N_BASE_URL,
      NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_DEEPGRAM_API_KEY: process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY,
      NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    });
  }
  return cached;
}
