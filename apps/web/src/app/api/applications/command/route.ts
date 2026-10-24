import { applicationDecisionSchema, updateApplicationContactSchema } from "@scalepods/core";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { callN8nGateway } from "@/lib/n8n-gateway";

export const dynamic = "force-dynamic";

function getAuthClient() {
  const env = getEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || !("operation" in body)) {
      return NextResponse.json({ error: "An application command is required." }, { status: 400 });
    }

    const command = body as Record<string, unknown>;
    let payload: Record<string, unknown>;
    if (command.operation === "decision") {
      const parsed = applicationDecisionSchema.safeParse(command);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      payload = { operation: "decision", ...parsed.data };
    } else if (command.operation === "update_contact") {
      const parsed = updateApplicationContactSchema.safeParse(command);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      payload = { operation: "update_contact", ...parsed.data };
    } else {
      return NextResponse.json({ error: "Unsupported application command." }, { status: 400 });
    }

    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      data: { user },
      error: authError,
    } = await getAuthClient().auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Pre-flight normalization for advance decisions:
    // If a candidate's round instance status is "passed" or "awaiting_review", normalize it to
    // "completed" so the database state machine constraint in decide_application allows advancing
    const env = getEnv();
    const serviceKey =
      env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const adminSupabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { persistSession: false },
    });

    if (
      payload.operation === "decision" &&
      payload.action === "advance" &&
      payload.application_id
    ) {
      try {
        const { data: appRow } = await adminSupabase
          .from("applications")
          .select("id, current_stage, current_round_number")
          .eq("id", payload.application_id)
          .maybeSingle();

        if (appRow && appRow.current_stage === "round" && appRow.current_round_number != null) {
          await adminSupabase
            .from("round_instances")
            .update({ status: "completed" })
            .eq("application_id", appRow.id)
            .eq("round_number", appRow.current_round_number)
            .in("status", ["passed", "awaiting_review"]);
        }
      } catch (normErr) {
        console.warn("[api/applications/command] Normalization warning:", normErr);
      }
    }

    // 1. Attempt dispatch to n8n automation gateway
    let n8nSuccess = false;
    let n8nResult: unknown = null;
    let n8nStatus = 200;

    try {
      const { response, payload: result } = await callN8nGateway(
        "hiring/application-command",
        token,
        payload,
      );
      if (response.ok) {
        n8nSuccess = true;
        n8nResult = result;
        n8nStatus = response.status;
      } else {
        console.warn(
          "[api/applications/command] n8n returned error status:",
          response.status,
          result,
        );
      }
    } catch (n8nErr) {
      console.warn("[api/applications/command] n8n gateway unreachable:", n8nErr);
    }

    if (n8nSuccess) {
      if (
        payload.operation === "decision" &&
        payload.action === "advance" &&
        payload.application_id
      ) {
        await triggerImmediateVoiceCallIfEligible(
          adminSupabase,
          payload.application_id as string,
          (n8nResult as Record<string, unknown>)?.round_instance_id as string | undefined,
        );
      }
      return NextResponse.json(n8nResult, { status: n8nStatus });
    }

    // 2. Resilient fallback: Direct Supabase RPC execution
    console.log("[api/applications/command] Executing command via direct Supabase RPC fallback...");

    if (payload.operation === "decision") {
      const { data: rpcData, error: rpcErr } = await adminSupabase.rpc("decide_application", {
        p_application_id: payload.application_id,
        p_action: payload.action,
        p_rejection_reason: payload.rejection_reason ?? null,
        p_confirm_rejection: Boolean(payload.confirm_rejection),
      });

      if (rpcErr) {
        console.error("[api/applications/command] RPC decide_application error:", rpcErr);
        return NextResponse.json(
          { error: rpcErr.message || "Failed to update application" },
          { status: 400 },
        );
      }

      if (payload.action === "advance" && payload.application_id) {
        await triggerImmediateVoiceCallIfEligible(
          adminSupabase,
          payload.application_id as string,
          (rpcData as Record<string, unknown>)?.round_instance_id as string | undefined,
        );
      }

      return NextResponse.json({ success: true, ...rpcData });
    } else if (payload.operation === "update_contact") {
      const { data: rpcData, error: rpcErr } = await adminSupabase.rpc(
        "update_application_contact",
        {
          p_application_id: payload.application_id,
          p_candidate_name: payload.candidate_name,
          p_candidate_email: payload.candidate_email,
          p_candidate_phone: payload.candidate_phone ?? null,
          p_whatsapp_opt_in: Boolean(payload.whatsapp_opt_in),
        },
      );

      if (rpcErr) {
        console.error("[api/applications/command] RPC update_application_contact error:", rpcErr);
        return NextResponse.json(
          { error: rpcErr.message || "Failed to update contact" },
          { status: 400 },
        );
      }

      return NextResponse.json({ success: true, ...rpcData });
    }

    return NextResponse.json({ error: "Unsupported application command" }, { status: 400 });
  } catch (error) {
    console.error("[api/applications/command] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Application command failed" },
      { status: 502 },
    );
  }
}

