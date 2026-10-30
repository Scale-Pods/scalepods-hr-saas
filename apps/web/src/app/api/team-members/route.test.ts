import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

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
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  }),
}));

describe("Team Members API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/team-members", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost/api/team-members", {
        method: "POST",
        body: JSON.stringify({ name: "Alex", email: "alex@example.com" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 when name is missing", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "acc-1" } },
        error: null,
      });

      const req = new NextRequest("http://localhost/api/team-members", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
        body: JSON.stringify({ email: "alex@example.com" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("adds team member successfully", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "acc-1" } },
        error: null,
      });

      mockFrom.mockReturnValue({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "tm-1", name: "Alex", email: "alex@example.com" },
                error: null,
              }),
          }),
        }),
      });

      const req = new NextRequest("http://localhost/api/team-members", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
        body: JSON.stringify({ name: "Alex", email: "alex@example.com" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.team_member.name).toBe("Alex");
    });
  });

  describe("DELETE /api/team-members", () => {
    it("returns 401 when unauthorized", async () => {
      const req = new NextRequest("http://localhost/api/team-members?id=tm-1", {
        method: "DELETE",
      });

      const res = await DELETE(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 when id is missing", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "acc-1" } },
        error: null,
      });

      const req = new NextRequest("http://localhost/api/team-members", {
        method: "DELETE",
        headers: { Authorization: "Bearer token" },
        body: JSON.stringify({}),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it("returns 404 when team member is not found in user account", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "acc-1" } },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "team_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const req = new NextRequest("http://localhost/api/team-members?id=nonexistent", {
        method: "DELETE",
        headers: { Authorization: "Bearer token" },
      });

      const res = await DELETE(req);
      expect(res.status).toBe(404);
    });

    it("deletes team member from DB and cleans up related records", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "acc-1" } },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "team_members") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: "tm-1", name: "Alex", email: "alex@example.com" },
                      error: null,
                    }),
                }),
              }),
            }),
            delete: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            }),
          };
        }
        if (table === "campaign_rounds") {
          return {
            update: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          };
        }
        // calendar & feedback tables
        return {
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      });

      const req = new NextRequest("http://localhost/api/team-members?id=tm-1", {
        method: "DELETE",
        headers: { Authorization: "Bearer token" },
      });

      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.deleted).toBe(true);
      expect(data.id).toBe("tm-1");
    });
  });
});
