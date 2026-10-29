import { TIER_LIMITS, type Tier, tierAtLeast } from "@scalepods/core";
import { describe, expect, it } from "vitest";
import { PLAN_CONFIGS } from "@/lib/razorpay";

describe("Multi-Tier System & Enforcement Tests", () => {
  describe("Active Campaign Limits", () => {
    function simulateCampaignLimitCheck(
      tier: Tier,
      openCount: number,
    ): { allowed: boolean; isMetered: boolean; message?: string } {
      const tierConfig = TIER_LIMITS[tier];
      const limit = tierConfig.activeCampaigns;

      if (limit === null) return { allowed: true, isMetered: false };
      if (openCount < limit) return { allowed: true, isMetered: false };
      if (tierConfig.overageBehavior === "metered") {
        return {
          allowed: true,
          isMetered: true,
          message: `Over your included ${limit} active campaigns - extra usage will be billed.`,
        };
      }
      return {
        allowed: false,
        isMetered: false,
        message: `Your ${tierConfig.label} plan allows up to ${limit} open campaigns. Close an existing campaign or upgrade your plan.`,
      };
    }

    it("Free tier allows 0 open campaigns to create 1st, but blocks 2nd", () => {
      expect(simulateCampaignLimitCheck("free", 0)).toEqual({
        allowed: true,
        isMetered: false,
      });

      const blocked = simulateCampaignLimitCheck("free", 1);
      expect(blocked.allowed).toBe(false);
      expect(blocked.message).toContain("allows up to 1 open campaigns");
    });

    it("Basic tier allows up to 3 open campaigns, blocks 4th", () => {
      expect(simulateCampaignLimitCheck("basic", 0).allowed).toBe(true);
      expect(simulateCampaignLimitCheck("basic", 2).allowed).toBe(true);

      const blocked = simulateCampaignLimitCheck("basic", 3);
      expect(blocked.allowed).toBe(false);
      expect(blocked.message).toContain("allows up to 3 open campaigns");
    });

    it("Growth tier allows exceeding 25 campaigns via metered overage", () => {
      expect(simulateCampaignLimitCheck("growth", 10)).toEqual({
        allowed: true,
        isMetered: false,
      });

      const overage = simulateCampaignLimitCheck("growth", 25);
      expect(overage.allowed).toBe(true);
      expect(overage.isMetered).toBe(true);
      expect(overage.message).toContain("extra usage will be billed");
    });

    it("Enterprise tier allows unlimited active campaigns", () => {
      expect(simulateCampaignLimitCheck("enterprise", 100)).toEqual({
        allowed: true,
        isMetered: false,
      });
    });
  });

  describe("Round Clamping & Dropdown Constraints", () => {
    function getAvailableRoundOptions(tier: Tier) {
      const tierConfig = TIER_LIMITS[tier];
      const hardStop = tierConfig.overageBehavior === "hard_stop";
      const maxDisplay = hardStop ? tierConfig.maxRounds : 6;

      return Array.from({ length: maxDisplay }, (_, i) => i + 1).map((n) => ({
        count: n,
        disabled: hardStop && n > tierConfig.maxRounds,
      }));
    }

    it("Free tier restricts selectable rounds to 1 and 2 only", () => {
      const options = getAvailableRoundOptions("free");
      expect(options.length).toBe(2);
      expect(options.map((o) => o.count)).toEqual([1, 2]);
      expect(options.every((o) => !o.disabled)).toBe(true);
    });

    it("Basic tier restricts selectable rounds to 1, 2, 3, and 4", () => {
      const options = getAvailableRoundOptions("basic");
      expect(options.length).toBe(4);
      expect(options.map((o) => o.count)).toEqual([1, 2, 3, 4]);
    });

    it("Growth tier exposes all 6 rounds without hard disable", () => {
      const options = getAvailableRoundOptions("growth");
      expect(options.length).toBe(6);
      expect(options.map((o) => o.count)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(options.every((o) => !o.disabled)).toBe(true);
    });

    it("Enterprise tier exposes all 6 rounds", () => {
      const options = getAvailableRoundOptions("enterprise");
      expect(options.length).toBe(6);
    });
  });

  describe("Round Type Fallback Engine", () => {
    function guardRoundType(tier: Tier, requestedType: string): string {
      const growthPlus = tierAtLeast(tier, "growth");
      const basicPlus = tierAtLeast(tier, "basic");

      if (!growthPlus && requestedType === "assignment") {
        return "ai_interview";
      }
      if (!basicPlus && requestedType === "ai_voice_call") {
        return "ai_interview";
      }
      return requestedType;
    }

    it("Free tier falls back to ai_interview if voice or assignment requested", () => {
      expect(guardRoundType("free", "ai_voice_call")).toBe("ai_interview");
      expect(guardRoundType("free", "assignment")).toBe("ai_interview");
      expect(guardRoundType("free", "ai_interview")).toBe("ai_interview");
      expect(guardRoundType("free", "human_interview")).toBe("human_interview");
    });

    it("Basic tier allows ai_voice_call, but falls back assignment to ai_interview", () => {
      expect(guardRoundType("basic", "ai_voice_call")).toBe("ai_voice_call");
      expect(guardRoundType("basic", "assignment")).toBe("ai_interview");
    });

    it("Growth and Enterprise allow all round types without fallback", () => {
      expect(guardRoundType("growth", "ai_voice_call")).toBe("ai_voice_call");
      expect(guardRoundType("growth", "assignment")).toBe("assignment");
      expect(guardRoundType("enterprise", "ai_voice_call")).toBe("ai_voice_call");
      expect(guardRoundType("enterprise", "assignment")).toBe("assignment");
    });
  });

  describe("Pricing & Razorpay Integrity", () => {
    it("verifies production amounts in PLAN_CONFIGS", () => {
      expect(PLAN_CONFIGS.basic.prodAmountCents).toBe(14900); // $149
      expect(PLAN_CONFIGS.growth.prodAmountCents).toBe(34900); // $349
      expect(PLAN_CONFIGS.enterprise.prodAmountCents).toBe(109900); // $1099
    });

    it("verifies test amounts in paise for sandbox mode", () => {
      expect(PLAN_CONFIGS.basic.testAmountPaise).toBe(100); // ₹1
      expect(PLAN_CONFIGS.growth.testAmountPaise).toBe(200); // ₹2
      expect(PLAN_CONFIGS.enterprise.testAmountPaise).toBe(300); // ₹3
    });
  });

  describe("Offer Letter Gating Analysis", () => {
    it("identifies intended offer letters per month from tier limits", () => {
      expect(TIER_LIMITS.free.offersPerMonth).toBe(0);
      expect(TIER_LIMITS.basic.offersPerMonth).toBe(5);
      expect(TIER_LIMITS.growth.offersPerMonth).toBe(50);
      expect(TIER_LIMITS.enterprise.offersPerMonth).toBeNull();
    });
  });
});
