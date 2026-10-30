import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";

const mockGetUser = vi.fn();
const mockAdminSelect = vi.fn();
const mockAdminDelete = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (table: string) => {
      const createChain = () => {
        const chain: any = {
          eq: () => chain,
          in: () => chain,
          select: () => chain,
          delete: () => chain,
          maybeSingle: () => Promise.resolve(mockAdminSelect(table)),
          // biome-ignore lint/suspicious/noThenProperty: supabase chain mock
          then: (resolve: any, reject: any) =>
            Promise.resolve(mockAdminSelect(table)).then(resolve, reject),
        };
        return chain;
      };
      return createChain();
    },
  }),
}));

vi.mock("@/env", () => ({
  getEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  }),
}));

describe("Applications Remove API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no authorization header is present", async () => {
    const req = new NextRequest("http://localhost/api/applications/remove", {
      method: "POST",
      body: JSON.stringify({ campaignId: "camp-1", candidateId: "cand-1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when user authentication fails", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Invalid token") });

    const req = new NextRequest("http://localhost/api/applications/remove", {
      method: "POST",
      headers: { Authorization: "Bearer bad-token" },
      body: JSON.stringify({ campaignId: "camp-1", candidateId: "cand-1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when missing required identifiers", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "acc-1", email: "recruiter@example.com" } },
      error: null,
    });

    const req = new NextRequest("http://localhost/api/applications/remove", {
      method: "POST",
      headers: { Authorization: "Bearer good-token" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("successfully removes candidate from campaign via POST", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "acc-1", email: "recruiter@example.com" } },
      error: null,
    });

    mockAdminSelect.mockImplementation((table: string) => {
      if (table === "applications") {
        return {
          data: { id: "app-1", account_id: "acc-1", campaign_id: "camp-1", candidate_id: "cand-1" },
          error: null,
        };
      }
      return { data: [], error: null };
    });
    mockAdminDelete.mockResolvedValue({ error: null });

    const req = new NextRequest("http://localhost/api/applications/remove", {
      method: "POST",
      headers: { Authorization: "Bearer good-token" },
      body: JSON.stringify({
        campaignId: "camp-1",
        candidateId: "cand-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.removed).toBe(true);
  });

  it("successfully removes candidate from campaign via DELETE query params", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "acc-1", email: "recruiter@example.com" } },
      error: null,
    });

    mockAdminSelect.mockImplementation((table: string) => {
      if (table === "applications") {
        return {
          data: { id: "app-1", account_id: "acc-1", campaign_id: "camp-1", candidate_id: "cand-1" },
          error: null,
        };
      }
      return { data: [], error: null };
    });
    mockAdminDelete.mockResolvedValue({ error: null });

    const req = new NextRequest(
      "http://localhost/api/applications/remove?campaignId=camp-1&candidateId=cand-1",
      {
        method: "DELETE",
        headers: { Authorization: "Bearer good-token" },
      },
    );

    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.removed).toBe(true);
  });
});
