import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  getTierPricing,
  PLAN_CONFIGS,
  verifySubscriptionSignature,
  verifyWebhookSignature,
} from "@/lib/razorpay";

describe("Razorpay Integration", () => {
  it("provides correct test pricing in INR (₹1, ₹2, ₹3)", () => {
    process.env.RAZORPAY_TEST_PRICES = "true";
    process.env.RAZORPAY_CURRENCY = "INR";

    const basic = getTierPricing("basic");
    expect(basic.currency).toBe("INR");
    expect(basic.amount).toBe(100); // 100 paise = ₹1

    const growth = getTierPricing("growth");
    expect(growth.currency).toBe("INR");
    expect(growth.amount).toBe(200); // 200 paise = ₹2

    const enterprise = getTierPricing("enterprise");
    expect(enterprise.currency).toBe("INR");
    expect(enterprise.amount).toBe(300); // 300 paise = ₹3
  });

  it("has production pricing configured properly ($149, $349, $1099)", () => {
    expect(PLAN_CONFIGS.basic.prodAmountCents).toBe(14900); // $149
    expect(PLAN_CONFIGS.growth.prodAmountCents).toBe(34900); // $349
    expect(PLAN_CONFIGS.enterprise.prodAmountCents).toBe(109900); // $1099
  });

  it("verifies subscription payment signature accurately", () => {
    process.env.RAZORPAY_KEY_SECRET = "test_secret_12345";
    const paymentId = "pay_test_001";
    const subId = "sub_test_001";

    const expectedSig = crypto
      .createHmac("sha256", "test_secret_12345")
      .update(`${paymentId}|${subId}`)
      .digest("hex");

    expect(verifySubscriptionSignature(paymentId, subId, expectedSig)).toBe(true);
    expect(verifySubscriptionSignature(paymentId, subId, "bad_signature")).toBe(false);
  });

  it("verifies webhook signature accurately", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_999";
    const payload = JSON.stringify({ event: "subscription.charged", id: "evt_123" });

    const expectedSig = crypto
      .createHmac("sha256", "webhook_secret_999")
      .update(payload)
      .digest("hex");

    expect(verifyWebhookSignature(payload, expectedSig)).toBe(true);
    expect(verifyWebhookSignature(payload, "invalid_sig")).toBe(false);
  });
});
