import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockCallN8nGateway = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (table: string) => mockFrom(table),
  }),
}));

vi.mock("@/env", () => ({
  getEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  }),
}));

vi.mock("@/lib/n8n-gateway", () => ({
  callN8nGateway: (...args: unknown[]) => mockCallN8nGateway(...args),
}));

describe("POST /api/applications/intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validBody = {
    campaign_id: "11111111-1111-1111-1111-111111111111",
    candidate_name: "John Doe",
    candidate_email: "john.doe+test@example.com",
    candidate_phone: "+15551234567",
    resume_path: "acc/camp/resume.pdf",
    resume_text: "Experienced engineer",
    whatsapp_opt_in: true,
  };

  it("returns 401 when no token is provided", async () => {
    const req = new NextRequest("http://localhost/api/applications/intake", {
      method: "POST",
      body: JSON.stringify(validBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 409 when candidate has already been added to the campaign", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { jd_text: "Software Engineer Job Description" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "applications") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { id: "app-existing-123" },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const req = new NextRequest("http://localhost/api/applications/intake", {
      method: "POST",
      headers: {
        Authorization: "Bearer mock-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      error: "Candidate already added to this campaign",
      message: "Candidate already added to this campaign",
      code: "candidate_already_uploaded",
    });
    // Ensure n8n is not even called for duplicate candidates
    expect(mockCallN8nGateway).not.toHaveBeenCalled();
  });

  it("calls n8n gateway and forwards success when candidate is new", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { jd_text: "Software Engineer Job Description" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "applications") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: null,
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    mockCallN8nGateway.mockResolvedValue({
      response: { ok: true, status: 201 },
      payload: { id: "app-new-123", status: "active" },
    });

    const req = new NextRequest("http://localhost/api/applications/intake", {
      method: "POST",
      headers: {
        Authorization: "Bearer mock-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockCallN8nGateway).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toEqual({ id: "app-new-123", status: "active" });
  });

  it("translates n8n duplicate candidate errors to 409 Candidate already added", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { jd_text: "Software Engineer Job Description" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "applications") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: null,
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    mockCallN8nGateway.mockResolvedValue({
      response: { ok: false, status: 500 },
      payload: { error: "candidate_already_uploaded" },
    });

    const req = new NextRequest("http://localhost/api/applications/intake", {
      method: "POST",
      headers: {
        Authorization: "Bearer mock-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Candidate already added to this campaign");
  });
});
