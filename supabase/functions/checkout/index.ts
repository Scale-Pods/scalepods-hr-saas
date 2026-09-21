// Thin Stripe Checkout for AI-interview credit top-ups.
// POST { account_id, credit_type?, quantity }
// Returns { url } for a Checkout Session redirect.
import Stripe from "npm:stripe@16";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const { createClient } = await import("npm:@supabase/supabase-js@2");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const SITE_URL = (Deno.env.get("SITE_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
const CREDIT_PRICE_CENTS = Number(Deno.env.get("STRIPE_CREDIT_PRICE_CENTS") ?? "100");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: { account_id?: string; credit_type?: string; quantity?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const accountId = body.account_id;
  const creditType = body.credit_type ?? "ai_interview";
  let quantity = Math.floor(Number(body.quantity ?? 1));
  if (!accountId) return json({ error: "account_id is required" }, 400);
  if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
  if (quantity > 500) quantity = 500;

  if (!Deno.env.get("STRIPE_SECRET_KEY")) {
    return json(
      { error: "Stripe is not configured", detail: "Set STRIPE_SECRET_KEY on the checkout edge function." },
      501
    );
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, tier")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return json({ error: "Account not found" }, 404);

  // One-time purchase (no subscription) for top-up packs.
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: undefined,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: CREDIT_PRICE_CENTS,
          product_data: {
            name: `${creditType.replace("_", " ")} credit top-up`,
            description: `${quantity} prepaid credits for account ${accountId}`,
          },
        },
        quantity,
      },
    ],
    metadata: { account_id: accountId, credit_type: creditType, quantity: String(quantity) },
    client_reference_id: accountId,
    success_url: `${SITE_URL}/billing?purchase=success`,
    cancel_url: `${SITE_URL}/billing?purchase=cancelled`,
  });

  return json({ url: session.url, id: session.id });
});