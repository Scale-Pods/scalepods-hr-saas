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

function getAdminSupabaseClient() {
  const env = getEnv();
  const serviceKey =
    env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
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
    const adminSupabase = getAdminSupabaseClient();

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
      const n8nRecord = (n8nResult as Record<string, unknown>) || {};
      const n8nInner =
        n8nRecord.result && typeof n8nRecord.result === "object"
          ? (n8nRecord.result as Record<string, unknown>)
          : n8nRecord;
      const n8nStage = n8nInner.stage ?? n8nRecord.stage;
      const n8nRoundInstanceId = (n8nInner.round_instance_id ?? n8nRecord.round_instance_id) as
        | string
        | undefined;
      if (
        payload.operation === "decision" &&
        payload.action === "advance" &&
        payload.application_id &&
        n8nStage === "round"
      ) {
        await triggerImmediateVoiceCallIfEligible(
          adminSupabase,
          payload.application_id as string,
          n8nRoundInstanceId,
          token,
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

      const rpcRecord = (rpcData as Record<string, unknown>) || {};
      const rpcInner =
        rpcRecord.result && typeof rpcRecord.result === "object"
          ? (rpcRecord.result as Record<string, unknown>)
          : rpcRecord;
      const rpcStage = rpcInner.stage ?? rpcRecord.stage;
      const rpcRoundInstanceId = (rpcInner.round_instance_id ?? rpcRecord.round_instance_id) as
        | string
        | undefined;

      // Only trigger an AI voice screening call if the application advanced INTO an active round stage
      if (payload.action === "advance" && payload.application_id && rpcStage === "round") {
        await triggerImmediateVoiceCallIfEligible(
          adminSupabase,
          payload.application_id as string,
          rpcRoundInstanceId,
          token,
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
          p_whatsapp_opt_in: payload.whatsapp_opt_in !== false,
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
  adminSupabase: ReturnType<typeof getAdminSupabaseClient>,
  applicationId: string,
  roundInstanceId?: string | null,
  authToken?: string,
) {
  try {
    const { data: appData } = await adminSupabase
      .from("applications")
      .select(
        "id, account_id, candidate_id, candidate_name, candidate_email, candidate_phone, campaign_id, current_stage, current_round_number, status, campaigns(id, name, voice_call_config)",
      )
      .eq("id", applicationId)
      .maybeSingle();

    const app = appData as {
      id: string;
      account_id: string;
      candidate_id: string;
      candidate_name: string | null;
      candidate_email: string | null;
      candidate_phone: string | null;
      campaign_id: string | null;
      current_stage: string | null;
      current_round_number: number | null;
      status: string;
      campaigns?:
        | { id?: string; name?: string; voice_call_config?: Record<string, unknown> }
        | Array<{ id?: string; name?: string; voice_call_config?: Record<string, unknown> }>;
    } | null;
    if (!app) return;

    // Never trigger a voice call if the application is not in an active round stage (e.g., offer stage, rejected, or completed)
    if (app.current_stage !== "round" || app.status !== "active") {
      return;
    }

    // Resolve candidate phone: check applications table first, then candidates table fallback
    let candidatePhone = app.candidate_phone;
    if (!candidatePhone && app.candidate_id) {
      const { data: candData } = await adminSupabase
        .from("candidates")
        .select("phone, name, email")
        .eq("id", app.candidate_id)
        .maybeSingle();
      if (candData?.phone) {
        candidatePhone = candData.phone;
        await adminSupabase
          .from("applications")
          .update({ candidate_phone: candidatePhone })
          .eq("id", applicationId);
      }
    }

    if (!candidatePhone) {
      console.warn(
        `[api/applications/command] Candidate ${app.candidate_id} has no phone number on file for voice screening.`,
      );
      return;
    }

    // Resolve target round instance ID: use passed ID or query the active pending round for this application
    let targetRiId = roundInstanceId;
    if (!targetRiId) {
      const { data: activeRi } = await adminSupabase
        .from("round_instances")
        .select("id, round_type, status")
        .eq("application_id", applicationId)
        .eq("round_type", "ai_voice_call")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeRi?.id) {
        targetRiId = activeRi.id;
      }
    }

    if (!targetRiId) {
      return;
    }

    // Verify the target round instance exists, is specifically an ai_voice_call, and is currently in "pending" status
    const { data: riData } = await adminSupabase
      .from("round_instances")
      .select("id, round_type, status")
      .eq("id", targetRiId)
      .maybeSingle();

    const ri = riData as { id: string; round_type: string; status: string } | null;
    if (ri?.round_type !== "ai_voice_call" || ri?.status !== "pending") {
      return;
    }

    // Check if an outreach voice call was already dispatched or attempted for this round instance to avoid duplicate calls
    const { data: existingOutreach } = await adminSupabase
      .from("outreach_log")
      .select("id")
      .eq("application_id", applicationId)
      .eq("round_instance_id", targetRiId)
      .maybeSingle();

    if (existingOutreach) {
      console.log(
        `[api/applications/command] Voice call already initiated for round instance ${targetRiId}. Skipping duplicate.`,
      );
      return;
    }

    // Resolve account plan tier to respect entitlements
    let planTier = "basic";
    if (app.account_id) {
      const { data: acc } = await adminSupabase
        .from("accounts")
        .select("tier")
        .eq("id", app.account_id)
        .maybeSingle();
      if (acc?.tier) {
        planTier = acc.tier;
      }
    }
    const isEnterprise = String(planTier).toLowerCase() === "enterprise";

    const camp = Array.isArray(app.campaigns)
      ? (app.campaigns[0] as {
          id?: string;
          name?: string;
          voice_call_config?: Record<string, unknown>;
        })
      : (app.campaigns as {
          id?: string;
          name?: string;
          voice_call_config?: Record<string, unknown>;
        });
    const voiceConfig = camp?.voice_call_config as
      | {
          agent_id?: string;
          prompt?: string;
          first_message?: string;
          response_eagerness?: number;
          responsiveness?: number;
          interruption_sensitivity?: number;
          max_duration_seconds?: number;
          end_call_on_silence_sec?: number;
          ambient_noise?: boolean;
        }
      | undefined;
    const roleTitle = camp?.name || "Open Position";

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
      const cr = crData as { questions?: unknown; evaluation_criteria?: unknown } | null;
      if (Array.isArray(cr?.questions)) roundQuestions = cr.questions as string[];
      if (Array.isArray(cr?.evaluation_criteria))
        roundCriteria = cr.evaluation_criteria as string[];
    }

    // Format phone number to E.164 standard
    let phone = String(candidatePhone).replace(/\s+/g, "");
    if (!phone.startsWith("+")) {
      phone = phone.length === 10 ? `+91${phone}` : `+${phone}`;
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

    // 2. Dispatch to n8n Voice Screening Webhook first
    const n8nBase = (
      process.env.NEXT_PUBLIC_N8N_BASE_URL ||
      process.env.N8N_BASE_URL ||
      "https://n8n.srv1711190.hstgr.cloud"
    )
      .replace(/\/+$/, "")
      .replace(/\/webhook\/?$/, "");

    let callInitiated = false;

    try {
      console.log(
        `[api/applications/command] Triggering voice-screen webhook for candidate ${app.candidate_name || phone}...`,
      );
      const webhookPayload = {
        account_id: app.account_id,
        application_id: app.id,
        candidate_id: app.candidate_id,
        candidate_name: app.candidate_name || "Candidate",
        candidate_phone: phone,
        round_instance_id: targetRiId,
        role_title: roleTitle,
        company_name: "ScalePods",
        voice_call_config: voiceConfig || undefined,
        plan_tier: planTier,
        tier: planTier,
        is_enterprise: isEnterprise,
      };

      const n8nRes = await fetch(`${n8nBase}/webhook/voice-screen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(webhookPayload),
      });

      if (n8nRes.ok) {
        callInitiated = true;
        console.log(
          `[api/applications/command] Successfully triggered voice-screen webhook for candidate ${app.candidate_name || phone}.`,
        );
      } else {
        const errText = await n8nRes.text().catch(() => "");
        console.warn(
          `[api/applications/command] n8n voice-screen webhook returned non-ok status: ${n8nRes.status} ${errText}`,
        );
      }
    } catch (whErr) {
      console.warn(
        "[api/applications/command] n8n voice-screen webhook unreachable or error:",
        whErr,
      );
    }

    // 3. Fallback: Direct DialNexa API call dispatch if n8n webhook was unreachable or failed
    if (!callInitiated) {
      console.log(
        "[api/applications/command] Initiating direct DialNexa call dispatch fallback...",
      );
      const apiKey = process.env.DIALNEXA_API_KEY || DEFAULT_DIALNEXA_API_KEY;
      const agentId = voiceConfig?.agent_id || DEFAULT_DIALNEXA_AGENT_ID;

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
            role_title: roleTitle,
            candidate_id: app.candidate_id,
            round_instance_id: targetRiId,
            account_id: app.account_id,
            application_id: app.id,
            source: "scalepods_advance_trigger",
          },
          notes: {
            candidate_phone: phone,
            candidate_name: app.candidate_name || "Candidate",
            role_title: roleTitle,
            candidate_id: app.candidate_id,
            round_instance_id: targetRiId,
            account_id: app.account_id,
          },
        }),
      });

      if (callRes.ok) {
        callInitiated = true;
        console.log(
          `[api/applications/command] Direct DialNexa call initiated successfully for ${app.candidate_name || phone}.`,
        );
      } else {
        const errText = await callRes.text().catch(() => "");
        console.error(
          `[api/applications/command] Direct DialNexa call failed: ${callRes.status} ${errText}`,
        );
      }
    }

    // 4. Mark outbox row as sent/completed and log in outreach_log
    await adminSupabase
      .from("workflow_outbox")
      .update({
        status: "sent",
        available_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("application_id", app.id)
      .eq("event_type", "voice_call_ready");

    await adminSupabase.from("outreach_log").insert({
      account_id: app.account_id,
      candidate_id: app.candidate_id,
      application_id: app.id,
      round_instance_id: targetRiId,
      stage: "voice_screening_call",
      channel: "voice_call",
      delivery_state: callInitiated ? "attempted" : "failed",
    });
  } catch (err) {
    console.warn("[api/applications/command] Failed to trigger immediate voice call:", err);
  }
}
