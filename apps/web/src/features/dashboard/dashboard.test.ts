import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDashboardKpis, fetchLedger, fetchUpcomingInterviews } from "./api";

const mockFrom = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({
    from: (table: string) => mockFrom(table),
  }),
}));

describe("Dashboard API with Campaign Scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeroed metrics and purges orphaned candidates when 0 campaigns exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
        };
      }
      if (table === "candidates") {
        return {
          select: () =>
            Object.assign(Promise.resolve({ data: [{ id: "orphan_1" }], count: 1, error: null }), {
              order: () => ({
                limit: () => Promise.resolve({ data: [{ id: "orphan_1" }], count: 1, error: null }),
              }),
            }),
          delete: () => ({
            neq: () => {
              mockDelete("candidates");
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "round_instances") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => Promise.resolve({ data: [], count: 0, error: null }),
              lt: () => Promise.resolve({ data: [], count: 0, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], count: 0, error: null }),
          }),
          eq: () => Promise.resolve({ data: [], count: 0, error: null }),
          limit: () => Promise.resolve({ data: [], count: 0, error: null }),
          gte: () => ({
            lte: () => Promise.resolve({ data: [], count: 0, error: null }),
            lt: () => Promise.resolve({ data: [], count: 0, error: null }),
          }),
        }),
      };
    });

    const kpis = await fetchDashboardKpis();
    expect(kpis.totalCampaigns).toBe(0);
    expect(kpis.activeCampaigns).toBe(0);
    expect(kpis.candidateCount).toBe(0);
    expect(kpis.candidateCreatedAt).toEqual([]);
    expect(kpis.cityDistribution).toEqual([]);
    expect(kpis.pipelineStages.screening).toBe(0);
    expect(kpis.pipelineStages.round1).toBe(0);
    expect(mockDelete).toHaveBeenCalledWith("candidates");
  });

  it("returns empty upcoming interviews when 0 campaigns exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
        };
      }
      if (table === "round_instances") {
        return {
          select: () => ({
            gte: () => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [{ id: "ri_1", candidate_id: "c_1", campaign_id: "deleted_camp" }],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    });

    const upcoming = await fetchUpcomingInterviews();
    expect(upcoming).toEqual([]);
  });

  it("returns empty ledger when 0 campaigns exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
        };
      }
      if (table === "round_instances") {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
        };
      }
      if (table === "decision_ledger") {
        return {
          select: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: [{ id: "dl_1", candidate_id: "c_1", score: 85 }],
                  error: null,
                }),
            }),
          }),
        };
      }
      return { select: () => Promise.resolve({ data: [], error: null }) };
    });

    const ledger = await fetchLedger();
    expect(ledger).toEqual([]);
  });
});
