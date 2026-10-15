import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { verifyWebhookSignature } from "@/lib/razorpay";

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
    const signature = req.headers.get("x-razorpay-signature");
    const rawBody = await req.text();

    if (!signature) {
      return NextResponse.json({ error: "Missing x-razorpay-signature header." }, { status: 400 });
    }

    // Verify webhook signature if secret is configured
    if (process.env.RAZORPAY_WEBHOOK_SECRET) {
      const isValid = verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.warn("[Razorpay Webhook] Invalid webhook signature.");
        return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
      }
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const subscriptionEntity =
      payload.payload?.subscription?.entity || payload.payload?.payment?.entity?.subscription_id
        ? payload.payload?.subscription?.entity
        : null;

    const subscriptionId =
      subscriptionEntity?.id ||
      payload.payload?.payment?.entity?.subscription_id ||
      payload.payload?.subscription_id;

    const accountIdFromNotes = subscriptionEntity?.notes?.account_id;
    const tierFromNotes = subscriptionEntity?.notes?.tier;

    console.log(`[Razorpay Webhook] Received event: ${event}`, {
      subscriptionId,
      accountId: accountIdFromNotes,
      tier: tierFromNotes,
    });

    const adminSupabase = getAdminSupabase();

    switch (event) {
      case "subscription.activated":
      case "subscription.authenticated": {
        const updateData: Record<string, unknown> = {
          billing_status: "active",
        };
        if (tierFromNotes) {
          updateData.tier = tierFromNotes;
        }
        if (subscriptionEntity?.current_end) {
          updateData.next_billing_date = new Date(
            subscriptionEntity.current_end * 1000,
          ).toISOString();
        }

        if (accountIdFromNotes) {
          await adminSupabase.from("accounts").update(updateData).eq("id", accountIdFromNotes);
        } else if (subscriptionId) {
          await adminSupabase
            .from("accounts")
            .update(updateData)
            .eq("razorpay_subscription_id", subscriptionId);
        }
        break;
      }

      case "subscription.charged": {
        // Renewal cycle succeeded
        const currentEnd = subscriptionEntity?.current_end;
        const updateData: Record<string, unknown> = {
          billing_status: "active",
        };

        if (currentEnd) {
          updateData.next_billing_date = new Date(currentEnd * 1000).toISOString();
        }
        if (tierFromNotes) {
          updateData.tier = tierFromNotes;
        }

        if (accountIdFromNotes) {
          await adminSupabase.from("accounts").update(updateData).eq("id", accountIdFromNotes);
        } else if (subscriptionId) {
          await adminSupabase
            .from("accounts")
            .update(updateData)
            .eq("razorpay_subscription_id", subscriptionId);
        }
        break;
      }

      case "subscription.halted":
      case "payment.failed": {
        // Recurring charge failed or subscription halted
        const updateData = { billing_status: "past_due" };
        if (accountIdFromNotes) {
          await adminSupabase.from("accounts").update(updateData).eq("id", accountIdFromNotes);
        } else if (subscriptionId) {
          await adminSupabase
            .from("accounts")
            .update(updateData)
            .eq("razorpay_subscription_id", subscriptionId);
        }
        break;
      }

      case "subscription.cancelled": {
        // Subscription cancelled
        const updateData = { billing_status: "canceled" };
        if (accountIdFromNotes) {
          await adminSupabase.from("accounts").update(updateData).eq("id", accountIdFromNotes);
        } else if (subscriptionId) {
          await adminSupabase
            .from("accounts")
            .update(updateData)
            .eq("razorpay_subscription_id", subscriptionId);
        }
        break;
      }

      case "subscription.resumed": {
        const updateData = { billing_status: "active" };
        if (accountIdFromNotes) {
          await adminSupabase.from("accounts").update(updateData).eq("id", accountIdFromNotes);
        } else if (subscriptionId) {
          await adminSupabase
            .from("accounts")
            .update(updateData)
            .eq("razorpay_subscription_id", subscriptionId);
        }
        break;
      }

      default:
        // Other events (e.g. payment.captured) - acknowledge safely
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[Razorpay Webhook] Processing error:", err);
    // Return 200 so Razorpay does not aggressively retry corrupted or unparseable payloads
    return NextResponse.json({ received: true, note: "logged_with_error" }, { status: 200 });
  }
}
