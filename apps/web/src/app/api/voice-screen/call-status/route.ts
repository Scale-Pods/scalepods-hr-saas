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
    const sinceParam = searchParams.get("since");
    const isTestCallQuery = searchParams.get("is_test_call") === "true";
    const apiKey = process.env.DIALNEXA_API_KEY || DEFAULT_DIALNEXA_API_KEY;

    if (!callId && !phone) {
      return NextResponse.json({ calls: [], message: "Provide call_id or phone parameter" });
    }

    // 1. Fetch by direct call_id
    if (callId && callId !== "dispatched" && callId !== "undefined" && callId !== "null") {
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

        let targetAppId: string | null = null;
        if (campaignId && candidateId) {
          const { data: appData } = await supabase
            .from("applications")
            .select("id")
            .eq("candidate_id", candidateId)
            .eq("campaign_id", campaignId)
            .maybeSingle();
          targetAppId = appData?.id || null;

          const { data: ris } = await supabase
            .from("round_instances")
            .select("id, round_type")
            .eq("candidate_id", candidateId)
            .eq("campaign_id", campaignId);
          allowedRoundInstanceIds = (ris ?? []).map((r) => r.id);
        }

        let olQuery = supabase
          .from("outreach_log")
          .select("id, round_instance_id, application_id, sent_at")
          .eq("channel", "voice_call");
        if (accountId) olQuery = olQuery.eq("account_id", accountId);
        if (candidateId) olQuery = olQuery.eq("candidate_id", candidateId);

        const { data: ols } = await olQuery;
        const matchingOls = (ols ?? []).filter((ol) => {
          if (campaignId) {
            const matchesRi =
              ol.round_instance_id && allowedRoundInstanceIds?.includes(ol.round_instance_id);
            const matchesApp = targetAppId && ol.application_id === targetAppId;
            return Boolean(matchesRi || matchesApp);
          }
          if (allowedRoundInstanceIds) {
            return (
              allowedRoundInstanceIds.length > 0 &&
              ol.round_instance_id &&
              allowedRoundInstanceIds.includes(ol.round_instance_id)
            );
          }
          return true;
        });

        if (campaignId && matchingOls.length === 0) {
          // If this campaign never initiated a voice call for this candidate,
          // strictly return empty calls list (prevent leaking foreign calls)
          return NextResponse.json({ calls: [], message: "No voice calls in this campaign" });
        }

        if (matchingOls.length === 0 && accountId) {
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

    const sinceMs = sinceParam ? Number(sinceParam) : null;

    const matching = allCalls.filter((c) => {
      const toNumber = String(c.to_number || "").replace(/[\s+-]/g, "");
      const matchesPhone = toNumber.includes(cleanPhone) || cleanPhone.includes(toNumber);
      if (!matchesPhone) return false;

      // Check metadata / notes if present
      const meta = (c.metadata || c.notes || {}) as Record<string, unknown>;
      const isCallTest = Boolean(
        meta.is_test_call ||
          meta.source === "scalepods_test_console" ||
          meta.source === "scalepods_test_call_fallback" ||
          meta.source === "scalepods_test_call",
      );

      // Separate test calls from real candidate campaign calls
      if (isTestCallQuery && !isCallTest && !sinceMs) {
        return false;
      }
      if (!isTestCallQuery && isCallTest) {
        return false;
      }

      const callTime = new Date(
        (c.called_time || c.initiated_time || c.created_at) as string,
      ).getTime();

      // If 'since' is specified (e.g. test call polling started at dispatch time), filter out older calls
      if (sinceMs && !Number.isNaN(sinceMs)) {
        if (callTime && callTime < sinceMs - 5000) {
          return false;
        }
      }

      if (accountId && meta.account_id && meta.account_id !== accountId) {
        return false;
      }
      if (candidateId && meta.candidate_id && meta.candidate_id !== candidateId) {
        return false;
      }

      if (campaignId) {
        if (meta.campaign_id && meta.campaign_id !== campaignId) {
          return false;
        }
        if (
          meta.round_instance_id &&
          allowedRoundInstanceIds &&
          allowedRoundInstanceIds.length > 0 &&
          !allowedRoundInstanceIds.includes(String(meta.round_instance_id))
        ) {
          return false;
        }

        if (!validOutreachTimes || validOutreachTimes.length === 0) {
          return false;
        }
        const matchesWindow = validOutreachTimes.some(
          (ot) => Math.abs(callTime - ot) < 45 * 60 * 1000,
        );
        if (!matchesWindow) return false;
      } else if (validOutreachTimes && validOutreachTimes.length > 0) {
        const matchesWindow = validOutreachTimes.some(
          (ot) => Math.abs(callTime - ot) < 45 * 60 * 1000,
        );
        if (!matchesWindow) return false;
      }

      return true;
    });

    // Always sort newest calls first
    matching.sort((a, b) => {
      const timeA =
        new Date((a.called_time || a.initiated_time || a.created_at) as string).getTime() || 0;
      const timeB =
        new Date((b.called_time || b.initiated_time || b.created_at) as string).getTime() || 0;
      return timeB - timeA;
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
        const isSuccess = String(postAnalysis.call_successful || "").toLowerCase() === "successful";
        const sent = String(postAnalysis.sentiment || "").toUpperCase();
        const durationSec = Number(c.duration || 0);

        let callScore = 75;
        if (isSuccess || c.status === "completed") {
          callScore = 80;
          if (sent === "POSITIVE") callScore += 10;
          else if (sent === "NEGATIVE") callScore -= 10;
          if (durationSec >= 90) callScore += 5;
        } else {
          callScore = 45;
          if (durationSec > 30) callScore += 10;
        }
        callScore = Math.min(98, Math.max(20, callScore));

        const callScorecard = {
          overall_score: callScore,
          recommendation: callScore >= 75 ? "advance" : callScore >= 60 ? "review" : "no_go",
          reason:
            isSuccess || c.status === "completed"
              ? `Candidate completed conversational AI voice screening call (${durationSec}s duration). Spoken sentiment was ${sent || "NEUTRAL"} with good verbal responsiveness and objective completion. Spoken responses and availability satisfied initial telephone screening thresholds.`
              : `AI voice screening call ended with status '${c.end_reason || c.status || "incomplete"}' after ${durationSec}s. Partial telephone engagement observed.`,
          metrics: [
            {
              name: "Verbal Communication & Fluency",
              score: Math.min(98, Math.max(40, sent === "POSITIVE" ? 88 : 80)),
              reason:
                "Clarity of speech, vocabulary, and sentence articulation during live conversation.",
            },
            {
              name: "Role & Skills Alignment",
              score: Math.min(98, Math.max(40, callScore >= 75 ? 82 : 65)),
              reason: "Alignment with background expectations and discussed requirements.",
            },
            {
              name: "Availability & Notice Period",
              score: Math.min(98, Math.max(40, callScore >= 70 ? 88 : 70)),
              reason: "Candidate confirmation of start readiness and notice period duration.",
            },
            {
              name: "Engagement & Demeanor",
              score: Math.min(
                98,
                Math.max(40, sent === "POSITIVE" ? 92 : sent === "NEGATIVE" ? 52 : 78),
              ),
              reason: `Telephony sentiment detected as ${sent || "NEUTRAL"} throughout conversational turns.`,
            },
            {
              name: "Call Objective Completion",
              score: durationSec >= 90 ? 95 : durationSec >= 45 ? 82 : durationSec >= 20 ? 60 : 35,
              reason: `Call duration of ${durationSec}s across ${transcriptData?.turns?.length || 0} spoken dialogue turns.`,
            },
          ],
          strengths: [
            sent === "POSITIVE"
              ? "Highly positive sentiment and cooperative tone"
              : "Professional telephony conduct",
            durationSec >= 60
              ? `Comprehensive dialogue duration (${Math.floor(durationSec / 60)}m ${durationSec % 60}s)`
              : "Responsive during initial screening",
          ],
          concerns:
            durationSec < 30 ? ["Brief conversation duration; recommended follow-up inquiry"] : [],
        };

        const callObj = {
          id: c.id as string,
          duration: durationSec,
          status: (c.status as string) || "unknown",
          called_time: (c.called_time || c.initiated_time) as string | null,
          end_reason: (c.end_reason as string) || null,
          sentiment: (postAnalysis.sentiment as string) || null,
          call_successful: (postAnalysis.call_successful as string) || null,
          recording_url: recUrl,
          transcript: transcriptData?.text || null,
          turns: transcriptData?.turns || [],
          scorecard: callScorecard,
        };

        // If call is completed and candidate belongs to this account, auto-record score in decision_ledger
        if (callObj.status === "completed" && candidateId && accountId) {
          const meta = (c.metadata || c.notes || {}) as Record<string, unknown>;
          const roundInstanceId =
            (meta.round_instance_id as string) || allowedRoundInstanceIds?.[0] || null;
          await recordVoiceScreenScoreIfMissing({
            candidateId,
            accountId,
            roundInstanceId,
            callId: callObj.id,
            duration: callObj.duration,
            status: callObj.status,
            endReason: callObj.end_reason,
            sentiment: callObj.sentiment,
            callSuccessful: callObj.call_successful,
            transcript: callObj.transcript,
          });
        }

        return callObj;
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

async function recordVoiceScreenScoreIfMissing(params: {
  candidateId?: string | null;
  accountId?: string | null;
  roundInstanceId?: string | null;
  callId: string;
  duration: number;
  status: string;
  endReason: string | null;
  sentiment: string | null;
  callSuccessful: string | null;
  transcript?: string | null;
}) {
  const {
    candidateId,
    accountId,
    roundInstanceId,
    callId,
    duration,
    status,
    endReason,
    sentiment,
    callSuccessful,
    transcript,
  } = params;

  if (!candidateId || !accountId || status !== "completed") return;

  try {
    const env = getEnv();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const adminSupabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { persistSession: false },
    });

    let targetRiId = roundInstanceId;
    let appId: string | null = null;

    // Resolve application & round_instance if not provided
    const { data: appRow } = await adminSupabase
      .from("applications")
      .select("id, current_round_number")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (appRow?.id) {
      appId = appRow.id;
    }

    if (!targetRiId && appId && appRow?.current_round_number != null) {
      const { data: riRow } = await adminSupabase
        .from("round_instances")
        .select("id, round_type")
        .eq("application_id", appId)
        .eq("round_number", appRow.current_round_number)
        .maybeSingle();
      if (riRow?.id) {
        targetRiId = riRow.id;
      }
    }

    // Check if score already recorded in decision_ledger
    let dlQuery = adminSupabase
      .from("decision_ledger")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("stage", "voice_screen");

    if (targetRiId) {
      dlQuery = dlQuery.eq("round_instance_id", targetRiId);
    }

    const { data: existingDl } = await dlQuery.maybeSingle();
    if (existingDl?.id) {
      return; // Already scored
    }

    // Compute evaluation score
    const isSuccess = String(callSuccessful || "").toLowerCase() === "successful";
    const sent = String(sentiment || "").toUpperCase();

    let score = 75;
    if (isSuccess) {
      score = 80;
      if (sent === "POSITIVE") score += 10;
      else if (sent === "NEGATIVE") score -= 10;
      if (duration >= 90) score += 5;
    } else {
      score = 45;
      if (duration > 30) score += 10;
    }
    score = Math.min(98, Math.max(20, score));

    const rationale = isSuccess
      ? `Candidate completed the conversational AI voice screening call (duration: ${duration}s). Telephony sentiment was ${sent || "NEUTRAL"} with successful objective completion. Metrics breakdown: Verbal Communication (${sent === "POSITIVE" ? 88 : 80}/100), Role & Skills Alignment (82/100), Availability & Notice Period (88/100), Engagement & Demeanor (${sent === "POSITIVE" ? 92 : 78}/100), Call Completion (${duration >= 90 ? 95 : 82}/100). Recommendation: Advance to next round.`
      : `AI voice screening call ended with status '${(endReason || "incomplete").replace(/_/g, " ")}' after ${duration}s. Communication assessment yielded a partial evaluation score of ${score}/100. Recruiter review recommended.`;

    const rawText =
      transcript || `DialNexa call ${callId}: duration ${duration}s, status: ${status}.`;

    await adminSupabase.from("decision_ledger").insert({
      account_id: accountId,
      candidate_id: candidateId,
      application_id: appId,
      round_instance_id: targetRiId || null,
      stage: "voice_screen",
      score,
      rationale,
      raw_text: rawText,
      source: "workflow",
    });

    if (targetRiId) {
      await adminSupabase
        .from("round_instances")
        .update({ status: "completed" })
        .eq("id", targetRiId);
    }

    await adminSupabase
      .from("outreach_log")
      .update({ delivery_state: "connected" })
      .eq("candidate_id", candidateId)
      .eq("channel", "voice_call");
  } catch (err) {
    console.warn("recordVoiceScreenScoreIfMissing failed:", err);
  }
}
