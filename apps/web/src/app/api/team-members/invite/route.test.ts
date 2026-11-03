import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _clearRecentEmailDispatchesForTests, POST } from "./route";

const mockGetUser = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (table: string) => mockAdminFrom(table),
  }),
}));

vi.mock("@/env", () => ({
  getEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    NEXT_PUBLIC_FRONTEND_URL: "https://scalepods.tech",
    NEXT_PUBLIC_N8N_BASE_URL: "https://n8n.scalepods.tech",
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const TEST_USER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TEST_MEMBER_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

describe("POST /api/team-members/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearRecentEmailDispatchesForTests();
  });

  it("returns 401 when unauthorized", async () => {
    const req = new NextRequest("http://localhost/api/team-members/invite", {
      method: "POST",
      body: JSON.stringify({ team_member_id: TEST_MEMBER_ID }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid team_member_id", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: TEST_USER_ID } },
      error: null,
    });

    const req = new NextRequest("http://localhost/api/team-members/invite", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: JSON.stringify({ team_member_id: "invalid-uuid" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when team member is not found", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: TEST_USER_ID } },
      error: null,
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "team_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: { message: "Not found" } }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const req = new NextRequest("http://localhost/api/team-members/invite", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: JSON.stringify({ team_member_id: TEST_MEMBER_ID }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("does not dispatch email when dispatch_email is false (copy link mode)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: TEST_USER_ID } },
      error: null,
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "team_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: TEST_MEMBER_ID,
                      name: "Alex",
                      email: "alex@example.com",
                      account_id: TEST_USER_ID,
                      role: "interviewer",
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "accounts") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { company_name: "Acme Corp", name: "Recruiter Bob" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "team_member_invites") {
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    });

    const req = new NextRequest("http://localhost/api/team-members/invite", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: JSON.stringify({
        team_member_id: TEST_MEMBER_ID,
        dispatch_email: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.invite_link).toContain("/calendar/connect?token=");
    expect(data.email_sent).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("dispatches email once and deduplicates rapid repeated dispatches", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: TEST_USER_ID } },
      error: null,
    });

    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "team_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: TEST_MEMBER_ID,
                      name: "Alex",
                      email: "alex@example.com",
                      account_id: TEST_USER_ID,
                      role: "interviewer",
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "accounts") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { company_name: "Acme Corp", name: "Recruiter Bob" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "team_member_invites") {
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    });

    // First call: should dispatch email via fetch
    const req1 = new NextRequest("http://localhost/api/team-members/invite", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: JSON.stringify({ team_member_id: TEST_MEMBER_ID, dispatch_email: true }),
    });

    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.email_sent).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call immediately afterwards (e.g. duplicate network request or double click):
    // should debounce and NOT call fetch a second time
    const req2 = new NextRequest("http://localhost/api/team-members/invite", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: JSON.stringify({ team_member_id: TEST_MEMBER_ID, dispatch_email: true }),
    });

    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.email_sent).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
