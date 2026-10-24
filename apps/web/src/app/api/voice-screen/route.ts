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
    let roundQuestions: string[] = [];
    let roundCriteria: string[] = [];

    if (body.candidate_id || roundInstanceId) {
      try {
        const { supabaseServer } = await import("@/lib/supabase/server");
        const supabase = await supabaseServer();

        let riQuery = supabase
          .from("round_instances")
          .select(
            "id, account_id, round_number, campaign_id, campaigns(id, name, voice_call_config)",
          );

        if (roundInstanceId) {
          riQuery = riQuery.eq("id", roundInstanceId);
        } else if (body.candidate_id) {
          riQuery = riQuery
            .eq("candidate_id", body.candidate_id)
            .order("created_at", { ascending: false });
        }

        const { data: ri } = await riQuery.limit(1).maybeSingle();

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

        // Fetch round questions & evaluation criteria if available
        if (ri?.campaign_id && ri?.round_number) {
          const { data: roundDef } = await supabase
            .from("campaign_rounds")
            .select("questions, evaluation_criteria")
            .eq("campaign_id", ri.campaign_id)
            .eq("round_number", ri.round_number)
            .maybeSingle();

          if (Array.isArray(roundDef?.questions) && roundDef.questions.length > 0) {
            roundQuestions = roundDef.questions as string[];
          }
          if (
            Array.isArray(roundDef?.evaluation_criteria) &&
            roundDef.evaluation_criteria.length > 0
          ) {
            roundCriteria = roundDef.evaluation_criteria as string[];
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
        questions: roundQuestions,
        evaluation_criteria: roundCriteria,
      });
    }

    // Try n8n first
    const authHeader = req.headers.get("authorization");
    let n8nSuccess = false;
    let n8nData: Record<string, unknown> = {};

    try {
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
      try {
        n8nData = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        n8nData = { response: responseText };
      }

      if (n8nRes.ok) {
        n8nSuccess = true;
      } else {
        console.warn("[api/voice-screen] n8n returned non-ok status:", n8nRes.status, n8nData);
      }
    } catch (n8nErr) {
      console.warn("[api/voice-screen] n8n webhook unreachable:", n8nErr);
    }

    if (n8nSuccess) {
      return NextResponse.json({
        success: true,
        source: "n8n",
        ...n8nData,
      });
    }

    // Resilient fallback: Direct DialNexa API call dispatch
    console.log("[api/voice-screen] Initiating direct DialNexa call dispatch fallback...");
    const { DEFAULT_DIALNEXA_API_KEY, DEFAULT_DIALNEXA_AGENT_ID } = await import("@/lib/dialnexa");
    const dialnexaApiKey = process.env.DIALNEXA_API_KEY || DEFAULT_DIALNEXA_API_KEY;
    const targetAgentId = voiceCallConfig?.agent_id || DEFAULT_DIALNEXA_AGENT_ID;

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
          candidate_name: body.candidate_name || "Candidate",
          company_name: body.company_name || "ScalePods",
          role_title: roleTitle || "Open Position",
          candidate_id: body.candidate_id || null,
          round_instance_id: roundInstanceId || null,
          account_id: accountId || null,
          source: "scalepods_direct_dispatch",
        },
        notes: {
          candidate_phone: phone,
          candidate_name: body.candidate_name || "Candidate",
          role_title: roleTitle || "Open Position",
          candidate_id: body.candidate_id || null,
          round_instance_id: roundInstanceId || null,
          account_id: accountId || null,
        },
      }),
    });

    const dialnexaText = await dialnexaRes.text();
    let dialnexaData: Record<string, unknown> = {};
    try {
      dialnexaData = JSON.parse(dialnexaText) as Record<string, unknown>;
    } catch {
      dialnexaData = { response: dialnexaText };
    }

    if (!dialnexaRes.ok) {
      return NextResponse.json(
        {
          error:
            (dialnexaData.message as string) ||
            (dialnexaData.error as string) ||
            "DialNexa dispatch failed",
          detail: dialnexaData,
        },
        { status: dialnexaRes.status },
      );
    }

    // Log the call attempt in outreach_log
    try {
      const { supabaseServer } = await import("@/lib/supabase/server");
      const supabase = await supabaseServer();
      if (accountId && body.candidate_id) {
        await supabase.from("outreach_log").insert({
          account_id: accountId,
          candidate_id: body.candidate_id,
          round_instance_id: isUuid(roundInstanceId) ? roundInstanceId : null,
          stage: "voice_screening_call",
          channel: "voice_call",
          delivery_state: "attempted",
        });
      }
    } catch (logErr) {
      console.warn("Could not insert outreach_log attempt:", logErr);
    }

    return NextResponse.json({
      success: true,
      source: "dialnexa_direct",
      status: "call_initiated",
      call: dialnexaData.data || dialnexaData,
    });
  } catch (error) {
    console.error("Voice screening error calling DialNexa / n8n:", error);
    return NextResponse.json(
      {
        error: "Failed to dispatch voice screening call",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
