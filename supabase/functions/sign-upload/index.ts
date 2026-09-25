import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

interface UploadEntry {
  name: string;
  url: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: { token?: string; kind?: string; resource_id?: string; file_names?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { token, kind, resource_id, file_names } = body ?? {};
  if (!kind || !resource_id || !Array.isArray(file_names) || file_names.length === 0) {
    return json({ error: "kind, resource_id and file_names[] are required" }, 400);
  }
  if (kind !== "recording" && kind !== "assignment") {
    return json({ error: "kind must be 'recording' or 'assignment'" }, 400);
  }

  let accountId: string;
  let pathBase: string;
  let bucket: string;
  if (kind === "recording") {
    // Interviews authenticate by the session id alone (no token row needed).
    bucket = "interview-recordings";
    const { data: sess, error: sessErr } = await supabase
      .from("interview_sessions")
      .select("account_id, expires_at")
      .eq("id", resource_id)
      .maybeSingle();
    if (sessErr || !sess) return json({ error: "Session not found" }, 404);
    if (sess.expires_at && new Date(sess.expires_at).getTime() < Date.now()) {
      return json({ error: "Link has expired" }, 401);
    }
    accountId = sess.account_id;
    pathBase = `${accountId}/${resource_id}`;
  } else {
    // Assignments keep the token-gated flow.
    if (!token) return json({ error: "token is required for assignment uploads" }, 400);

    const lookupHash = await (async () => {
      // SHA-256 hex of the raw token, matching candidate_token_valid in SQL.
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    })();

    const { data: tok, error: tokErr } = await supabase
      .from("candidate_access_tokens")
      .select("account_id, resource_type, resource_id, expires_at, revoked_at")
      .eq("token_hash", lookupHash)
      .eq("resource_id", resource_id)
      .maybeSingle();

    if (tokErr || !tok) return json({ error: "Invalid or expired link" }, 401);
    if (tok.revoked_at) return json({ error: "Link has been revoked" }, 401);
    if (new Date(tok.expires_at).getTime() < Date.now()) return json({ error: "Link has expired" }, 401);
    if (tok.resource_type !== "assignment") return json({ error: "Link is for a different resource" }, 401);

    accountId = tok.account_id;
    bucket = "assignments";
    const { data: ri, error: riErr } = await supabase
      .from("round_instances")
      .select("campaign_id")
      .eq("id", resource_id)
      .maybeSingle();
    if (riErr || !ri) return json({ error: "Round not found" }, 404);
    pathBase = `${accountId}/${ri.campaign_id}/${resource_id}/submission`;
  }

  const uploads: UploadEntry[] = [];
  for (const name of file_names) {
    const safe = name.replace(/[^A-Za-z0-9._-]/g, "_");
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(`${pathBase}/${safe}`, { expiresIn: 600 });
    if (error || !data) return json({ error: `Could not sign upload for ${safe}`.concat(error?.message ?? "") }, 500);
    uploads.push({ name: safe, url: data.signedUrl });
  }

  return json({ bucket, uploads });
});