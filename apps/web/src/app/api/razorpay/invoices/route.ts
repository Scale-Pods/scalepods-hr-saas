import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { getRazorpayClient } from "@/lib/razorpay";
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

export interface RazorpayInvoiceItem {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  date: number; // Unix timestamp in seconds
  description: string;
  url: string | null;
}

export async function GET(req: NextRequest) {
  try {
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

    const adminSupabase = getAdminSupabase();

    // 2. Fetch account razorpay details
    const { data: account, error: accErr } = await adminSupabase
      .from("accounts")
      .select("id, razorpay_customer_id, razorpay_subscription_id")
      .eq("id", user.id)
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const customerId = account.razorpay_customer_id;
    const subscriptionId = account.razorpay_subscription_id;

    if (!customerId && !subscriptionId) {
      return NextResponse.json({ invoices: [] });
    }

    const razorpay = getRazorpayClient();
    const invoiceMap = new Map<string, RazorpayInvoiceItem>();

    // 3. Fetch invoices by customer_id if present
    if (customerId) {
      try {
        const res = (await razorpay.invoices.all({
          customer_id: customerId,
          count: 20,
        })) as unknown as { items?: Array<Record<string, unknown>> };

        for (const inv of res.items || []) {
          const id = String(inv.id || "");
          if (!id) continue;
          const lineItems = (inv.line_items as Array<{ name?: string }>) || [];
          invoiceMap.set(id, {
            id,
            invoice_number: String(inv.invoice_number || inv.id || "Invoice"),
            amount: Number(inv.amount || 0),
            currency: String(inv.currency || "INR").toUpperCase(),
            status: String(inv.status || "issued"),
            date: Number(inv.paid_at || inv.date || inv.issued_at || inv.created_at || 0),
            description: lineItems[0]?.name || String(inv.description || "Subscription invoice"),
            url: typeof inv.short_url === "string" ? inv.short_url : null,
          });
        }
      } catch (err) {
        console.warn("[Razorpay] Customer invoices lookup note:", err);
      }
    }

    // 4. Fetch invoices by subscription_id if present
    if (subscriptionId) {
      try {
        const res = (await razorpay.invoices.all({
          subscription_id: subscriptionId,
          count: 20,
        })) as unknown as { items?: Array<Record<string, unknown>> };

        for (const inv of res.items || []) {
          const id = String(inv.id || "");
          if (!id || invoiceMap.has(id)) continue;
          const lineItems = (inv.line_items as Array<{ name?: string }>) || [];
          invoiceMap.set(id, {
            id,
            invoice_number: String(inv.invoice_number || inv.id || "Invoice"),
            amount: Number(inv.amount || 0),
            currency: String(inv.currency || "INR").toUpperCase(),
            status: String(inv.status || "issued"),
            date: Number(inv.paid_at || inv.date || inv.issued_at || inv.created_at || 0),
            description: lineItems[0]?.name || String(inv.description || "Subscription invoice"),
            url: typeof inv.short_url === "string" ? inv.short_url : null,
          });
        }
      } catch (err) {
        console.warn("[Razorpay] Subscription invoices lookup note:", err);
      }
    }

    // Sort newest date first
    const invoices = Array.from(invoiceMap.values()).sort((a, b) => b.date - a.date);

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("[api/razorpay/invoices] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load invoices." },
      { status: 500 },
    );
  }
}
