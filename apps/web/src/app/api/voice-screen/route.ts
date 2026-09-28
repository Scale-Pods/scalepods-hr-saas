import { NextResponse } from "next/server";

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

    if ((!roundInstanceId || !voiceCallConfig) && body.candidate_id) {
      try {
        const { supabaseServer } = await import("@/lib/supabase/server");
        const supabase = await supabaseServer();
        const { data: ri } = await supabase
          .from("round_instances")
          .select("id, campaigns(id, name, voice_call_config)")
          .eq("candidate_id", body.candidate_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ri?.id) {
          roundInstanceId = roundInstanceId || ri.id;
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
        round_instance_id: roundInstanceId || null,
        voice_call_config: voiceCallConfig || undefined,
        role_title: roleTitle || undefined,
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
      return NextResponse.json(
        {
          error: (data.message as string) || (data.error as string) || "n8n workflow error",
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
