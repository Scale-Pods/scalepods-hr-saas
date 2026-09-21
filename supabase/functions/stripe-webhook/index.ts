// Stripe webhook: grants purchased credits on checkout.session.completed.
// Writes credit_ledger purchase + grant rows for the account in metadata.
import Stripe from "npm:stripe@16";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const { createClient } = await import("npm:@supabase/supabase-js@2");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing signature" }, 400);
  if (!WEBHOOK_SECRET) return json({ error: "Stripe webhook secret not configured" }, 501);

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, WEBHOOK_SECRET);
  } catch (err) {
    return json({ error: `Signature verification failed: ${(err as Error).message}` }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const accountId = session.metadata?.account_id;
    const creditType = session.metadata?.credit_type ?? "ai_interview";
    const quantity = Number(session.metadata?.quantity ?? 1);
    if (accountId && quantity > 0) {
      await supabase.from("credit_ledger").insert([
        {
          account_id: accountId,
          credit_type: creditType,
          action: "purchase",
          amount: quantity,
        },
        {
          account_id: accountId,
          credit_type: creditType,
          action: "grant",
          amount: quantity,
        },
      ]);
    }
  }

  return json({ received: true });
});