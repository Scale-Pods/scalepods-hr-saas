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

function parseRealScore(val: unknown): number | null {
  if (typeof val === "number" && !Number.isNaN(val)) {
    return val <= 10 ? Math.round(val * 10) : Math.round(val);
  }
  if (typeof val === "string" && val.trim().length > 0) {
    const num = Number.parseFloat(val);
    if (!Number.isNaN(num)) {
      return num <= 10 ? Math.round(num * 10) : Math.round(num);
    }
  }
  return null;
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
    const res = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&diarize=true&utterances=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${deepgramKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: audioUrl }),
      },
    );

    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: {
        utterances?: Array<{
          speaker: number;
          transcript: string;
          start: number;
          end: number;
        }>;
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
    const rawUtterances = data.results?.utterances || [];
    const words = alt?.words || [];

    // Helper: determine which speaker ID corresponds to the AI agent vs candidate
    const determineAgentSpeakerId = (s0Text: string, s1Text: string, firstText: string): number => {
      const agentRegex =
        /\b(scalepods|calling|interview|screening|position|role|talent\s*partner|application|recruiter|this\s*is|welcome|thanks\s*for\s*taking|can\s*you\s*tell|tell\s*me\s*about|could\s*you\s*share|good\s*time\s*to\s*speak)\b/i;

      const s0Score =
        (s0Text.match(agentRegex) ? 2 : 0) + (s0Text.length > 80 && s1Text.length < 30 ? 1 : 0);
      const s1Score =
        (s1Text.match(agentRegex) ? 2 : 0) + (s1Text.length > 80 && s0Text.length < 30 ? 1 : 0);

      if (s1Score > s0Score) return 1;
      if (s0Score > s1Score) return 0;

      // If the opening remark is a typical phone greeting like "Hello?", speaker 0 is candidate answering
      if (
        /^(hello|hi|yeah|yes|speaking|hey|who\s*(is|'s)\s*this)[\s.?!]*$/i.test(firstText.trim())
      ) {
        return 1;
      }
      return 0;
    };

    let turns: DialogueTurn[] = [];

    if (rawUtterances.length > 0) {
      const s0Text = rawUtterances
        .filter((u) => u.speaker === 0)
        .map((u) => u.transcript)
        .join(" ");
      const s1Text = rawUtterances
        .filter((u) => u.speaker === 1)
        .map((u) => u.transcript)
        .join(" ");
      const firstText = rawUtterances[0]?.transcript || "";
      const agentSpeakerId = determineAgentSpeakerId(s0Text, s1Text, firstText);

      turns = rawUtterances
        .map((u) => ({
          speaker: (u.speaker === agentSpeakerId ? "agent" : "candidate") as "agent" | "candidate",
          text: u.transcript?.trim() || "",
          start: Math.round(u.start * 10) / 10,
          end: Math.round(u.end * 10) / 10,
        }))
        .filter((t) => Boolean(t.text));
    } else if (words.length > 0) {
      const s0Text = words
        .filter((w) => w.speaker === 0)
        .map((w) => w.punctuated_word || w.word)
        .join(" ");
      const s1Text = words
        .filter((w) => w.speaker === 1)
        .map((w) => w.punctuated_word || w.word)
        .join(" ");
      const firstText = words
        .slice(0, 3)
        .map((w) => w.punctuated_word || w.word)
        .join(" ");
      const agentSpeakerId = determineAgentSpeakerId(s0Text, s1Text, firstText);

      let currentTurn: DialogueTurn | null = null;
      for (const w of words) {
        const speaker: "agent" | "candidate" = w.speaker === agentSpeakerId ? "agent" : "candidate";
        const wordStr = w.punctuated_word || w.word || "";
        if (!currentTurn || currentTurn.speaker !== speaker) {
          if (currentTurn) turns.push(currentTurn);
          currentTurn = {
            speaker,
            text: wordStr,
            start: Math.round(w.start * 10) / 10,
            end: Math.round(w.end * 10) / 10,
          };
        } else {
          currentTurn.text += ` ${wordStr}`;
          currentTurn.end = Math.round(w.end * 10) / 10;
        }
      }
      if (currentTurn) turns.push(currentTurn);
    }

    const finalFullText =
      fullText ||
      turns.map((t) => `${t.speaker === "agent" ? "Agent" : "Candidate"}: ${t.text}`).join("\n") ||
      "";

    const result = { text: finalFullText, turns };
    transcriptCache.set(audioUrl, result);
    return result;
  } catch (err) {
    console.warn("Deepgram transcription failed:", err);
    return null;
  }
}

function parseMetaObj(val: unknown): Record<string, unknown> {
  if (!val) return {};
  if (typeof val === "object" && val !== null) return val as Record<string, unknown>;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch {}
  }
  return {};
}

