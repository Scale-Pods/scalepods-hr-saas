import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getEnv } from "@/env";

const DEFAULT_DIALNEXA_API_KEY =
  "rb0665oacdbt33:7f1d56728f43ab2e3274e928785d840e08457909852df246ae2cae0a8e2350c0";

export interface DialogueTurn {
  speaker: "agent" | "candidate";
  text: string;
  start: number;
  end: number;
}

// In-memory transcript cache to avoid redundant transcription requests
const transcriptCache = new Map<string, { text: string; turns: DialogueTurn[] }>();

async function transcribeAudio(
  audioUrl: string,
): Promise<{ text: string; turns: DialogueTurn[] } | null> {
  if (!audioUrl) return null;
  const cached = transcriptCache.get(audioUrl);
  if (cached) {
    return cached;
  }

  const deepgramKey =
    process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY ||
    process.env.DEEPGRAM_API_KEY ||
    "b173b22cf1ae64501a30f789d6e2794eb84e1b71";

  if (!deepgramKey) return null;

  try {
    const res = await fetch("https://api.deepgram.com/v1/listen?smart_format=true&diarize=true", {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: {
        channels?: Array<{
          alternatives?: Array<{
            transcript?: string;
            words?: Array<{
              word: string;
              punctuated_word?: string;
              speaker?: number;
              start: number;
              end: number;
            }>;
          }>;
        }>;
      };
    };

    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    const fullText = alt?.transcript || "";
    const words = alt?.words || [];

    const turns: DialogueTurn[] = [];
    let currentTurn: DialogueTurn | null = null;

    for (const w of words) {
      const speaker: "agent" | "candidate" = w.speaker === 0 ? "agent" : "candidate";
      const wordStr = w.punctuated_word || w.word || "";
      if (!currentTurn || currentTurn.speaker !== speaker) {
        if (currentTurn) turns.push(currentTurn);
        currentTurn = {
          speaker,
          text: wordStr,
          start: w.start,
          end: w.end,
        };
      } else {
        currentTurn.text += ` ${wordStr}`;
        currentTurn.end = w.end;
      }
    }
    if (currentTurn) turns.push(currentTurn);

    const result = { text: fullText, turns };
    transcriptCache.set(audioUrl, result);
    return result;
  } catch (err) {
    console.warn("Deepgram transcription failed:", err);
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const callId = searchParams.get("call_id") || searchParams.get("id");
    const phone = searchParams.get("phone");
    const accountId = searchParams.get("account_id");
    const campaignId = searchParams.get("campaign_id");
    const candidateId = searchParams.get("candidate_id");
    const apiKey = process.env.DIALNEXA_API_KEY || DEFAULT_DIALNEXA_API_KEY;

    if (!callId && !phone) {
      return NextResponse.json({ calls: [], message: "Provide call_id or phone parameter" });
    }

    // 1. Fetch by direct call_id
    if (callId) {
      try {
        const detailRes = await fetch(`https://api.dialnexa.com/v1/calls/${callId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (detailRes.ok) {
          const detail = (await detailRes.json()) as Record<string, unknown>;
          const postAnalysis = (detail.postcallanalysis as Record<string, unknown>) || {};
          const recUrl = (detail.recording_sas_url as string) || null;

          let transcriptData: { text: string; turns: DialogueTurn[] } | null = null;
          if (recUrl) {
            transcriptData = await transcribeAudio(recUrl);
          }

          const callObj = {
            id: (detail.id as string) || callId,
            duration: Number(detail.duration || 0),
            status: (detail.status as string) || "unknown",
            called_time: (detail.called_time || detail.initiated_time) as string | null,
            end_reason: (detail.end_reason as string) || null,
            sentiment: (postAnalysis.sentiment as string) || null,
            call_successful: (postAnalysis.call_successful as string) || null,
            recording_url: recUrl,
            transcript: transcriptData?.text || null,
            turns: transcriptData?.turns || [],
          };

          return NextResponse.json({
            success: true,
            call: callObj,
            calls: [callObj],
          });
        }
      } catch (callErr) {
        console.warn(`Could not fetch call by id ${callId}:`, callErr);
      }
    }

    // 2. Fetch by phone number with strict account & campaign scoping
    if (!phone) {
      return NextResponse.json({ calls: [] });
    }

    let allowedRoundInstanceIds: string[] | null = null;
    let validOutreachTimes: number[] | null = null;

    if (accountId || candidateId) {
      try {
        const env = getEnv();
        const serviceKey =
          process.env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
          auth: { persistSession: false },
        });

        if (candidateId && accountId) {
          const { data: cand } = await supabase
            .from("candidates")
            .select("id, account_id")
            .eq("id", candidateId)
            .eq("account_id", accountId)
            .maybeSingle();
          if (!cand) {
            return NextResponse.json({ calls: [] });
          }
        }

        if (campaignId && candidateId) {
          const { data: ris } = await supabase
            .from("round_instances")
            .select("id")
            .eq("candidate_id", candidateId)
            .eq("campaign_id", campaignId);
          allowedRoundInstanceIds = (ris ?? []).map((r) => r.id);
        }

        let olQuery = supabase
          .from("outreach_log")
          .select("id, round_instance_id, sent_at")
          .eq("channel", "voice_call");
        if (accountId) olQuery = olQuery.eq("account_id", accountId);
        if (candidateId) olQuery = olQuery.eq("candidate_id", candidateId);

        const { data: ols } = await olQuery;
        const matchingOls = (ols ?? []).filter((ol) => {
          if (allowedRoundInstanceIds && allowedRoundInstanceIds.length > 0) {
            return ol.round_instance_id && allowedRoundInstanceIds.includes(ol.round_instance_id);
          }
          return true;
        });

        if (matchingOls.length === 0 && (accountId || campaignId)) {
          // If this campaign or account never initiated a voice call for this candidate,
          // strictly return empty calls list (prevent leaking foreign calls)
          return NextResponse.json({ calls: [] });
        }

        validOutreachTimes = matchingOls.map((ol) => new Date(ol.sent_at).getTime());
      } catch (dbErr) {
        console.warn("Could not query outreach logs for verification:", dbErr);
      }
    }

    const cleanPhone = phone.replace(/[\s+-]/g, "");

    const res = await fetch("https://api.dialnexa.com/v1/calls", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ calls: [] });
    }

    const data = await res.json();
    const allCalls: Array<Record<string, unknown>> = Array.isArray(data)
      ? data
      : (data as { data?: Array<Record<string, unknown>> }).data || [];

    const matching = allCalls.filter((c) => {
      const toNumber = String(c.to_number || "").replace(/[\s+-]/g, "");
      const matchesPhone = toNumber.includes(cleanPhone) || cleanPhone.includes(toNumber);
      if (!matchesPhone) return false;

      // Check metadata / notes if present
      const meta = (c.metadata || c.notes || {}) as Record<string, unknown>;
      if (accountId && meta.account_id && meta.account_id !== accountId) {
        return false;
      }
      if (candidateId && meta.candidate_id && meta.candidate_id !== candidateId) {
        return false;
      }
      if (
        allowedRoundInstanceIds &&
        allowedRoundInstanceIds.length > 0 &&
        meta.round_instance_id &&
        !allowedRoundInstanceIds.includes(String(meta.round_instance_id))
      ) {
        return false;
      }

      // Check timing against outreach_log to ensure call belongs to this candidate's outreach
      if (validOutreachTimes && validOutreachTimes.length > 0) {
        const callTime = new Date((c.called_time || c.initiated_time) as string).getTime();
        const matchesWindow = validOutreachTimes.some(
          (ot) => Math.abs(callTime - ot) < 45 * 60 * 1000,
        );
        if (!matchesWindow) return false;
      }

      return true;
    });

    // Populate individual call details (including recording_sas_url and transcript) for matching calls
    const calls = await Promise.all(
      matching.slice(0, 5).map(async (c) => {
        let recUrl = (c.recording_sas_url as string) || null;
        if (!recUrl && c.status === "completed" && c.id) {
          try {
            const detailRes = await fetch(`https://api.dialnexa.com/v1/calls/${c.id}`, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
            });
            if (detailRes.ok) {
              const detail = (await detailRes.json()) as { recording_sas_url?: string };
              recUrl = detail.recording_sas_url || null;
            }
          } catch {}
        }

        let transcriptData: { text: string; turns: DialogueTurn[] } | null = null;
        if (recUrl) {
          transcriptData = await transcribeAudio(recUrl);
        }

        const postAnalysis = (c.postcallanalysis as Record<string, unknown>) || {};

        return {
          id: c.id as string,
          duration: Number(c.duration || 0),
          status: (c.status as string) || "unknown",
          called_time: (c.called_time || c.initiated_time) as string | null,
          end_reason: (c.end_reason as string) || null,
          sentiment: (postAnalysis.sentiment as string) || null,
          call_successful: (postAnalysis.call_successful as string) || null,
          recording_url: recUrl,
          transcript: transcriptData?.text || null,
          turns: transcriptData?.turns || [],
        };
      }),
    );

    return NextResponse.json({
      success: true,
      calls,
    });
  } catch (err) {
    console.warn("Could not fetch DialNexa call status:", err);
    return NextResponse.json({ calls: [] });
  }
}
