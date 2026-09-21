// Thin assignment-scoring extension (the spec's "evaluator/LLM step" ahead of
// the existing /round-evaluate endpoint in n8n workflow 2).
//
// POST { round_instance_id, submission_id }
//   1. Loads the assignment submission + round/campaign context.
//   2. Runs an LLM evaluation of the candidate's text against the JD.
//   3. Calls n8n POST /webhook/round-evaluate with the produced score so the
//      normal cutoff-check + advance/reject logic takes over.
// Returns the n8n response.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const N8N_BASE_URL = (Deno.env.get("N8N_BASE_URL") ?? "").replace(/\/+$/, "");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = Deno.env.get("SCORE_MODEL") ?? "gpt-4o-mini";

const { createClient } = await import("npm:@supabase/supabase-js@2");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

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
  const { round_instance_id, submission_id } = body as {
    round_instance_id?: string;
    submission_id?: string;
  };
  if (!round_instance_id || !submission_id) {
    return json({ error: "round_instance_id and submission_id are required" }, 400);
  }
  if (!N8N_BASE_URL) {
    return json({ error: "N8N_BASE_URL is not configured on this edge function" }, 501);
  }

  const { data: submission } = await supabase
    .from("assignment_submissions")
    .select("*")
    .eq("id", submission_id)
    .eq("round_instance_id", round_instance_id)
    .maybeSingle();
  if (!submission) return json({ error: "Submission not found" }, 404);

  const { data: ri } = await supabase
    .from("round_instances")
    .select("id, account_id, candidate_id, campaign_id, round_number, round_type")
    .eq("id", round_instance_id)
    .maybeSingle();
  if (!ri) return json({ error: "Round instance not found" }, 404);

  const [{ data: campaign }, { data: cr }, { data: candidate }] = await Promise.all([
    supabase.from("campaigns").select("name, jd_text, number_of_rounds").eq("id", ri.campaign_id).maybeSingle(),
    supabase
      .from("campaign_rounds")
      .select("cutoff_score")
      .eq("campaign_id", ri.campaign_id)
      .eq("round_number", ri.round_number)
      .maybeSingle(),
    supabase.from("candidates").select("name, email").eq("id", ri.candidate_id).maybeSingle(),
  ]);

  const fileList = Array.isArray(submission.file_paths) ? submission.file_paths : [];
  const textResponse = submission.text_response ?? "";
  const jd = campaign?.jd_text ?? "";
  const cutoff = cr?.cutoff_score ?? 70;

  let score: number | null = null;
  let rationale = "";
  let recommendation: string | null = null;

  if (OPENAI_API_KEY) {
    const prompt = [
      "You are a recruiting evaluator scoring a take-home assignment submission.",
      `Job description:\n${jd}`,
      `Round: ${ri.round_number} of ${campaign?.number_of_rounds ?? "?"}`,
      `Files submitted: ${fileList.join(", ") || "none (text-only submission)"}`,
      `Candidate text response:\n${textResponse || "(no text provided)"}`,
      "",
      'Return strict JSON: {"score": 0-100, "rationale": "...", "recommendation": "proceed"|"reject"|"review"}',
    ].join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: "You score assignment submissions against job descriptions. Reply with JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? "{}";
      try {
        const parsed = JSON.parse(content);
        score = clampScore(Number(parsed.score));
        rationale = String(parsed.rationale ?? "").slice(0, 2000);
        recommendation = String(parsed.recommendation ?? null);
      } catch {
        return json({ error: "LLM returned invalid JSON", detail: content.slice(0, 500) }, 502);
      }
    } else {
      return json({ error: `OpenAI request failed (${res.status})` }, 502);
    }
  } else {
    return json(
      { error: "OPENAI_API_KEY is not configured on the score-assignment edge function" },
      501
    );
  }

  // Hand off to the existing evaluate-and-cutoff-check endpoint on workflow 2.
  const evalBody = {
    action: "evaluate",
    account_id: ri.account_id,
    campaign_id: ri.campaign_id,
    candidate_id: ri.candidate_id,
    round_instance_id: ri.id,
    round_number: ri.round_number,
    number_of_rounds: campaign?.number_of_rounds ?? ri.round_number,
    cutoff_score: cutoff,
    score,
    rationale,
    recommendation,
    submission_id,
  };

  const n8n = await fetch(`${N8N_BASE_URL}/webhook/round-evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(evalBody),
  });

  let n8nPayload: unknown = null;
  try {
    n8nPayload = await n8n.json();
  } catch {
    n8nPayload = { error: await n8n.text().catch(() => "") };
  }

  return json(
    {
      score,
      rationale,
      recommendation,
      round_evaluate_status: n8n.status,
      round_evaluate: n8nPayload,
    },
    n8n.status === 200 || n8n.status === 201 || n8n.status === 202 ? 200 : 502
  );
});

function clampScore(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}