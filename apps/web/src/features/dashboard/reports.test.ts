import {
  buildFunnelRows,
  reportsSchema,
  sourceEffectivenessRows,
  summarizeTimeToHireCard,
} from "@scalepods/core";
import { describe, expect, it } from "vitest";

describe("buildFunnelRows", () => {
  it("aggregates per-campaign columns into a 5-stage funnel", () => {
    const rows = buildFunnelRows(
      reportsSchema.parse({
        funnel_conversion: [
          {
            entered_stage_1: 100,
            passed_any_round: 60,
            reached_human_interview: 40,
            offers_made: 20,
            offers_signed: 10,
          },
          {
            entered_stage_1: 50,
            passed_any_round: 30,
            reached_human_interview: 20,
            offers_made: 10,
            offers_signed: 5,
          },
        ],
      }),
    );

    expect(rows).not.toBeNull();
    expect(rows?.map((r) => r.entered)).toEqual([150, 90, 60, 30, 15]);
    expect(rows?.[0]?.converted).toBe(90);
    expect(rows?.[4]?.converted).toBeUndefined();
  });

  it("returns null without a report-driven funnel", () => {
    expect(buildFunnelRows(reportsSchema.parse({}))).toBeNull();
    expect(buildFunnelRows(reportsSchema.parse({ funnel_conversion: [] }))).toBeNull();
  });
});

describe("summarizeTimeToHireCard", () => {
  it("averages the averages and totals the counts", () => {
    const card = summarizeTimeToHireCard(
      reportsSchema.parse({
        time_to_hire: [
          {
            avg_days_intake_to_offer_signed: 10,
            avg_hours_per_round: 20,
            no_show_count: 2,
            platform_fault_count: 1,
          },
          {
            avg_days_intake_to_offer_signed: 20,
            avg_hours_per_round: 40,
            no_show_count: 3,
            platform_fault_count: 4,
          },
        ],
      }),
    );

    expect(card).toEqual({
      avg_days_intake_to_offer_signed: 15,
      avg_hours_per_round: 30,
      no_show_count: 5,
      platform_fault_count: 5,
    });
  });

  it("returns null when no rows carry the newer metrics", () => {
    expect(summarizeTimeToHireCard(reportsSchema.parse({}))).toBeNull();
    expect(summarizeTimeToHireCard(reportsSchema.parse({ time_to_hire: [] }))).toBeNull();
    expect(
      summarizeTimeToHireCard(reportsSchema.parse({ time_to_hire: [{ stage: "Intake" }] })),
    ).toBeNull();
  });
});

describe("sourceEffectivenessRows", () => {
  it("maps channel rows and derives delivery rate when omitted", () => {
    const rows = sourceEffectivenessRows(
      reportsSchema.parse({
        source_effectiveness: [
          {
            channel: "whatsapp",
            stage: "screening",
            messages_sent: 200,
            delivered: 150,
            fell_back: 50,
          },
          {
            channel: "email",
            messages_sent: 10,
            delivered: 10,
            delivery_rate_pct: 100,
          },
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      channel: "whatsapp",
      stage: "screening",
      messages_sent: 200,
      delivered: 150,
      fell_back: 50,
      delivery_rate_pct: 75,
    });
    expect(rows[1]?.delivery_rate_pct).toBe(100);
  });

  it("falls back to the legacy source label and drops unlabelled rows", () => {
    const rows = sourceEffectivenessRows(
      reportsSchema.parse({
        source_effectiveness: [{ source: "sms", conversations: 4 }, { delivered: 3 }],
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel).toBe("sms");
    expect(rows[0]?.messages_sent).toBe(4);
  });

  it("returns an empty array without source data", () => {
    expect(sourceEffectivenessRows(reportsSchema.parse({}))).toEqual([]);
    expect(sourceEffectivenessRows(reportsSchema.parse({ source_effectiveness: [] }))).toEqual([]);
  });
});
