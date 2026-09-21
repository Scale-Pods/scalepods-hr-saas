import "@testing-library/jest-dom/vitest";

// Public env required by getEnv() during tests. Set before first use so the
// cached value is valid; values are arbitrary and never hit the network.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.NEXT_PUBLIC_N8N_BASE_URL ??= "https://n8n.test";
process.env.NEXT_PUBLIC_FRONTEND_URL ??= "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_ENV ??= "local";