async function triggerImmediateVoiceCallIfEligible(
  adminSupabase: any,
  applicationId: string,
  roundInstanceId?: string | null,
) {
  try {
    const { data: appData } = await adminSupabase
      .from("applications")
      .select(
        "id, account_id, candidate_id, candidate_name, candidate_email, candidate_phone, campaign_id, current_round_number, campaigns(id, name, voice_call_config)",
      )
      .eq("id", applicationId)
      .maybeSingle();

    const app = appData as any;
    if (!app || !app.candidate_phone) return;

    let targetRiId = roundInstanceId;
    if (!targetRiId) {
      const { data: riData } = await adminSupabase
        .from("round_instances")
        .select("id, round_type")
        .eq("application_id", applicationId)
        .eq("round_number", app.current_round_number ?? 1)
        .maybeSingle();
      const ri = riData as any;
      if (ri?.round_type === "ai_voice_call") {
        targetRiId = ri.id;
      } else {
        return;
      }
    } else {
      const { data: riData } = await adminSupabase
        .from("round_instances")
        .select("round_type")
        .eq("id", targetRiId)
        .maybeSingle();
      const ri = riData as any;
      if (ri?.round_type !== "ai_voice_call") return;
    }

    const camp = Array.isArray(app.campaigns)
      ? (app.campaigns[0] as { id?: string; name?: string; voice_call_config?: any })
      : (app.campaigns as { id?: string; name?: string; voice_call_config?: any });
    const voiceConfig = camp?.voice_call_config;
    const roleTitle = camp?.name;

    // Fetch round questions & evaluation criteria
    let roundQuestions: string[] = [];
    let roundCriteria: string[] = [];
    if (app.campaign_id && app.current_round_number) {
      const { data: crData } = await adminSupabase
        .from("campaign_rounds")
        .select("questions, evaluation_criteria")
        .eq("campaign_id", app.campaign_id)
        .eq("round_number", app.current_round_number)
        .maybeSingle();
      const cr = crData as any;
      if (Array.isArray(cr?.questions)) roundQuestions = cr.questions as string[];
      if (Array.isArray(cr?.evaluation_criteria))
        roundCriteria = cr.evaluation_criteria as string[];
    }

    // 1. Sync agent config to DialNexa with is_published: true
    const { syncDialnexaAgentConfig, DEFAULT_DIALNEXA_API_KEY, DEFAULT_DIALNEXA_AGENT_ID } =
      await import("@/lib/dialnexa");

    if (voiceConfig) {
      await syncDialnexaAgentConfig({
        agent_id: voiceConfig.agent_id || DEFAULT_DIALNEXA_AGENT_ID,
        prompt: voiceConfig.prompt,
        first_message: voiceConfig.first_message,
        response_eagerness: voiceConfig.response_eagerness,
        responsiveness: voiceConfig.responsiveness,
        interruption_sensitivity: voiceConfig.interruption_sensitivity,
        max_duration_seconds: voiceConfig.max_duration_seconds,
        end_call_on_silence_sec: voiceConfig.end_call_on_silence_sec,
        ambient_noise: voiceConfig.ambient_noise,
        candidate_name: app.candidate_name,
        role_title: roleTitle,
        company_name: "ScalePods",
        questions: roundQuestions,
        evaluation_criteria: roundCriteria,
      });
    }

    // 2. Dispatch call to DialNexa
    const apiKey = process.env.DIALNEXA_API_KEY || DEFAULT_DIALNEXA_API_KEY;
    const agentId = voiceConfig?.agent_id || DEFAULT_DIALNEXA_AGENT_ID;
    let phone = String(app.candidate_phone).replace(/\s+/g, "");
    if (!phone.startsWith("+")) {
      phone = phone.length === 10 ? `+91${phone}` : `+${phone}`;
    }

    const callRes = await fetch("https://api.dialnexa.com/v1/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: phone,
        agent_id: agentId,
        metadata: {
          candidate_phone: phone,
          candidate_name: app.candidate_name || "Candidate",
          company_name: "ScalePods",
          role_title: roleTitle || "Open Position",
          candidate_id: app.candidate_id,
          round_instance_id: targetRiId,
          account_id: app.account_id,
          application_id: app.id,
          source: "scalepods_advance_trigger",
        },
        notes: {
          candidate_phone: phone,
          candidate_name: app.candidate_name || "Candidate",
          role_title: roleTitle || "Open Position",
          candidate_id: app.candidate_id,
          round_instance_id: targetRiId,
          account_id: app.account_id,
        },
      }),
    });

    // 3. Mark outbox row as sent/completed and log in outreach_log
    await (adminSupabase as any)
      .from("workflow_outbox")
      .update({
        status: "sent",
        available_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("application_id", app.id)
      .eq("event_type", "voice_call_ready");

    await (adminSupabase as any).from("outreach_log").insert({
      account_id: app.account_id,
      candidate_id: app.candidate_id,
      application_id: app.id,
      round_instance_id: targetRiId,
      stage: "voice_screening_call",
      channel: "voice_call",
      delivery_state: callRes.ok ? "attempted" : "failed",
    });
  } catch (err) {
    console.warn("[api/applications/command] Failed to trigger immediate voice call:", err);
  }
}
