import { describe, expect, it } from "vitest";
import { cadenceForTier, tierEntitlementReason, voiceScreeningEnabledForTier } from "./cadence";
import { effectiveGranted, PLANS } from "./plans";
import {
  limitLabel,
  overageAllowed,
  overageNotice,
  roundTypeAllowed,
  roundTypeLimitLabel,
  TIER_LIMITS,
  TIER_ORDER,
  type Tier,
  tierAtLeast,
} from "./tier";
import type { RoundType } from "./types";

describe("Multi-Tier Comprehensive Matrix Testing", () => {
  const _ALL_TIERS: Tier[] = ["free", "basic", "growth", "enterprise"];
  const ALL_ROUND_TYPES: RoundType[] = [
    "ai_interview",
    "human_interview",
    "assignment",
    "ai_voice_call",
  ];

  describe("Tier Order & Progression", () => {
    it("orders tiers correctly from free to enterprise", () => {
      expect(TIER_ORDER).toEqual(["free", "basic", "growth", "enterprise"]);
    });

    it("evaluates tierAtLeast correctly across all combinations", () => {
      expect(tierAtLeast("free", "free")).toBe(true);
      expect(tierAtLeast("free", "basic")).toBe(false);
      expect(tierAtLeast("basic", "free")).toBe(true);
      expect(tierAtLeast("basic", "basic")).toBe(true);
      expect(tierAtLeast("basic", "growth")).toBe(false);
      expect(tierAtLeast("growth", "basic")).toBe(true);
      expect(tierAtLeast("growth", "growth")).toBe(true);
      expect(tierAtLeast("growth", "enterprise")).toBe(false);
      expect(tierAtLeast("enterprise", "growth")).toBe(true);
      expect(tierAtLeast("enterprise", "enterprise")).toBe(true);
    });
  });

  describe("Tier: FREE", () => {
    const tier: Tier = "free";
    const limits = TIER_LIMITS[tier];
    const plan = PLANS[tier];

    it("enforces campaign and stage caps", () => {
      expect(limits.activeCampaigns).toBe(1);
      expect(limits.maxRounds).toBe(2);
      expect(plan.activeCampaigns).toBe(1);
      expect(plan.roundsPerCampaign).toBe(2);
    });

    it("enforces hard_stop overage behavior", () => {
      expect(limits.overageBehavior).toBe("hard_stop");
      expect(overageAllowed(tier)).toBe(false);
      expect(overageNotice(tier, "activeCampaigns")).toBeNull();
    });

    it("blocks ai_voice_call and assignment round types", () => {
      expect(roundTypeAllowed(tier, "ai_voice_call")).toBe(false);
      expect(roundTypeAllowed(tier, "assignment")).toBe(false);
      expect(roundTypeAllowed(tier, "ai_interview")).toBe(true);
      expect(roundTypeAllowed(tier, "human_interview")).toBe(true);
      expect(roundTypeLimitLabel("ai_voice_call")).toBe("Available on Basic+");
      expect(roundTypeLimitLabel("assignment")).toBe("Available on Growth+");
    });

    it("suppresses WhatsApp channel in cadence on Free tier", () => {
      expect(limits.whatsapp).toBe(false);
      expect(limits.voiceScreening).toBe(false);
      expect(voiceScreeningEnabledForTier(tier)).toBe(false);
      expect(tierEntitlementReason(tier, "whatsapp")).toBe("WhatsApp requires the Basic tier");

      const rendered = cadenceForTier(tier, "ai_interview");
      // All rendered stages should only include email channel
      for (const row of rendered) {
        expect(row.channels).not.toContain("whatsapp");
      }
    });

    it("enforces 7-day retention window", () => {
      expect(limits.retentionDays).toBe(7);
      expect(plan.mediaRetentionDays).toBe(7);
    });

    it("specifies 0 offer letters per month", () => {
      expect(limits.offersPerMonth).toBe(0);
      expect(plan.offerLettersPerMonth).toBe(0);
    });
  });

  describe("Tier: BASIC", () => {
    const tier: Tier = "basic";
    const limits = TIER_LIMITS[tier];
    const plan = PLANS[tier];

    it("allows up to 3 active campaigns and 4 rounds", () => {
      expect(limits.activeCampaigns).toBe(3);
      expect(limits.maxRounds).toBe(4);
      expect(plan.activeCampaigns).toBe(3);
      expect(plan.roundsPerCampaign).toBe(4);
    });

    it("enforces hard_stop overage behavior", () => {
      expect(limits.overageBehavior).toBe("hard_stop");
      expect(overageAllowed(tier)).toBe(false);
    });

    it("unlocks ai_voice_call (20 credits) but blocks assignment", () => {
      expect(roundTypeAllowed(tier, "ai_voice_call")).toBe(true);
      expect(roundTypeAllowed(tier, "assignment")).toBe(false);
      expect(limits.aiVoiceScreening).toBe(20);
      expect(plan.aiVoiceScreeningCreditsIncluded).toBe(20);
    });

    it("unlocks WhatsApp channel in cadence on Basic+", () => {
      expect(limits.whatsapp).toBe(true);
      expect(limits.voiceScreening).toBe(true);
      expect(voiceScreeningEnabledForTier(tier)).toBe(true);
      expect(tierEntitlementReason(tier, "whatsapp")).toBeNull();

      const rendered = cadenceForTier(tier, "ai_interview");
      const shortlist = rendered.find((r) => r.stage.key === "shortlist");
      expect(shortlist?.channels).toContain("email");
      expect(shortlist?.channels).toContain("whatsapp");
    });

    it("enforces 30-day retention window", () => {
      expect(limits.retentionDays).toBe(30);
      expect(plan.mediaRetentionDays).toBe(30);
    });

    it("allows 5 offer letters per month", () => {
      expect(limits.offersPerMonth).toBe(5);
      expect(plan.offerLettersPerMonth).toBe(5);
    });
  });

  describe("Tier: GROWTH", () => {
    const tier: Tier = "growth";
    const limits = TIER_LIMITS[tier];
    const plan = PLANS[tier];

    it("allows up to 25 campaigns and 6 rounds with metered overage", () => {
      expect(limits.activeCampaigns).toBe(25);
      expect(limits.maxRounds).toBe(6);
      expect(limits.overageBehavior).toBe("metered");
      expect(overageAllowed(tier)).toBe(true);
      expect(overageNotice(tier, "activeCampaigns")).toContain(
        "Over your included 25 active campaigns",
      );
    });

    it("unlocks all 4 round types including assignment", () => {
      for (const rt of ALL_ROUND_TYPES) {
        expect(roundTypeAllowed(tier, rt)).toBe(true);
      }
      expect(limits.assignment).toBe(true);
      expect(limits.aiVoiceScreening).toBe(100);
      expect(plan.aiVoiceScreeningCreditsIncluded).toBe(100);
    });

    it("unlocks unlimited resume screening", () => {
      expect(limits.resumesScreened).toBeNull();
      expect(plan.resumesPerMonth).toBeNull();
      expect(limitLabel(limits.resumesScreened)).toBe("Unlimited");
    });

    it("enforces 90-day retention window and custom identity", () => {
      expect(limits.retentionDays).toBe(90);
      expect(limits.customIdentity).toBe(true);
    });

    it("allows 50 offer letters per month", () => {
      expect(limits.offersPerMonth).toBe(50);
      expect(plan.offerLettersPerMonth).toBe(50);
    });
  });

  describe("Tier: ENTERPRISE", () => {
    const tier: Tier = "enterprise";
    const limits = TIER_LIMITS[tier];
    const plan = PLANS[tier];

    it("provides unlimited allocations across campaigns, rounds, and screens", () => {
      expect(limits.activeCampaigns).toBeNull();
      expect(limits.resumesScreened).toBeNull();
      expect(limits.aiInterview).toBeNull();
      expect(limits.aiVoiceScreening).toBeNull();
      expect(limits.scheduledRound).toBeNull();
      expect(limits.offersPerMonth).toBeNull();
      expect(limitLabel(limits.activeCampaigns)).toBe("Unlimited");
      expect(limitLabel(limits.offersPerMonth)).toBe("Unlimited");
    });

    it("unlocks all channels including SMS", () => {
      expect(limits.whatsapp).toBe(true);
      expect(limits.voiceScreening).toBe(true);
      expect(limits.sms).toBe(true);
      expect(plan.reachOutChannels).toContain("sms");
    });

    it("enforces 365-day retention window", () => {
      expect(limits.retentionDays).toBe(365);
      expect(limits.customIdentity).toBe(true);
    });
  });

  describe("Credit Grant Calculations across Tiers", () => {
    it("correctly calculates effective granted credits with rollover and top-up", () => {
      // Basic plan: 50 AI interview credits included + 5 rolled over + 20 purchased = 75
      const basicEffective = effectiveGranted(PLANS.basic, "ai_interview", {
        used: 10,
        rolled_over: 5,
        purchased: 20,
      });
      expect(basicEffective).toBe(75);

      // Free plan: 0 voice screening credits + 0 rolled over = 0
      const freeVoice = effectiveGranted(PLANS.free, "ai_voice_screening", undefined);
      expect(freeVoice).toBe(0);

      // Enterprise: unlimited returns null
      const entInterview = effectiveGranted(PLANS.enterprise, "ai_interview", { purchased: 100 });
      expect(entInterview).toBeNull();
    });
  });
});
