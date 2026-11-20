import { describe, expect, it } from "vitest";
import {
  extractDomain,
  getMaxAccountsForTier,
  isBlockedConsumerDomain,
  isDomainExempt,
  validateRecruiterEmail,
} from "./domain-restrictions";

describe("Domain restrictions & anti-abuse policies", () => {
  describe("extractDomain", () => {
    it("extracts and normalizes domain from email", () => {
      expect(extractDomain("Alice@Acme.COM")).toBe("acme.com");
      expect(extractDomain("bob@hr.scalepods.co")).toBe("hr.scalepods.co");
      expect(extractDomain("  test@domain.org  ")).toBe("domain.org");
      expect(extractDomain("domain.com")).toBe("domain.com");
    });
  });

  describe("isDomainExempt", () => {
    it("exempts scalepods.co and its subdomains", () => {
      expect(isDomainExempt("scalepods.co")).toBe(true);
      expect(isDomainExempt("user@scalepods.co")).toBe(true);
      expect(isDomainExempt("admin@eng.scalepods.co")).toBe(true);
      expect(isDomainExempt("scalepods.com")).toBe(false);
      expect(isDomainExempt("acme.com")).toBe(false);
    });
  });

  describe("isBlockedConsumerDomain", () => {
    it("flags consumer webmail domains as blocked", () => {
      expect(isBlockedConsumerDomain("gmail.com")).toBe(true);
      expect(isBlockedConsumerDomain("john@yahoo.com")).toBe(true);
      expect(isBlockedConsumerDomain("user@hotmail.com")).toBe(true);
      expect(isBlockedConsumerDomain("test@tempmail.com")).toBe(true);
    });

    it("allows valid company domains and exempt domains", () => {
      expect(isBlockedConsumerDomain("acme.com")).toBe(false);
      expect(isBlockedConsumerDomain("stripe.com")).toBe(false);
      expect(isBlockedConsumerDomain("scalepods.co")).toBe(false);
    });
  });

  describe("validateRecruiterEmail", () => {
    it("accepts scalepods.co as exempt", () => {
      const res = validateRecruiterEmail("founder@scalepods.co");
      expect(res.allowed).toBe(true);
      expect(res.isExempt).toBe(true);
      expect(res.domain).toBe("scalepods.co");
    });

    it("rejects gmail and other consumer emails", () => {
      const res = validateRecruiterEmail("recruiter@gmail.com");
      expect(res.allowed).toBe(false);
      expect(res.isExempt).toBe(false);
      expect(res.code).toBe("BLOCKED_CONSUMER");
      expect(res.reason).toContain("Personal email providers like Gmail");
    });

    it("accepts corporate company emails", () => {
      const res = validateRecruiterEmail("sarah@microsoft-partner.com");
      expect(res.allowed).toBe(true);
      expect(res.isExempt).toBe(false);
      expect(res.domain).toBe("microsoft-partner.com");
    });

    it("rejects malformed email strings", () => {
      expect(validateRecruiterEmail("not-an-email").allowed).toBe(false);
      expect(validateRecruiterEmail("").allowed).toBe(false);
    });
  });

  describe("getMaxAccountsForTier", () => {
    it("returns 3 accounts for Free and Basic plans", () => {
      expect(getMaxAccountsForTier("free")).toBe(3);
      expect(getMaxAccountsForTier("basic")).toBe(3);
      expect(getMaxAccountsForTier("FREE")).toBe(3);
    });

    it("returns 5 accounts for Growth plan", () => {
      expect(getMaxAccountsForTier("growth")).toBe(5);
      expect(getMaxAccountsForTier("GROWTH")).toBe(5);
    });

    it("returns 10 accounts for Enterprise plan", () => {
      expect(getMaxAccountsForTier("enterprise")).toBe(10);
      expect(getMaxAccountsForTier("ENTERPRISE")).toBe(10);
    });

    it("defaults to 3 accounts for unknown or null tiers", () => {
      expect(getMaxAccountsForTier(null)).toBe(3);
      expect(getMaxAccountsForTier(undefined)).toBe(3);
      expect(getMaxAccountsForTier("unknown")).toBe(3);
    });
  });
});
