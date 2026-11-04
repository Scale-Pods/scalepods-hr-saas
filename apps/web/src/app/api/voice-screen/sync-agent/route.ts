import { NextResponse } from "next/server";
import { syncDialnexaAgentConfig } from "@/lib/dialnexa";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      campaign_id,
      voice_call_config,
      role_title,
      job_description,
      candidate_resume,
      questions,
      evaluation_criteria,
    } = body;

    if (!voice_call_config || typeof voice_call_config !== "object") {
      return NextResponse.json({ error: "voice_call_config is required" }, { status: 400 });
    }

    const syncResult = await syncDialnexaAgentConfig({
      agent_id: voice_call_config.agent_id,
      voice: voice_call_config.voice,
      voice_speed: voice_call_config.voice_speed,
      voice_pitch: voice_call_config.voice_pitch,
      voice_temperature: voice_call_config.voice_temperature,
      prompt: voice_call_config.prompt,
      first_message: voice_call_config.first_message,
      response_eagerness: voice_call_config.response_eagerness,
      responsiveness: voice_call_config.responsiveness,
      interruption_sensitivity: voice_call_config.interruption_sensitivity,
      max_duration_seconds: voice_call_config.max_duration_seconds,
      end_call_on_silence_sec: voice_call_config.end_call_on_silence_sec,
      ambient_noise: voice_call_config.ambient_noise,
      role_title: role_title || "ScalePods Voice Agent",
      company_name: "ScalePods",
      job_description,
      candidate_resume,
      questions,
      evaluation_criteria,
      outbound_from_number:
        voice_call_config.outbound_from_number ||
        voice_call_config.from_phone_number ||
        voice_call_config.from_number,
    });

    if (campaign_id) {
      try {
        const supabase = await supabaseServer();
        const updatedConfig = {
          ...voice_call_config,
          ...(syncResult.version_number ? { agent_version_number: syncResult.version_number } : {}),
          ...(syncResult.outbound_from_number
            ? { outbound_from_number: syncResult.outbound_from_number }
            : {}),
          ...(syncResult.phone_number_id ? { phone_number_id: syncResult.phone_number_id } : {}),
        };
        await supabase
          .from("campaigns")
          .update({ voice_call_config: updatedConfig })
          .eq("id", campaign_id);
      } catch (dbErr) {
        console.warn("[api/voice-screen/sync-agent] Failed to update campaign in Supabase:", dbErr);
      }
    }

    return NextResponse.json({
      success: syncResult.success,
      version_number: syncResult.version_number,
      outbound_from_number: syncResult.outbound_from_number,
      phone_number_id: syncResult.phone_number_id,
      error: syncResult.error,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/voice-screen/sync-agent] Exception:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
