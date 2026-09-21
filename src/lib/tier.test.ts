import { describe, expect, it } from "vitest";
import {
  TIER_LIMITS,
  tierAtLeast,
  tierFor,
  roundTypeAllowed,
  roundTypeLimitLabel,
  limitLabel,
  usagePercent,
  overageAllowed,
  overageNotice,
} from "./tier";

describe("tier gating", () => {
  it("orders tiers and enforces at-least comparisons", () => {
    expect(tierAtLeast("growth", "basic")).toBe(true);
    expect(tierAtLeast("basic", "growth")).toBe(false);
    expect(tierAtLeast("free", "free")).toBe(true);
    expect(tierAtLeast("enterprise", "enterprise")).toBe(true);
  });

  it("gates assignment rounds behind Growth+", () => {
    expect(roundTypeAllowed("free", "assignment")).toBe(false);
    expect(roundTypeAllowed("basic", "assignment")).toBe(false);
    expect(roundTypeAllowed("growth", "assignment")).toBe(true);
    expect(roundTypeAllowed("enterprise", "assignment")).toBe(true);
  });

  it("never gates the base interview round types", () => {
    for (const tier of ["free", "basic", "growth", "enterprise"] as const) {
      expect(roundTypeAllowed(tier, "ai_interview")).toBe(true);
      expect(roundTypeAllowed(tier, "human_interview")).toBe(true);
    }
  });

  it("labels the assignment gate for UI copy", () => {
    expect(roundTypeLimitLabel("assignment")).toContain("Growth");
    expect(roundTypeLimitLabel("ai_interview")).toBeNull();
  });

  it("exposes placeholder limits per tier", () => {
    expect(TIER_LIMITS.free.maxRounds).toBe(2);
    expect(TIER_LIMITS.enterprise.aiInterview).toBeNull();
    expect(limitLabel(TIER_LIMITS.enterprise.resumesScreened)).toBe("Unlimited");
    expect(limitLabel(TIER_LIMITS.free.aiInterview)).toBe("10");
    expect(TIER_LIMITS.growth.activeCampaigns).toBe(25);
  });

  it("computes usage percentages clamped to 100", () => {
    expect(usagePercent(5, 10)).toBe(50);
    expect(usagePercent(15, 10)).toBe(100);
    expect(usagePercent(3, null)).toBeNull();
    expect(usagePercent(3, 0)).toBeNull();
  });

  it("exposes channel entitlements", () => {
    expect(tierFor("free").whatsapp).toBe(false);
    expect(tierFor("basic").whatsapp).toBe(true);
    expect(tierFor("free").voiceScreening).toBe(false);
    expect(tierFor("growth").voiceScreening).toBe(true);
  });

  it("marks only growth as metered overage (PATCH 3)", () => {
    expect(overageAllowed("free")).toBe(false);
    expect(overageAllowed("basic")).toBe(false);
    expect(overageAllowed("enterprise")).toBe(false);
    expect(overageAllowed("growth")).toBe(true);
    for (const tier of ["free", "basic", "growth", "enterprise"] as const) {
      expect(TIER_LIMITS[tier].overageBehavior).toBeDefined();
    }
  });

  it("returns billed-overage notice only for metered tiers", () => {
    expect(overageNotice("growth", "activeCampaigns")).toContain("25 active campaigns");
    expect(overageNotice("growth", "maxRounds")).toContain("6 rounds per campaign");
    expect(overageNotice("free", "activeCampaigns")).toBeNull();
    expect(overageNotice("enterprise", "maxRounds")).toBeNull();
  });
});