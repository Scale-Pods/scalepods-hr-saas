import { describe, expect, it } from "vitest";
import { reportsSchema } from "./schemas";
import {
  buildFunnelRows,
  summarizeTimeToHire,
  sourceRows,
} from "./reports";

/** Exact payload captured from the deployed `/webhook/reports` (2026-09-19). */
const LIVE_REPORTS = {
  usage: {
    ai_interview: { granted: 1, used: 0, balance: 1 },
    ai_voice_screening: { granted: 0, used: 0, balance: 0 },
    scheduled_round: { granted: 0, used: 0, balance: 0 },
  },
  funnel_conversion: [
    {
      account_id: "f61c92a2-9011-44a7-ae4c-86187f07ef39",
      campaign_id: "ec8ce638-f00e-44e6-9b5a-91dedc6092d0",
      campaign_name: "AI Automation Intern",
      entered_stage_1: 0,
      passed_any_round: 0,
      reached_human_interview: 0,
      offers_made: 0,
      offers_signed: 0,
      intake_to_signed_pct: null,
    },
  ],
  time_to_hire: [],
  source_effectiveness: [],
};

describe("reports schema vs live backend", () => {
  it("parses the exact deployed payload without throwing", () => {
    expect(() => reportsSchema.parse(LIVE_REPORTS)).not.toThrow();
  });

  it("keeps usage data readable after a parse", () => {
    const parsed = reportsSchema.parse(LIVE_REPORTS);
    expect(parsed.usage?.ai_interview).toMatchObject({ granted: 1, used: 0, balance: 1 });
  });

  it("no longer requires legacy funnel fields (stage/entered/converted)", () => {
    const legacyShaped = reportsSchema.parse(LIVE_REPORTS);
    expect(legacyShaped.funnel_conversion?.[0]).toMatchObject({ entered_stage_1: 0 });
  });
});

describe("buildFunnelRows", () => {
  it("aggregates per-campaign stage columns into a 5-stage funnel", () => {
    const rows = buildFunnelRows(
      reportsSchema.parse({
        funnel_conversion: [
          { campaign_name: "A", entered_stage_1: 10, passed_any_round: 6, reached_human_interview: 3, offers_made: 2, offers_signed: 1 },
          { campaign_name: "B", entered_stage_1: 5, passed_any_round: 2, reached_human_interview: 1, offers_made: 0, offers_signed: 0 },
        ],
      })
    );
    expect(rows).toEqual([
      { stage: "Intake", entered: 15, converted: 8 },
      { stage: "Any round passed", entered: 8, converted: 4 },
      { stage: "Human interview", entered: 4, converted: 2 },
      { stage: "Offers made", entered: 2, converted: 1 },
      { stage: "Offers signed", entered: 1 },
    ]);
  });

  it("returns null when no funnel report is present so the DB fallback wins", () => {
    expect(buildFunnelRows(reportsSchema.parse({}))).toBeNull();
    expect(buildFunnelRows(reportsSchema.parse({ funnel_conversion: [] }))).toBeNull();
  });

  it("tolerates partial rows and missing stage keys", () => {
    const rows = buildFunnelRows(reportsSchema.parse({ funnel_conversion: [{ campaign_name: "X" }] }));
    expect(rows?.[0]).toEqual({ stage: "Intake", entered: 0, converted: 0 });
  });
});

describe("summarizeTimeToHire", () => {
  it("returns null for the deployed empty array", () => {
    expect(summarizeTimeToHire(reportsSchema.parse({ time_to_hire: [] }))).toBeNull();
    expect(summarizeTimeToHire(reportsSchema.parse({}))).toBeNull();
  });

  it("averages per-stage slices when present", () => {
    const summary = summarizeTimeToHire(
      reportsSchema.parse({
        time_to_hire: [
          { stage: "a", median_days: 10, average_days: 12, hires: 2, outlier_entries: 1 },
          { stage: "b", median_days: 20, average_days: 20, hires: 3 },
        ],
      })
    );
    expect(summary).toMatchObject({ median_days: 15, average_days: 16, hires: 5, outlier_entries: 1 });
  });
});

describe("sourceRows", () => {
  it("returns an empty list for the deployed empty array", () => {
    expect(sourceRows(reportsSchema.parse({ source_effectiveness: [] }))).toEqual([]);
  });

  it("filters out rows without a usable source label", () => {
    const rows = sourceRows(
      reportsSchema.parse({
        source_effectiveness: [
          { source: "linkedin", conversations: 4, offers: 1, rate: 25 },
          { offers: 2, rate: null } as never,
          { source: "", conversations: 1, offers: 0, rate: 0 },
        ],
      })
    );
    expect(rows).toEqual([{ source: "linkedin", conversations: 4, offers: 1, rate: 25 }]);
  });
});