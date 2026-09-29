import { NextResponse } from "next/server";
import { syncDialnexaAgentConfig } from "@/lib/dialnexa";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone_number, agent_id, voice_call_config, candidate_name, role_title } = body;

    if (!phone_number) {
      return NextResponse.json(
        { error: "Phone number is required for test call" },
        { status: 400 },
      );
    }

    let phone = String(phone_number).replace(/[\s-]/g, "");
    if (!phone.startsWith("+")) {
      phone = phone.length === 10 ? `+91${phone}` : `+${phone}`;
    }

    const n8nBase = (process.env.NEXT_PUBLIC_N8N_BASE_URL || "https://n8n.srv1711190.hstgr.cloud")
      .replace(/\/+$/, "")
      .replace(/\/webhook\/?$/, "");

    const targetAgentId = agent_id || voice_call_config?.agent_id || "agent_Lg812J59k27OXl";
    const authHeader = req.headers.get("authorization");

    // DialNexa loads prompt & welcome_message from the agent entity, not the call dispatch payload.
    // Sync the customized prompt, greeting, and latency settings to DialNexa before placing the call.
    await syncDialnexaAgentConfig({
      agent_id: targetAgentId,
      prompt: voice_call_config?.prompt,
      first_message: voice_call_config?.first_message,
      response_eagerness: voice_call_config?.response_eagerness,
      responsiveness: voice_call_config?.responsiveness,
      interruption_sensitivity: voice_call_config?.interruption_sensitivity,
      max_duration_seconds: voice_call_config?.max_duration_seconds,
      end_call_on_silence_sec: voice_call_config?.end_call_on_silence_sec,
      ambient_noise: voice_call_config?.ambient_noise,
      candidate_name: candidate_name || "Recruiter Test",
      role_title: role_title || "ScalePods Voice Agent Test",
      company_name: "ScalePods",
    });

    // All calls are dispatched strictly through the n8n backend workflow engine
    const n8nRes = await fetch(`${n8nBase}/webhook/voice-screen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        candidate_phone: phone,
        candidate_name: candidate_name || "Recruiter Test",
        role_title: role_title || "ScalePods Voice Agent Test",
        company_name: "ScalePods",
        is_test_call: true,
        plan_tier: "enterprise",
        tier: "enterprise",
        is_enterprise: true,
        account_id:
          typeof body.account_id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.account_id)
            ? body.account_id
            : "00000000-0000-0000-0000-000000000000",
        voice_call_config: {
          ...voice_call_config,
          agent_id: targetAgentId,
        },
      }),
    });

    const n8nText = await n8nRes.text();
    let n8nData: Record<string, unknown> = {};
    try {
      n8nData = JSON.parse(n8nText);
    } catch {
      n8nData = { raw: n8nText };
    }

    if (!n8nRes.ok) {
      const extractErrorMessage = (data: Record<string, unknown>): string => {
        if (typeof data.message === "string" && data.message.trim()) return data.message;
        if (typeof data.error === "string" && data.error.trim()) return data.error;
        if (typeof data.error === "object" && data.error !== null) {
          const errObj = data.error as Record<string, unknown>;
          if (typeof errObj.message === "string" && errObj.message.trim()) return errObj.message;
          if (typeof errObj.error === "string" && errObj.error.trim()) return errObj.error;
          try {
            return JSON.stringify(errObj);
          } catch {
            return String(errObj);
          }
        }
        return "Failed to dispatch test call via n8n backend";
      };

      const errorMsg = extractErrorMessage(n8nData);

      return NextResponse.json(
        {
          error: errorMsg,
          detail: n8nData,
        },
        { status: n8nRes.status },
      );
    }

    const callId =
      (n8nData.call_id as string) ||
      (n8nData.dialnexa_call_id as string) ||
      (n8nData.vapi_call_id as string) ||
      (n8nData.id as string) ||
      (typeof n8nData.data === "object" && n8nData.data !== null && "id" in n8nData.data
        ? String((n8nData.data as { id?: unknown }).id)
        : undefined);

    return NextResponse.json({
      success: true,
      mode: "n8n_backend",
      call_id: callId,
      to_phone_number: phone,
      agent_id: targetAgentId,
      message: "Live test call dispatched via n8n backend workflow engine.",
      detail: n8nData,
    });
  } catch (err) {
    console.error("Test call trigger error:", err);
    return NextResponse.json(
      {
        error: "Failed to dispatch test call via n8n backend",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
