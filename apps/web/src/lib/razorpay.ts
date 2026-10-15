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
  const currency = process.env.RAZORPAY_CURRENCY || "USD";
  const config = PLAN_CONFIGS[tier];

  if (!config) {
    throw new Error(`Invalid subscription tier: ${tier}`);
  }

  // Pricing: Basic = $149 (14900 cents), Growth = $349 (34900 cents), Enterprise = $1099 (109900 cents)
  const amount = currency === "INR" ? config.testAmountPaise : config.prodAmountCents;

  return { currency, amount };
}

const planCache = new Map<string, string>();

/**
 * Resolves an existing Razorpay Plan ID from environment variables,
 * or retrieves/creates the plan via the Razorpay API if not yet present.
 */
export async function getOrCreateSubscriptionPlan(tier: SubscriptionTier): Promise<string> {
  const envVarName = `RAZORPAY_PLAN_${tier.toUpperCase()}_ID`;
  const explicitPlanId = process.env[envVarName];

  if (explicitPlanId?.trim().startsWith("plan_")) {
    return explicitPlanId.trim();
  }

  const { currency, amount } = getTierPricing(tier);
  const cacheKey = `${tier}_${currency}_${amount}`;
  const cached = planCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const razorpay = getRazorpayClient();
  const planInfo = PLAN_CONFIGS[tier];

  // Check if a plan with the same name and amount already exists
  try {
    const existingPlans = await razorpay.plans.all({ count: 50 });
    const match = existingPlans.items?.find(
      (p: { item?: { name?: string; amount?: string | number; currency?: string } }) =>
        p.item?.name === planInfo.name &&
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
      name: planInfo.name,
      amount,
      currency,
      description: planInfo.description,
    },
    notes: {
      tier,
      platform: "scalepods",
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
