import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";

const mockGetUser = vi.fn();
const mockAdminSelect = vi.fn();
const mockAdminUpdate = vi.fn();
const mockAdminDelete = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, opts?: any) => {
    // If it has global auth headers, it's authClient
    if (opts?.global?.headers?.Authorization) {
      return {
        auth: {
          getUser: () => mockGetUser(),
        },
      };
    }
    // Otherwise it's admin client
    return {
      auth: {
        getUser: () => mockGetUser(),
      },
      from: (table: string) => {
        if (table === "campaigns") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => mockAdminSelect("campaigns"),
              }),
            }),
            delete: () => ({
              eq: () => mockAdminDelete("campaigns"),
            }),
          };
        }
        if (table === "round_instances") {
          return {
            select: () => ({
              eq: () => mockAdminSelect("round_instances"),
            }),
            update: () => ({
              in: () => mockAdminUpdate("round_instances"),
            }),
          };
        }
        if (table === "credit_ledger") {
          return {
            update: () => ({
              in: () => mockAdminUpdate("credit_ledger"),
            }),
          };
        }
        if (table === "outreach_log") {
          return {
            delete: () => ({
              in: () => mockAdminDelete("outreach_log"),
            }),
          };
        }
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [] }) }),
          update: () => ({ in: () => Promise.resolve({ error: null }) }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
            in: () => Promise.resolve({ error: null }),
          }),
        };
      },
    };
  },
}));

vi.mock("@/lib/webhooks", () => ({
  callWorkflow: vi.fn().mockResolvedValue({}),
}));

describe("DELETE /api/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully unbinds credit_ledger and deletes campaign", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "acc_1" } },
      error: null,
    });

    mockAdminSelect.mockImplementation((table) => {
      if (table === "campaigns") {
        return Promise.resolve({
          data: { id: "camp_123", account_id: "acc_1", name: "Frontend Eng" },
          error: null,
        });
      }
      if (table === "round_instances") {
        return Promise.resolve({
          data: [{ id: "ri_1" }, { id: "ri_2" }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    mockAdminUpdate.mockResolvedValue({ error: null });
    mockAdminDelete.mockResolvedValue({ error: null });

    const req = new Request("http://localhost:3000/api/campaigns/camp_123", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer test-token",
      },
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "camp_123" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.id).toBe("camp_123");
  });

  it("returns 403 if user does not own campaign", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "another_user" } },
      error: null,
    });

    mockAdminSelect.mockImplementation((table) => {
      if (table === "campaigns") {
        return Promise.resolve({
          data: { id: "camp_123", account_id: "acc_1", name: "Frontend Eng" },
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const req = new Request("http://localhost:3000/api/campaigns/camp_123", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer test-token",
      },
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "camp_123" }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });
});
