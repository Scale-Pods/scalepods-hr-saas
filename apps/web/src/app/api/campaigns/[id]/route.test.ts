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
      storage: {
        from: () => ({
          list: () => Promise.resolve({ data: [] }),
          remove: () => Promise.resolve({ data: [] }),
        }),
      },
      from: (table: string) => {
        if (table === "campaigns") {
          return {
            select: () => ({
              eq: () =>
                Object.assign(Promise.resolve(mockAdminSelect("campaigns")), {
                  maybeSingle: () => Promise.resolve(mockAdminSelect("campaigns")),
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
              eq: () => Promise.resolve(mockAdminSelect("round_instances")),
            }),
            update: () => ({
              in: () => mockAdminUpdate("round_instances"),
            }),
          };
        }
        if (table === "candidates") {
          return {
            delete: () => ({
              eq: () => mockAdminDelete("candidates"),
              in: () => mockAdminDelete("candidates"),
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

  it("successfully unbinds credit_ledger, deletes campaign, and cleans up orphaned candidates", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "acc_1" } },
      error: null,
    });

    let campaignQueryCount = 0;
    mockAdminSelect.mockImplementation((table) => {
      if (table === "campaigns") {
        campaignQueryCount++;
        // First query is to verify campaign ownership
        if (campaignQueryCount === 1) {
          return {
            data: { id: "camp_123", account_id: "acc_1", name: "Frontend Eng" },
            error: null,
          };
        }
        // Second query is to check remaining campaigns (all deleted)
        return {
          data: [],
          error: null,
        };
      }
      if (table === "round_instances") {
        return {
          data: [
            { id: "ri_1", candidate_id: "cand_1" },
            { id: "ri_2", candidate_id: "cand_2" },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
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
    expect(mockAdminDelete).toHaveBeenCalledWith("campaigns");
    expect(mockAdminDelete).toHaveBeenCalledWith("candidates");
  });

  it("returns 403 if user does not own campaign", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "another_user" } },
      error: null,
    });

    mockAdminSelect.mockImplementation((table) => {
      if (table === "campaigns") {
        return {
          data: { id: "camp_123", account_id: "acc_1", name: "Frontend Eng" },
          error: null,
        };
      }
      return { data: [], error: null };
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
