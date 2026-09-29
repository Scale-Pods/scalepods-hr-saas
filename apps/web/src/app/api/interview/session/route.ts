import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://inkfjgmnxkfitnegpiej.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getN8nBase(): string {
  return (
    process.env.NEXT_PUBLIC_N8N_BASE_URL?.replace(/\/+$/, "") ||
    "https://n8n.srv1711190.hstgr.cloud"
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId") || searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    // 1. Fetch Session
    const { data: session, error: sessionErr } = await supabase
      .from("interview_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr || !session) {
      return NextResponse.json(
        { error: sessionErr?.message || "Interview session not found or link has expired." },
        { status: 404 },
      );
    }

    // 2. Fetch Candidate
    const { data: candidate } = await supabase
      .from("candidates")
      .select("id, name, email, phone, metadata")
      .eq("id", session.candidate_id)
      .maybeSingle();

    // 3. Fetch Round Instance
    const { data: roundInstance } = await supabase
      .from("round_instances")
      .select("id, campaign_id, round_number, round_type, scheduled_at, deadline_at, account_id")
      .eq("id", session.round_instance_id)
      .maybeSingle();

    // 4. Fetch Campaign
    const campaignId = roundInstance?.campaign_id;
    let campaign: { id: string; name: string; number_of_rounds: number; jd_text?: string } | null =
      null;
    if (campaignId) {
      const { data: campRow } = await supabase
        .from("campaigns")
        .select("id, name, number_of_rounds, jd_text")
        .eq("id", campaignId)
        .maybeSingle();
      campaign = campRow;
    }

    // 5. Fetch Campaign Round
    let campaignRound: {
      round_number: number;
      round_type: string;
      cutoff_score: number | null;
    } | null = null;
    if (campaignId && roundInstance?.round_number) {
      const { data: crRow } = await supabase
        .from("campaign_rounds")
        .select("round_number, round_type, cutoff_score")
        .eq("campaign_id", campaignId)
        .eq("round_number", roundInstance.round_number)
        .maybeSingle();
      campaignRound = crRow;
    }

    // 6. Fetch Account Tier
    const accountId = session.account_id || roundInstance?.account_id;
    let accountTier = "enterprise";
    if (accountId) {
      const { data: accRow } = await supabase
        .from("accounts")
        .select("tier")
        .eq("id", accountId)
        .maybeSingle();
      if (accRow?.tier) accountTier = accRow.tier;
    }

    // 7. Resolve Resume Text (from candidate metadata or decision_ledger)
    let resumeText = "";
    if (candidate) {
      const candMeta = candidate.metadata as Record<string, unknown> | null;
      if (typeof candMeta?.resume_text === "string") {
        resumeText = candMeta.resume_text;
      }
    }
    if (!resumeText && session.candidate_id) {
      const { data: dlRow } = await supabase
        .from("decision_ledger")
        .select("reason, metadata")
        .eq("candidate_id", session.candidate_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const dlMeta = dlRow?.metadata as Record<string, unknown> | null;
      if (typeof dlMeta?.resume_text === "string") {
        resumeText = dlMeta.resume_text;
      } else if (typeof dlRow?.reason === "string") {
        resumeText = dlRow.reason;
      }
    }
    if (!resumeText && candidate) {
      resumeText = `Candidate: ${candidate.name || "Candidate"}, Email: ${candidate.email || ""}`;
    }

    // 8. Fetch Questions
    const { data: questions } = await supabase
      .from("interview_questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("order_index", { ascending: true });

    // 9. Fetch Answers
    const { data: answers } = await supabase
      .from("interview_answers")
      .select("*")
      .eq("session_id", sessionId)
      .order("answered_at", { ascending: true });

    // 10. Fetch Scorecard
    const { data: scorecard } = await supabase
      .from("scorecards")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        account_id: session.account_id,
        candidate_id: session.candidate_id,
        round_instance_id: session.round_instance_id,
        status: session.status,
        expires_at: session.expires_at,
        created_at: session.created_at,
        recording_url: session.recording_url,
      },
      candidate: {
        id: candidate?.id || session.candidate_id,
        name: candidate?.name || "Candidate",
        email: candidate?.email || "",
      },
      campaign: {
        id: campaign?.id || campaignId || "",
        name: campaign?.name || "AI Interview Campaign",
        number_of_rounds: campaign?.number_of_rounds || 1,
      },
      round_instance: {
        id: roundInstance?.id || session.round_instance_id,
        round_type: roundInstance?.round_type || "ai_interview",
        scheduled_at: roundInstance?.scheduled_at ?? null,
        deadline_at: roundInstance?.deadline_at ?? null,
      },
      round: {
        round_number: campaignRound?.round_number || roundInstance?.round_number || 1,
        round_type: campaignRound?.round_type || roundInstance?.round_type || "ai_interview",
        cutoff_score: campaignRound?.cutoff_score ?? 70,
      },
      account: {
        id: accountId || "shared",
        tier: accountTier,
      },
      jdText: campaign?.jd_text || "",
      resumeText: resumeText || "",
      questions: questions || [],
      answers: answers || [],
      scorecard: scorecard || null,
    });
  } catch (err) {
    console.error("[api/interview/session GET] Error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    switch (action) {
      case "start": {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from("interview_sessions")
          .update({
            status: "in_progress",
            started_at: now,
          })
          .eq("id", sessionId)
          .select()
          .single();

        if (error) {
          console.warn("[api/interview/session POST start] Error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, session: data });
      }

      case "submit_answer": {
        const { questionId, answerText, aiLiveNote, audioUrl } = body;
        if (!questionId) {
          return NextResponse.json({ error: "questionId is required" }, { status: 400 });
        }

        const { data, error } = await supabase
          .from("interview_answers")
          .insert({
            session_id: sessionId,
            question_id: questionId,
            answer_text: answerText || "",
            ai_live_note: aiLiveNote || null,
            audio_url: audioUrl || null,
            answered_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          console.warn("[api/interview/session POST submit_answer] Error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, answer: data });
      }

      case "insert_question": {
        const { questionText, questionType, orderIndex, source, parentQuestionId } = body;
        if (!questionText) {
          return NextResponse.json({ error: "questionText is required" }, { status: 400 });
        }

        const { data, error } = await supabase
          .from("interview_questions")
          .insert({
            session_id: sessionId,
            question_text: questionText,
            question_type: questionType || "technical",
            order_index: typeof orderIndex === "number" ? orderIndex : 0,
            source: source || "llm_dynamic",
            parent_question_id: parentQuestionId || null,
          })
          .select()
          .single();

        if (error) {
          console.warn("[api/interview/session POST insert_question] Error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, question: data });
      }

      case "complete": {
        const { recordingUrl } = body;
        const now = new Date().toISOString();

        const updateData: Record<string, unknown> = {
          status: "completed",
          completed_at: now,
        };
        if (recordingUrl) {
          updateData.recording_url = recordingUrl;
        }

        const { data: sessionRow, error: sessionErr } = await supabase
          .from("interview_sessions")
          .update(updateData)
          .eq("id", sessionId)
          .select("id, account_id, candidate_id, round_instance_id, recording_url")
          .single();

        if (sessionErr) {
          console.warn("[api/interview/session POST complete] Session update error:", sessionErr);
          return NextResponse.json({ error: sessionErr.message }, { status: 500 });
        }

        // Trigger n8n scoring webhook asynchronously
        const n8nBase = getN8nBase();
        fetch(`${n8nBase}/webhook/score-interview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            account_id: sessionRow.account_id,
            candidate_id: sessionRow.candidate_id,
            round_instance_id: sessionRow.round_instance_id,
            recording_url: sessionRow.recording_url,
          }),
        }).catch((err) => {
          console.warn("[api/interview/session] score-interview trigger note:", err);
        });

        return NextResponse.json({ success: true, session: sessionRow });
      }

      case "proctoring_event": {
        const { eventType, severity, detail } = body;
        if (!eventType) {
          return NextResponse.json({ error: "eventType is required" }, { status: 400 });
        }

        const { error } = await supabase.from("proctoring_events").insert({
          session_id: sessionId,
          event_type: eventType,
          severity: severity || "warning",
          detail: detail || null,
          timestamp: new Date().toISOString(),
        });

        if (error) {
          console.warn("[api/interview/session POST proctoring_event] Error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[api/interview/session POST] Error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 },
    );
  }
}
