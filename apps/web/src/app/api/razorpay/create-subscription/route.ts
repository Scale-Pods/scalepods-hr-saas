import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import {
  getOrCreateSubscriptionPlan,
  getRazorpayClient,
  getTierPricing,
  type SubscriptionTier,
} from "@/lib/razorpay";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getAdminSupabase() {
  const env = getEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tier = (body.tier || "").toLowerCase() as SubscriptionTier;

    if (!["basic", "growth", "enterprise"].includes(tier)) {
      return NextResponse.json(
        { error: "Invalid tier. Must be 'basic', 'growth', or 'enterprise'." },
        { status: 400 },
      );
    }

    // 1. Authenticate user via Bearer token or cookies
    const authHeader = req.headers.get("authorization");
    let user = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const env = getEnv();
      const authClient = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { auth: { persistSession: false } },
      );
      const res = await authClient.auth.getUser(token);
      user = res.data.user;
    } else {
      const serverClient = await supabaseServer();
      const res = await serverClient.auth.getUser();
      user = res.data.user;
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminSupabase = getAdminSupabase();

    // 2. Fetch Account details
    const { data: account, error: accErr } = await adminSupabase
      .from("accounts")
      .select("id, name, company_name, email, razorpay_customer_id, tier")
      .eq("id", user.id)
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Downgrades are not permitted via self-serve
    const TIER_HIERARCHY: Record<string, number> = {
      free: 0,
      basic: 1,
      growth: 2,
      enterprise: 3,
    };
    const currentTierRank = TIER_HIERARCHY[account.tier || "free"] ?? 0;
    const targetTierRank = TIER_HIERARCHY[tier] ?? 0;

    if (targetTierRank <= currentTierRank) {
      return NextResponse.json(
        { error: "Plan downgrades are not supported online. Please contact support." },
        { status: 400 },
      );
    }

    const razorpay = getRazorpayClient();
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "";

    // 3. Ensure Razorpay Customer exists
    let customerId = account.razorpay_customer_id;
    const userEmail = account.email || user.email || "";
    const userName =
      account.name || account.company_name || user.user_metadata?.full_name || "ScalePods Customer";

    if (!customerId) {
      try {
        const customer = await razorpay.customers.create({
          name: userName,
          email: userEmail,
          fail_existing: 0,
          notes: { account_id: account.id },
        });
        customerId = customer.id;

        await adminSupabase
          .from("accounts")
          .update({ razorpay_customer_id: customerId })
          .eq("id", account.id);
      } catch (custErr) {
        console.warn("[Razorpay] Customer creation note:", custErr);
      }
    }

    // 4. Resolve or create Razorpay Plan ID for this tier
    const planId = await getOrCreateSubscriptionPlan(tier);
    const { currency, amount } = getTierPricing(tier);

    // 5. Create Razorpay Subscription
    const subscriptionPayload: Record<string, unknown> = {
      plan_id: planId,
      total_count: 12, // 12 monthly cycles
      quantity: 1,
      customer_notify: 1,
      notes: {
        account_id: account.id,
        tier,
      },
    };

    if (customerId) {
      subscriptionPayload.customer_id = customerId;
    }

    const subscription = (await razorpay.subscriptions.create(
      subscriptionPayload as unknown as Parameters<typeof razorpay.subscriptions.create>[0],
    )) as unknown as { id: string };

    // Save pending subscription ID
    await adminSupabase
      .from("accounts")
      .update({
        razorpay_subscription_id: subscription.id,
        subscription_currency: currency,
      })
      .eq("id", account.id);

    return NextResponse.json({
      success: true,
      subscription_id: subscription.id,
      key_id: keyId,
      tier,
      currency,
      amount,
      customer_name: userName,
      customer_email: userEmail,
    });
  } catch (error) {
    console.error("[api/razorpay/create-subscription] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize subscription with Razorpay.",
      },
      { status: 500 },
    );
  }
}
