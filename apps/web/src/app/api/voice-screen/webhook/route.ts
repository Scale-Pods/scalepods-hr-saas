import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

function parseRealScore(val: unknown): number | null {
  if (typeof val === "number" && !Number.isNaN(val)) {
    return val <= 10 ? Math.round(val * 10) : Math.round(val);
  }
  if (typeof val === "string" && val.trim().length > 0) {
    const num = Number.parseFloat(val);
    if (!Number.isNaN(num)) {
      return num <= 10 ? Math.round(num * 10) : Math.round(num);
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    interface WebhookData {
      event_type?: string;
      type?: string;
      payload?: {
        call?: Record<string, unknown>;
        [key: string]: unknown;
      };
      data?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      notes?: Record<string, unknown>;
      postcallanalysis?: Record<string, unknown>;
      post_call_analysis?: Record<string, unknown>;
      duration?: number | string;
      status?: string;
      end_reason?: string;
      transcript?: string;
      candidate_id?: string;
      round_instance_id?: string;
      account_id?: string;
      application_id?: string;
      [key: string]: unknown;
    }

    let body: WebhookData = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = {};
    }

    // Handle DialNexa webhook verification challenge
    if (body.event_type === "verification" || body.type === "verification") {
      return NextResponse.json({ success: true, message: "DialNexa webhook verified" });
    }

    // DialNexa supports both flat and nested payloads
    const payload = (body.payload?.call || body.payload || body.data || body) as Record<
      string,
      unknown
    >;
    const meta = (payload.metadata || payload.notes || body.metadata || body.notes || {}) as Record<
      string,
      unknown
    >;

    // Detect test calls - test calls should NEVER be stored in the database or mutate candidate records
    const isTestCall = Boolean(
      payload.is_test_call === true ||
        payload.is_test_call === "true" ||
        meta.is_test_call === true ||
        meta.is_test_call === "true" ||
        body.is_test_call === true ||
        body.is_test_call === "true" ||
        String(payload.source || "")
          .toLowerCase()
          .includes("test") ||
        String(meta.source || "")
          .toLowerCase()
          .includes("test") ||
        String(body.source || "")
          .toLowerCase()
          .includes("test") ||
        String(meta.candidate_name || payload.candidate_name || body.candidate_name || "")
          .toLowerCase()
          .includes("recruiter test") ||
        String(meta.candidate_name || payload.candidate_name || body.candidate_name || "")
          .toLowerCase()
          .includes("alex morgan") ||
        String(meta.role_title || payload.role_title || body.role_title || "")
          .toLowerCase()
          .includes("agent test"),
    );

    if (isTestCall) {
      return NextResponse.json({
        success: true,
        is_test_call: true,
        message: "Test call webhook received - intentionally not stored in database",
      });
    }

    const candidateId = meta.candidate_id || payload.candidate_id || null;
    const roundInstanceId = meta.round_instance_id || payload.round_instance_id || null;
    const accountId = meta.account_id || payload.account_id || null;
    const applicationId = meta.application_id || payload.application_id || null;
    const duration = Number(payload.duration || body.duration || 0);
    const _status = payload.status || body.status || "completed";

    const postAnalysis = (payload.postcallanalysis ||
      payload.post_call_analysis ||
      body.postcallanalysis ||
      {}) as Record<string, unknown>;
    const sentiment = String(postAnalysis.sentiment || "").toUpperCase();
    const transcript =
      payload.transcript ||
      body.transcript ||
      `DialNexa call completed. Duration: ${duration}s, sentiment: ${sentiment || "NEUTRAL"}.`;

    if (!candidateId && !roundInstanceId && !accountId) {
      // Return 200 so DialNexa does not retry invalid ping
      return NextResponse.json({
        success: true,
        message: "No matching candidate metadata in webhook payload",
      });
    }

    const env = getEnv();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const adminSupabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { persistSession: false },
    });

    // 1. Resolve application and round if needed
    let resolvedAppId = applicationId;
    let resolvedRiId = roundInstanceId;
    let resolvedAccountId = accountId;

    if (candidateId && (!resolvedAppId || !resolvedRiId || !resolvedAccountId)) {
      const { data: app } = await adminSupabase
        .from("applications")
        .select("id, account_id, current_round_number")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (app) {
        resolvedAppId = resolvedAppId || app.id;
        resolvedAccountId = resolvedAccountId || app.account_id;
        if (!resolvedRiId && app.current_round_number != null) {
          const { data: ri } = await adminSupabase
            .from("round_instances")
            .select("id")
            .eq("application_id", app.id)
            .eq("round_number", app.current_round_number)
            .maybeSingle();
          if (ri) resolvedRiId = ri.id;
        }
      }
    }

    // 2. Extract real evaluation score from DialNexa post-call analysis
    const rawTech = parseRealScore(
      postAnalysis.technical_qualification_score ??
        postAnalysis.technical_score ??
        postAnalysis.tech_score,
    );
    const rawComm = parseRealScore(
      postAnalysis.communication_skills_score ??
        postAnalysis.communication_score ??
        postAnalysis.comm_score,
    );
    let realScore = parseRealScore(postAnalysis.overall_score ?? postAnalysis.score);
    if (realScore == null && rawTech != null && rawComm != null) {
      realScore = Math.round(rawTech * 0.6 + rawComm * 0.4);
    } else if (realScore == null && (rawTech != null || rawComm != null)) {
      realScore = rawTech ?? rawComm;
    }

    const rationale =
      (typeof postAnalysis.screening_summary === "string" &&
        postAnalysis.screening_summary.trim()) ||
      (typeof postAnalysis.key_strengths_summary === "string" &&
        postAnalysis.key_strengths_summary.trim()) ||
      (realScore != null
        ? `Candidate completed conversational AI voice screening call (duration: ${duration}s) with verified score ${realScore}/100.`
        : null);

    // 3. Insert or update decision_ledger ONLY if real evaluation score exists. Only real scores or nothing.
    if (candidateId && resolvedAccountId) {
      if (realScore != null) {
        await adminSupabase.from("decision_ledger").insert({
          account_id: resolvedAccountId,
          candidate_id: candidateId,
          application_id: resolvedAppId,
          round_instance_id: resolvedRiId || null,
          stage: "voice_screen",
          score: realScore,
          rationale:
            rationale || `AI voice screening completed with evaluation score of ${realScore}/100.`,
          raw_text: transcript,
          source: "dialnexa",
        });
      }

      if (resolvedRiId) {
        await adminSupabase
          .from("round_instances")
          .update({ status: "completed" })
          .eq("id", resolvedRiId);
      }

      await adminSupabase
        .from("outreach_log")
        .update({ delivery_state: "connected" })
        .eq("candidate_id", candidateId)
        .eq("channel", "voice_call");
    }

    return NextResponse.json({
      success: true,
      score: realScore,
      status: realScore != null ? "evaluated" : "completed",
    });
  } catch (error) {
    console.error("DialNexa webhook handler error:", error);
    return NextResponse.json(
      {
        error: "Webhook processing failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
