import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { BUCKETS } from "@/lib/storage";

interface UploadEntry {
  name: string;
  path: string;
  url: string;
}

function getAdminClient() {
  const env = getEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return {
    supabase: createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    supabaseUrl: url.replace(/\/+$/, ""),
  };
}

export async function POST(req: NextRequest) {
  let body: { token?: string; kind?: string; resource_id?: string; file_names?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { token, kind, resource_id, file_names } = body ?? {};
  if (!kind || !resource_id || !Array.isArray(file_names) || file_names.length === 0) {
    return NextResponse.json(
      { error: "kind, resource_id and file_names[] are required" },
      { status: 400 },
    );
  }
  if (kind !== "recording" && kind !== "assignment") {
    return NextResponse.json(
      { error: "kind must be 'recording' or 'assignment'" },
      { status: 400 },
    );
  }

  const { supabase, supabaseUrl } = getAdminClient();

  let accountId: string;
  let pathBase: string;
  let bucket: string;

  if (kind === "recording") {
    bucket = BUCKETS.recordings;
    const { data: sess, error: sessErr } = await supabase
      .from("interview_sessions")
      .select("account_id, expires_at")
      .eq("id", resource_id)
      .maybeSingle();

    if (sessErr || !sess) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (sess.expires_at && new Date(sess.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Link has expired" }, { status: 401 });
    }

    accountId = sess.account_id;
    pathBase = `${accountId}/${resource_id}`;
  } else {
    if (!token) {
      return NextResponse.json({ error: "token is required for assignment uploads" }, { status: 400 });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const { data: tok, error: tokErr } = await supabase
      .from("candidate_access_tokens")
      .select("account_id, resource_type, resource_id, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .eq("resource_id", resource_id)
      .maybeSingle();

    if (tokErr || !tok) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }
    if (tok.revoked_at) {
      return NextResponse.json({ error: "Link has been revoked" }, { status: 401 });
    }
    if (new Date(tok.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Link has expired" }, { status: 401 });
    }
    if (tok.resource_type !== "assignment") {
      return NextResponse.json({ error: "Link is for a different resource" }, { status: 401 });
    }

    accountId = tok.account_id;
    bucket = BUCKETS.assignments || "assignments";

    const { data: ri, error: riErr } = await supabase
      .from("round_instances")
      .select("campaign_id")
      .eq("id", resource_id)
      .maybeSingle();

    if (riErr || !ri) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    pathBase = `${accountId}/${ri.campaign_id}/${resource_id}/submission`;
  }

  const uploads: UploadEntry[] = [];
  for (const name of file_names) {
    const safe = name.replace(/[^A-Za-z0-9._-]/g, "_");
    const fullPath = `${pathBase}/${safe}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(fullPath, { expiresIn: 3600 });

    if (error || !data) {
      return NextResponse.json(
        { error: `Could not sign upload for ${safe}: ${error?.message ?? ""}` },
        { status: 500 },
      );
    }

    // Ensure absolute signed URL for client fetch PUT
    const uploadUrl = data.signedUrl.startsWith("http")
      ? data.signedUrl
      : `${supabaseUrl}/storage/v1${data.signedUrl.startsWith("/") ? "" : "/"}${data.signedUrl}`;

    uploads.push({
      name: safe,
      path: fullPath,
      url: uploadUrl,
    });
  }

  return NextResponse.json({ bucket, uploads });
}

