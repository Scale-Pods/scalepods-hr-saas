import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const complete = {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "k",
  NEXT_PUBLIC_N8N_BASE_URL: "https://n8n.test",
  NEXT_PUBLIC_FRONTEND_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("throws listing every missing key", () => {
    expect(() => parseEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("accepts a complete env", () => {
    const env = parseEnv(complete);
    expect(env.NEXT_PUBLIC_N8N_BASE_URL).toBe("https://n8n.test");
  });

  it("defaults APP_ENV to local", () => {
    expect(parseEnv(complete).NEXT_PUBLIC_APP_ENV).toBe("local");
  });

  it("rejects a non-URL supabase url", () => {
    expect(() => parseEnv({ ...complete, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});
