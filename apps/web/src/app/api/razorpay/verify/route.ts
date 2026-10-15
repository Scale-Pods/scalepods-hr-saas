import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import {
  getRazorpayClient,
  type SubscriptionTier,
  verifySubscriptionSignature,
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
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      tier: requestedTier,
    } = body;

    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing required Razorpay payment response parameters." },
        { status: 400 },
      );
    }

    // 1. Authenticate user
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

    // 2. Verify Cryptographic Signature
    const isValid = verifySubscriptionSignature(
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    );

    if (!isValid) {
      return NextResponse.json(
        { error: "Payment verification failed. Invalid signature." },
        { status: 400 },
      );
    }

    // 3. Fetch subscription details from Razorpay to guarantee correct tier and next billing date
    const razorpay = getRazorpayClient();
    let targetTier: SubscriptionTier = (requestedTier || "basic").toLowerCase() as SubscriptionTier;
    let nextBillingDate: string | null = null;

    try {
      const subDetails = await razorpay.subscriptions.fetch(razorpay_subscription_id);
      if (subDetails?.notes?.tier) {
        targetTier = String(subDetails.notes.tier).toLowerCase() as SubscriptionTier;
      }
      if (subDetails?.current_end) {
        nextBillingDate = new Date(subDetails.current_end * 1000).toISOString();
      }
    } catch (fetchErr) {
      console.warn("[Razorpay] Could not fetch subscription from API:", fetchErr);
    }

    // 4. Activate the user's account in Supabase
    const adminSupabase = getAdminSupabase();
    const updateData: Record<string, unknown> = {
      tier: targetTier,
      billing_status: "active",
      razorpay_subscription_id,
    };

    if (nextBillingDate) {
      updateData.next_billing_date = nextBillingDate;
    }

    const { error: updateErr } = await adminSupabase
      .from("accounts")
      .update(updateData)
      .eq("id", user.id);

    if (updateErr) {
      console.error("[api/razorpay/verify] Account activation update error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tier: targetTier,
      billing_status: "active",
      subscription_id: razorpay_subscription_id,
      next_billing_date: nextBillingDate,
    });
  } catch (error) {
    console.error("[api/razorpay/verify] Verification Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Subscription payment verification failed.",
      },
      { status: 500 },
    );
  }
}
