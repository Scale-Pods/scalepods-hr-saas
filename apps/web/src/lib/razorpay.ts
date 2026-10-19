import crypto from "node:crypto";
import Razorpay from "razorpay";

export type SubscriptionTier = "basic" | "growth" | "enterprise";

export interface PlanConfig {
  name: string;
  testAmountPaise: number;
  prodAmountCents: number;
  description: string;
}

export const PLAN_CONFIGS: Record<SubscriptionTier, PlanConfig> = {
  basic: {
    name: "ScalePods Basic Plan",
    testAmountPaise: 100, // ₹1
    prodAmountCents: 14900, // $149
    description:
      "ScalePods Basic Subscription - 250 resume screens, 50 AI interviews, WhatsApp notifications",
  },
  growth: {
    name: "ScalePods Growth Plan",
    testAmountPaise: 200, // ₹2
    prodAmountCents: 34900, // $349
    description:
      "ScalePods Growth Subscription - Unlimited screens, 200 AI interviews, metered usage, custom identity",
  },
  enterprise: {
    name: "ScalePods Enterprise Plan",
    testAmountPaise: 300, // ₹3
    prodAmountCents: 109900, // $1099
    description:
      "ScalePods Enterprise Subscription - Custom limits, dedicated CSM, full custom cadence",
  },
};

let razorpayInstance: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay API keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.",
    );
  }

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return razorpayInstance;
}

/**
 * Returns the effective currency and amount for a given tier.
 */
export function getTierPricing(tier: SubscriptionTier): { currency: string; amount: number } {
  const envCurrency = (
    process.env.RAZORPAY_CURRENCY ||
    process.env.NEXT_PUBLIC_RAZORPAY_CURRENCY ||
    "INR"
  ).toUpperCase();

  const config = PLAN_CONFIGS[tier];

  if (!config) {
    throw new Error(`Invalid subscription tier: ${tier}`);
  }

  // By default, if RAZORPAY_TEST_PRICES is not explicitly "false", or if currency is INR,
  // we enforce the ₹1, ₹2, ₹3 test pricing in INR.
  const isTestMode = process.env.RAZORPAY_TEST_PRICES !== "false";
  const currency = isTestMode ? "INR" : envCurrency;

  const amount = currency === "INR" ? config.testAmountPaise : config.prodAmountCents;

  return { currency, amount };
}

const planCache = new Map<string, string>();

/**
 * Resolves an existing Razorpay Plan ID from environment variables,
 * or retrieves/creates the plan via the Razorpay API if not yet present.
 */
export async function getOrCreateSubscriptionPlan(tier: SubscriptionTier): Promise<string> {
  const { currency, amount } = getTierPricing(tier);
  const isTestMode = process.env.RAZORPAY_TEST_PRICES !== "false";

  // Check explicit plan ID if provided in env
  const envVarName = `RAZORPAY_PLAN_${tier.toUpperCase()}_ID`;
  const explicitPlanId = process.env[envVarName];

  // In test mode (default ₹1, ₹2, ₹3), bypass legacy explicit plan IDs unless configured for test
  if (!isTestMode && explicitPlanId?.trim().startsWith("plan_")) {
    return explicitPlanId.trim();
  }

  const cacheKey = `${tier}_${currency}_${amount}`;
  const cached = planCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const razorpay = getRazorpayClient();
  const planInfo = PLAN_CONFIGS[tier];
  const formattedPrice = currency === "INR" ? `₹${amount / 100}` : `$${amount / 100}`;
  const planDisplayName = `${planInfo.name} (${formattedPrice}/mo)`;

  // Check if a plan with matching currency and amount already exists
  try {
    const existingPlans = await razorpay.plans.all({ count: 50 });
    const match = existingPlans.items?.find(
      (p: { item?: { name?: string; amount?: string | number; currency?: string } }) =>
        (p.item?.name === planDisplayName || p.item?.name === planInfo.name) &&
        Number(p.item?.amount) === amount &&
        p.item?.currency === currency,
    );

    if (match && (match as { id: string }).id) {
      const foundId = (match as { id: string }).id;
      planCache.set(cacheKey, foundId);
      return foundId;
    }
  } catch (err) {
    console.warn("[Razorpay] Could not query existing plans, creating new plan:", err);
  }

  // Create plan dynamically on Razorpay
  const newPlan = (await razorpay.plans.create({
    period: "monthly",
    interval: 1,
    item: {
      name: planDisplayName,
      amount,
      currency,
      description: `${planInfo.description} - ${formattedPrice}/mo`,
    },
    notes: {
      tier,
      platform: "scalepods",
      amount_formatted: formattedPrice,
    },
  })) as { id: string };

  planCache.set(cacheKey, newPlan.id);
  return newPlan.id;
}

/**
 * Verifies Razorpay subscription checkout payment signature.
 */
export function verifySubscriptionSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const body = `${paymentId}|${subscriptionId}`;
  const expectedSignature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay Webhook signature against raw payload.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;

  const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    return false;
  }
}
