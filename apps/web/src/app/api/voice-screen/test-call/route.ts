import { NextResponse } from "next/server";
import {
  DEFAULT_DIALNEXA_AGENT_ID,
  DEFAULT_DIALNEXA_API_KEY,
  syncDialnexaAgentConfig,
} from "@/lib/dialnexa";

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

    const targetAgentId =
      agent_id ||
      voice_call_config?.agent_id ||
      DEFAULT_DIALNEXA_AGENT_ID ||
      "agent_Lg812J59k27OXl";
    const authHeader = req.headers.get("authorization");

    // DialNexa loads prompt & welcome_message from the agent entity, not the call dispatch payload.
    // Sync the customized prompt, greeting, and latency settings to DialNexa before placing the call.
    try {
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
    } catch (syncErr) {
      console.warn(
        "[api/voice-screen/test-call] Failed to sync agent config to DialNexa:",
        syncErr,
      );
    }

    // Try dedicated n8n test call webhook (/webhook/voice-screen-test), then legacy /webhook/voice-screen
    let n8nSuccess = false;
    let n8nData: Record<string, unknown> = {};

    const testPayload = JSON.stringify({
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
    });

    const webhooksToTry = [
      process.env.N8N_VOICE_SCREEN_TEST_WEBHOOK_URL || `${n8nBase}/webhook/voice-screen-test`,
      `${n8nBase}/webhook/voice-screen`,
    ];

    for (const webhookUrl of webhooksToTry) {
      try {
        const n8nRes = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          signal: AbortSignal.timeout(4000),
          body: testPayload,
        });

        if (n8nRes.status === 404 && webhookUrl.includes("voice-screen-test")) {
          // Dedicated test webhook not created yet on n8n canvas, continue to fallback
          continue;
        }

        const n8nText = await n8nRes.text();
        try {
          n8nData = JSON.parse(n8nText);
        } catch {
          n8nData = { raw: n8nText };
        }

        if (n8nRes.ok) {
          n8nSuccess = true;
          break;
        } else {
          console.warn(
            `[api/voice-screen/test-call] n8n returned non-ok status from ${webhookUrl}:`,
            n8nRes.status,
            n8nData,
          );
        }
      } catch (n8nErr) {
        console.warn(
          `[api/voice-screen/test-call] n8n webhook unreachable or timed out for ${webhookUrl}:`,
          n8nErr,
        );
      }
    }

    if (n8nSuccess) {
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
        message: "Outbound test call dispatched successfully via n8n.",
        detail: n8nData,
      });
    }

    // Direct DialNexa API fallback when n8n is down, timed out, or unconfigured
    console.log(
      "[api/voice-screen/test-call] Initiating direct DialNexa call dispatch fallback...",
    );
    const dialnexaApiKey = process.env.DIALNEXA_API_KEY || DEFAULT_DIALNEXA_API_KEY;

    const dialnexaRes = await fetch("https://api.dialnexa.com/v1/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dialnexaApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: phone,
        agent_id: targetAgentId,
        metadata: {
          candidate_phone: phone,
          candidate_name: candidate_name || "Recruiter Test",
          company_name: "ScalePods",
          role_title: role_title || "ScalePods Voice Agent Test",
          is_test_call: true,
          source: "scalepods_test_call_fallback",
        },
        notes: {
          candidate_phone: phone,
          candidate_name: candidate_name || "Recruiter Test",
          role_title: role_title || "ScalePods Voice Agent Test",
          is_test_call: true,
          source: "scalepods_test_call_fallback",
        },
      }),
    });

    const dialnexaText = await dialnexaRes.text();
    let dialnexaData: Record<string, unknown> = {};
    try {
      dialnexaData = JSON.parse(dialnexaText);
    } catch {
      dialnexaData = { raw: dialnexaText };
    }

    if (!dialnexaRes.ok) {
      const errorMsg =
        (typeof dialnexaData.message === "string" && dialnexaData.message) ||
        (typeof dialnexaData.error === "string" && dialnexaData.error) ||
        "Failed to dispatch test call via DialNexa";

      return NextResponse.json(
        {
          error: errorMsg,
          detail: dialnexaData,
        },
        { status: dialnexaRes.status },
      );
    }

    const callId =
      (dialnexaData.id as string) ||
      (dialnexaData.call_id as string) ||
      (typeof dialnexaData.data === "object" &&
      dialnexaData.data !== null &&
      "id" in dialnexaData.data
        ? String((dialnexaData.data as { id?: unknown }).id)
        : undefined);

    return NextResponse.json({
      success: true,
      mode: "dialnexa_direct",
      call_id: callId,
      to_phone_number: phone,
      agent_id: targetAgentId,
      message: "Outbound test call dispatched successfully via DialNexa.",
      detail: dialnexaData,
    });
  } catch (err) {
    console.error("Test call trigger error:", err);
    return NextResponse.json(
      {
        error: "Failed to dispatch test call",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
