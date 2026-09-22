import { describe, expect, it } from "vitest";
import { effectiveGranted, PLANS } from "./plans";

describe("PLANS authoritative plan table", () => {
  it("treats Enterprise AI/voice/scheduled allowances as unlimited", () => {
    expect(PLANS.enterprise.aiInterviewCreditsIncluded).toBeNull();
    expect(PLANS.enterprise.aiVoiceScreeningCreditsIncluded).toBeNull();
    expect(PLANS.enterprise.scheduledRoundsPerMonth).toBeNull();
    expect(PLANS.enterprise.overageBehavior).toBe("committed_volume");
  });

  it("mirrors the Section 4.1 values for the other tiers", () => {
    expect(PLANS.free.aiInterviewCreditsIncluded).toBe(1);
    expect(PLANS.basic.aiInterviewCreditsIncluded).toBe(10);
    expect(PLANS.growth.aiInterviewCreditsIncluded).toBe(100);
    expect(PLANS.growth.aiVoiceScreeningCreditsIncluded).toBe(300);
    expect(PLANS.growth.scheduledRoundsPerMonth).toBe(250);
    expect(PLANS.growth.overageBehavior).toBe("metered");
    expect(PLANS.basic.activeCampaigns).toBe(5);
    expect(PLANS.enterprise.roundTypesAvailable).toContain("custom");
    expect(PLANS.free.aiInterviewRollover).toBe(false);
  });
});

describe("effectiveGranted", () => {
  it("returns null (unlimited) when the plan allowance is null, ignoring n8n granted", () => {
    expect(effectiveGranted(PLANS.enterprise, "ai_interview", { used: 1, granted: 1 })).toBeNull();
  });

  it("starts from the plan allowance and ignores n8n granted", () => {
    expect(effectiveGranted(PLANS.free, "ai_interview", { used: 1, granted: 999 })).toBe(1);
  });

  it("adds rolled_over and purchased to the allowance", () => {
    expect(
      effectiveGranted(PLANS.growth, "ai_interview", {
        used: 4,
        granted: 0,
        rolled_over: 5,
        purchased: 10,
      }),
    ).toBe(115);
  });

  it("defaults missing rollover/purchase to 0", () => {
    expect(effectiveGranted(PLANS.basic, "scheduled_round", undefined)).toBe(100);
  });
});
