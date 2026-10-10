// Thin edge gateway. n8n validates the signed assignment token, loads the
// submission and approved rubric, scores it, and stores a 1–100 evaluation.
const N8N_BASE_URL = (Deno.env.get("N8N_BASE_URL") ?? "").replace(/\/+$/, "");

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
  if (!N8N_BASE_URL) return json({ error: "N8N_BASE_URL is not configured." }, 503);

  const body = await req.json().catch(() => null);
  const input = body as {
    round_instance_id?: string;
    submission_id?: string;
    token?: string;
  } | null;
  if (!input?.round_instance_id || !input.submission_id || !input.token) {
    return json({ error: "round_instance_id, submission_id, and the assignment token are required." }, 400);
  }

  try {
    const response = await fetch(`${N8N_BASE_URL}/webhook/hiring/assignment-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: text.slice(0, 500) };
    }
    return json(payload ?? { ok: response.ok }, response.status);
  } catch (error) {
    console.error("[score-assignment] n8n dispatch failed:", error);
    return json({ error: "Assignment evaluation is temporarily unavailable." }, 502);
  }
});
