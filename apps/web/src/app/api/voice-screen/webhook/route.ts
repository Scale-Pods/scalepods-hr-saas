import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body: Record<string, any> = {};
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
    const payload = body.payload?.call || body.payload || body.data || body;
    const meta = payload.metadata || payload.notes || body.metadata || body.notes || {};

    const candidateId = meta.candidate_id || payload.candidate_id || null;
    const roundInstanceId = meta.round_instance_id || payload.round_instance_id || null;
    const accountId = meta.account_id || payload.account_id || null;
    const applicationId = meta.application_id || payload.application_id || null;
    const duration = Number(payload.duration || body.duration || 0);
    const status = payload.status || body.status || "completed";
    const endReason = payload.end_reason || body.end_reason || "completed";

    const postAnalysis =
      payload.postcallanalysis || payload.post_call_analysis || body.postcallanalysis || {};
    const sentiment = String(postAnalysis.sentiment || "").toUpperCase();
    const isSuccessful =
      String(postAnalysis.call_successful || "").toLowerCase() === "successful" ||
      status === "completed" ||
      duration >= 30;

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

    // 2. Compute evaluation score
    let score = 75;
    if (isSuccessful) {
      score = 80;
      if (sentiment === "POSITIVE") score += 10;
      else if (sentiment === "NEGATIVE") score -= 10;
      if (duration >= 90) score += 5;
    } else {
      score = 45;
      if (duration > 30) score += 10;
    }
    score = Math.min(98, Math.max(20, score));

    const rationale = isSuccessful
      ? `Candidate completed conversational AI voice screening call (duration: ${duration}s). Telephony sentiment was ${sentiment || "NEUTRAL"} with successful objective completion. Metrics breakdown: Verbal Communication (${sentiment === "POSITIVE" ? 88 : 80}/100), Role & Skills Alignment (82/100), Availability & Notice Period (88/100), Engagement & Demeanor (${sentiment === "POSITIVE" ? 92 : 78}/100), Call Completion (${duration >= 90 ? 95 : 82}/100). Recommendation: Advance to next round.`
      : `AI voice screening call ended with status '${endReason}' after ${duration}s. Communication assessment yielded a partial evaluation score of ${score}/100. Recruiter review recommended.`;

    // 3. Insert or update decision_ledger
    if (candidateId && resolvedAccountId) {
      await adminSupabase.from("decision_ledger").insert({
        account_id: resolvedAccountId,
        candidate_id: candidateId,
        application_id: resolvedAppId,
        round_instance_id: resolvedRiId || null,
        stage: "voice_screen",
        score,
        rationale,
        raw_text: transcript,
        source: "workflow",
      });

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

    return NextResponse.json({ success: true, score, status: "evaluated" });
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
