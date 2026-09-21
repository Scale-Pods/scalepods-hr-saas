// Opens the Stripe Customer Portal (invoice history, payment methods, plan).
// POST { account_id } -> { url }
import Stripe from "npm:stripe@16";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const { createClient } = await import("npm:@supabase/supabase-js@2");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const SITE_URL = (Deno.env.get("SITE_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
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

  const body = await req.json().catch(() => ({}));
  const accountId = body.account_id as string | undefined;
  if (!accountId) return json({ error: "account_id is required" }, 400);
  if (!Deno.env.get("STRIPE_SECRET_KEY")) {
    return json({ error: "Stripe is not configured", detail: "Set STRIPE_SECRET_KEY on the portal edge function." }, 501);
  }

  const { data: account } = await supabase.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!account) return json({ error: "Account not found" }, 404);

  // Look up the Stripe customer for this account (metadata written at checkout).
  let customerId: string | undefined;
  try {
    const found = await stripe.customers.search({
      query: `metadata["account_id"]:"${accountId}"`,
      limit: 1,
    });
    customerId = found.data[0]?.id;
  } catch {
    customerId = undefined;
  }
  if (!customerId) {
    const created = await stripe.customers.create({ metadata: { account_id: accountId } });
    customerId = created.id;
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${SITE_URL}/billing`,
  });

  return json({ url: session.url });
});