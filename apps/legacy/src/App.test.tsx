import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders a setup screen instead of crashing when Supabase env vars are missing", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    render(<App />);
    expect(screen.getByText(/is not configured yet/i)).toBeInTheDocument();
  });

  it("renders normally (no setup screen) when Supabase env vars are present", () => {
    render(<App />);
    expect(
      screen.queryByText(/is not configured yet/i)
    ).not.toBeInTheDocument();
  });
});