import { NextResponse } from "next/server";
import { syncDialnexaAgentConfig } from "@/lib/dialnexa";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { candidate_phone } = body;

    if (!candidate_phone) {
      return NextResponse.json({ error: "Candidate phone number is required" }, { status: 400 });
    }

    let phone = String(candidate_phone).replace(/\s+/g, "");
    if (!phone.startsWith("+")) {
      phone = phone.length === 10 ? `+91${phone}` : `+${phone}`;
    }

    const n8nBase = (process.env.NEXT_PUBLIC_N8N_BASE_URL || "https://n8n.srv1711190.hstgr.cloud")
      .replace(/\/+$/, "")
      .replace(/\/webhook\/?$/, "");

    let roundInstanceId = body.round_instance_id;
    let voiceCallConfig = body.voice_call_config;
    let roleTitle = body.role_title;
    let accountId = body.account_id;
    let planTier = body.plan_tier || body.tier;

    if (body.candidate_id && (!roundInstanceId || !voiceCallConfig || !accountId)) {
      try {
        const { supabaseServer } = await import("@/lib/supabase/server");
        const supabase = await supabaseServer();
        const { data: ri } = await supabase
          .from("round_instances")
          .select("id, account_id, campaigns(id, name, voice_call_config)")
          .eq("candidate_id", body.candidate_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ri?.id) {
          roundInstanceId = roundInstanceId || ri.id;
        }
        if (ri?.account_id) {
          accountId = accountId || ri.account_id;
        }
        if (ri?.campaigns) {
          const camp = Array.isArray(ri.campaigns)
            ? (ri.campaigns[0] as { id?: string; name?: string; voice_call_config?: unknown })
            : (ri.campaigns as { id?: string; name?: string; voice_call_config?: unknown });
          if (!voiceCallConfig && camp?.voice_call_config) {
            voiceCallConfig = camp.voice_call_config;
          }
          if (!roleTitle && camp?.name) {
            roleTitle = camp.name;
          }
        }
      } catch (dbErr) {
        console.warn("Could not resolve round_instance or campaign from Supabase:", dbErr);
      }
    }

    const isUuid = (val: unknown): val is string =>
      typeof val === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    if (accountId && isUuid(accountId) && !planTier) {
      try {
        const { supabaseServer } = await import("@/lib/supabase/server");
        const supabase = await supabaseServer();
        const { data: acc } = await supabase
          .from("accounts")
          .select("tier")
          .eq("id", accountId)
          .maybeSingle();
        if (acc?.tier) {
          planTier = acc.tier;
        }
      } catch (accErr) {
        console.warn("Could not resolve account tier from Supabase:", accErr);
      }
    }

    const isEnterprise = String(planTier || "").toLowerCase() === "enterprise";

    if (voiceCallConfig) {
      await syncDialnexaAgentConfig({
        agent_id: voiceCallConfig.agent_id,
        prompt: voiceCallConfig.prompt,
        first_message: voiceCallConfig.first_message,
        response_eagerness: voiceCallConfig.response_eagerness,
        responsiveness: voiceCallConfig.responsiveness,
        interruption_sensitivity: voiceCallConfig.interruption_sensitivity,
        max_duration_seconds: voiceCallConfig.max_duration_seconds,
        end_call_on_silence_sec: voiceCallConfig.end_call_on_silence_sec,
        ambient_noise: voiceCallConfig.ambient_noise,
        candidate_name: body.candidate_name,
        role_title: roleTitle,
        company_name: body.company_name || "ScalePods",
      });
    }

    const authHeader = req.headers.get("authorization");
    const n8nRes = await fetch(`${n8nBase}/webhook/voice-screen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        ...body,
        candidate_phone: phone,
        round_instance_id: isUuid(roundInstanceId) ? roundInstanceId : null,
        account_id: isUuid(accountId) ? accountId : "00000000-0000-0000-0000-000000000000",
        voice_call_config: voiceCallConfig || undefined,
        role_title: roleTitle || undefined,
        plan_tier: planTier || undefined,
        tier: planTier || undefined,
        is_enterprise: isEnterprise,
      }),
    });

    const responseText = await n8nRes.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      data = { response: responseText };
    }

    if (!n8nRes.ok) {
      const errorMsg =
        typeof data.message === "string" && data.message
          ? data.message
          : typeof data.error === "string" && data.error
            ? data.error
            : typeof data.error === "object" &&
                data.error !== null &&
                typeof (data.error as Record<string, unknown>).message === "string"
              ? String((data.error as Record<string, unknown>).message)
              : "n8n workflow error";

      return NextResponse.json(
        {
          error: errorMsg,
          detail: data,
        },
        { status: n8nRes.status },
      );
    }

    return NextResponse.json({
      success: true,
      source: "n8n",
      ...data,
    });
  } catch (error) {
    console.error("Voice screening error calling n8n:", error);
    return NextResponse.json(
      {
        error: "Failed to dispatch call to n8n",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