function checkIsTestCall(c: Record<string, unknown>, meta: Record<string, unknown>): boolean {
  if (c.is_test_call === true || c.is_test_call === "true") return true;
  if (meta.is_test_call === true || meta.is_test_call === "true") return true;
  const source = String(meta.source || c.source || "").toLowerCase();
  if (source.includes("test")) return true;
  const candidateName = String(meta.candidate_name || c.candidate_name || "").toLowerCase();
  if (candidateName.includes("recruiter test") || candidateName.includes("alex morgan"))
    return true;
  const roleTitle = String(meta.role_title || c.role_title || "").toLowerCase();
  if (roleTitle.includes("agent test") || roleTitle.includes("voice agent test")) return true;
  return false;
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

          let finalTurns = transcriptData?.turns || [];
          if (finalTurns.length === 0 && Array.isArray(detail.messages)) {
            finalTurns = (detail.messages as Array<{ role?: string; content?: string }>).map(
              (m, i) => ({
                speaker: (m.role === "assistant" || m.role === "agent" ? "agent" : "candidate") as
                  | "agent"
                  | "candidate",
                text: m.content || "",
                start: i * 4,
                end: (i + 1) * 4,
              }),
            );
          }

          const rawTranscript =
            transcriptData?.text ||
            (detail.transcript as string) ||
            (detail.transcript_text as string) ||
            (postAnalysis.transcript as string) ||
            null;

          const callObj = {
            id: (detail.id as string) || callId,
            duration: Number(detail.duration || 0),
            status: (detail.status as string) || "unknown",
            called_time: (detail.called_time || detail.initiated_time) as string | null,
            end_reason: (detail.end_reason as string) || null,
            sentiment: (postAnalysis.sentiment as string) || null,
            call_successful: (postAnalysis.call_successful as string) || null,
            recording_url: recUrl,
            transcript: rawTranscript,
            turns: finalTurns,
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

      // Parse metadata / notes / variables cleanly
      const meta = {
        ...parseMetaObj(c.metadata),
        ...parseMetaObj(c.notes),
        ...parseMetaObj(c.variables),
        ...parseMetaObj(c.dynamic_variables),
      };
      const isCallTest = checkIsTestCall(c, meta);

      // Separate test calls from real candidate campaign calls
      if (isTestCallQuery && !isCallTest && !sinceMs) {
        return false;
      }
      // CRITICAL: NEVER show or return test calls when querying for candidates or campaigns in the frontend
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
        const meta = {
          ...parseMetaObj(c.metadata),
          ...parseMetaObj(c.notes),
          ...parseMetaObj(c.variables),
          ...parseMetaObj(c.dynamic_variables),
        };
        const isCallTest = checkIsTestCall(c, meta);

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
        const durationSec = Number(c.duration || 0);

        // Extract real evaluation score from DialNexa post-call analysis only
        const rawTech = parseRealScore(
          postAnalysis.technical_qualification_score ??
            postAnalysis.technical_score ??
            postAnalysis.tech_score,
        );
        const rawComm = parseRealScore(
          postAnalysis.communication_skills_score ??
            postAnalysis.communication_score ??
            postAnalysis.comm_score,
        );
        let realOverall = parseRealScore(postAnalysis.overall_score ?? postAnalysis.score);
        if (realOverall == null && rawTech != null && rawComm != null) {
          realOverall = Math.round(rawTech * 0.6 + rawComm * 0.4);
        } else if (realOverall == null && (rawTech != null || rawComm != null)) {
          realOverall = rawTech ?? rawComm;
        }

        const rawRec =
          (typeof postAnalysis.overall_recommendation === "string" &&
            postAnalysis.overall_recommendation.trim()) ||
          (typeof postAnalysis.recommendation === "string" && postAnalysis.recommendation.trim()) ||
          null;

        const callScorecard =
          realOverall != null
            ? {
                overall_score: realOverall,
                recommendation:
                  rawRec ||
                  (realOverall >= 75 ? "advance" : realOverall >= 60 ? "review" : "no_go"),
                reason:
                  (typeof postAnalysis.screening_summary === "string" &&
                    postAnalysis.screening_summary.trim()) ||
                  (typeof postAnalysis.key_strengths_summary === "string" &&
                    postAnalysis.key_strengths_summary.trim()) ||
                  `AI voice screening completed. Candidate evaluated with an overall score of ${realOverall}/100.`,
                metrics: [
                  ...(rawComm != null
                    ? [
                        {
                          name: "Verbal Communication & Fluency",
                          score: rawComm,
                          reason: "Evaluated from candidate spoken responses during screening.",
                        },
                      ]
                    : []),
                  ...(rawTech != null
                    ? [
                        {
                          name: "Technical Qualification & Alignment",
                          score: rawTech,
                          reason: "Evaluated from candidate stated technical depth and background.",
                        },
                      ]
                    : []),
                ],
                strengths:
                  typeof postAnalysis.key_strengths_summary === "string" &&
                  postAnalysis.key_strengths_summary.trim()
                    ? [postAnalysis.key_strengths_summary.trim()]
                    : [],
                concerns: [],
              }
            : null;

        let finalTurns = transcriptData?.turns || [];
        if (finalTurns.length === 0 && Array.isArray(c.messages)) {
          finalTurns = (c.messages as Array<{ role?: string; content?: string }>).map((m, i) => ({
            speaker: (m.role === "assistant" || m.role === "agent" ? "agent" : "candidate") as
              | "agent"
              | "candidate",
            text: m.content || "",
            start: i * 4,
            end: (i + 1) * 4,
          }));
        }

        const rawTranscript =
          transcriptData?.text ||
          (c.transcript as string) ||
          (c.transcript_text as string) ||
          (postAnalysis.transcript as string) ||
          null;

        const callObj = {
          id: c.id as string,
          duration: durationSec,
          status: (c.status as string) || "unknown",
          called_time: (c.called_time || c.initiated_time) as string | null,
          end_reason: (c.end_reason as string) || null,
          sentiment: (postAnalysis.sentiment as string) || null,
          call_successful: (postAnalysis.call_successful as string) || null,
          recording_url: recUrl,
          transcript: rawTranscript,
          turns: finalTurns,
          scorecard: callScorecard,
        };

        // If call is completed and candidate belongs to this account, auto-record score in decision_ledger
        // CRITICAL: NEVER store test calls into decision_ledger or candidate records
        if (
          callObj.status === "completed" &&
          candidateId &&
          accountId &&
          !isCallTest &&
          !isTestCallQuery
        ) {
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
            realScore: realOverall,
            realRationale: callScorecard?.reason || null,
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
  realScore?: number | null;
  realRationale?: string | null;
}) {
  const {
    candidateId,
    accountId,
    roundInstanceId,
    callId,
    duration,
    status,
    transcript,
    realScore,
    realRationale,
  } = params;

  if (!candidateId || !accountId || status !== "completed") return;

  // Never store test calls into decision_ledger
  const lowerTranscript = String(transcript || "").toLowerCase();
  const lowerRationale = String(realRationale || "").toLowerCase();
  if (
    lowerTranscript.includes("is_test_call") ||
    lowerTranscript.includes("recruiter test") ||
    lowerTranscript.includes("alex morgan") ||
    lowerTranscript.includes("scalepods voice agent test") ||
    lowerRationale.includes("test call") ||
    lowerRationale.includes("recruiter test") ||
    lowerRationale.includes("alex morgan")
  ) {
    return;
  }

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

    // If no real evaluation score was returned by DialNexa post-call analysis,
    // do NOT insert synthetic/dummy scores into decision_ledger. Only real scores or nothing.
    if (realScore == null) {
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
      return;
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

    const rationale =
      realRationale ||
      `AI voice screening completed with verified evaluation score of ${realScore}/100.`;

    const rawText =
      transcript || `DialNexa call ${callId}: duration ${duration}s, status: ${status}.`;

    await adminSupabase.from("decision_ledger").insert({
      account_id: accountId,
      candidate_id: candidateId,
      application_id: appId,
      round_instance_id: targetRiId || null,
      stage: "voice_screen",
      score: realScore,
      rationale,
      raw_text: rawText,
      source: "dialnexa",
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
