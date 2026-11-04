import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  NEXT_PUBLIC_N8N_BASE_URL: z.string().url(),
  NEXT_PUBLIC_FRONTEND_URL: z.string().url(),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z
    .string()
    .transform((v) => v || undefined)
    .optional(),
  NEXT_PUBLIC_DEEPGRAM_API_KEY: z
    .string()
    .transform((v) => v || undefined)
    .optional(),
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

export const DEFAULT_PUBLIC_SUPABASE_URL = "https://fvjsaourhzzyvvzrgwan.supabase.co";
export const DEFAULT_PUBLIC_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2anNhb3VyaHp6eXZ2enJnd2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzOTYwMDcsImV4cCI6MjEwNzk3MjAwN30.aGcEinp7SkbUpSPDp33NK4HqDameB6ZiCWEdBsZmvpA";
export const DEFAULT_PUBLIC_N8N_BASE_URL = "https://n8n.srv1711190.hstgr.cloud";

/**
 * Reads the public env with literal property access so Next.js can statically
 * inline the NEXT_PUBLIC_* values into the client bundle. Falls back to production
 * defaults when building in environments where env variables are not pre-injected.
 */
export function getEnv(): Env {
  if (!cached) {
    const defaultFrontendUrl =
      process.env.NEXT_PUBLIC_FRONTEND_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined) ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
      (process.env.NODE_ENV === "production" ? "https://scalepods.tech" : "http://localhost:3000");

    cached = parseEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_N8N_BASE_URL: process.env.NEXT_PUBLIC_N8N_BASE_URL || DEFAULT_PUBLIC_N8N_BASE_URL,
      NEXT_PUBLIC_FRONTEND_URL: defaultFrontendUrl,
      NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      NEXT_PUBLIC_DEEPGRAM_API_KEY: process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY,
      NEXT_PUBLIC_APP_ENV:
        process.env.NEXT_PUBLIC_APP_ENV ||
        (process.env.NODE_ENV === "production" ? "production" : "local"),
    });
  }
  return cached;
}
