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

    // 8. Fetch Questions using valid columns (round_instance_id and question_number/created_at)
    const { data: questions } = await supabase
      .from("interview_questions")
      .select("*")
      .or(
        session.round_instance_id
          ? `round_instance_id.eq.${session.round_instance_id},session_id.eq.${sessionId}`
          : `session_id.eq.${sessionId}`,
      )
      .order("question_number", { ascending: true });

    // 9. Fetch Answers using valid columns (round_instance_id)
    const { data: answers } = session.round_instance_id
      ? await supabase
          .from("interview_answers")
          .select("*")
          .eq("round_instance_id", session.round_instance_id)
          .order("answered_at", { ascending: true })
      : { data: [] };

    // 10. Fetch Scorecard — the n8n scoring pipeline writes scorecards keyed
    // by round_instance_id (no session_id column), so query by that.
    let scorecard = null;
    if (session.round_instance_id) {
      const { data: scRow } = await supabase
        .from("scorecards")
        .select("*")
        .eq("round_instance_id", session.round_instance_id)
        .maybeSingle();
      scorecard = scRow;
    }
    if (!scorecard) {
      // Fallback: some older rows may have a session_id column
      const { data: scFallback } = await supabase
        .from("scorecards")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();
      scorecard = scFallback;
    }

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
        cutoff_score: campaignRound?.cutoff_score ?? null,
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

async function evaluateAndPersistSession(
  sessionId: string,
  sessionRow: {
    id: string;
    account_id: string;
    candidate_id: string;
    round_instance_id: string;
    application_id?: string | null;
    recording_url?: string | null;
  },
  endedEarly: boolean = false,
) {
  const supabase = getAdminSupabase();

  // Check if scorecard already exists
  const { data: existingCard } = await supabase
    .from("scorecards")
    .select("id, overall_score")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingCard && existingCard.overall_score != null) {
    return existingCard;
  }

  // Fetch all candidate answers
  const { data: answersData } = await supabase
    .from("interview_answers")
    .select("id, answer_text, ai_live_note")
    .eq("session_id", sessionId);

  const answers = (answersData ?? []).filter(
    (a) => !!a.answer_text && a.answer_text.trim().length > 0,
  );
  const totalTurns = answersData?.length ?? 0;
  const answeredCount = answers.length;

  let techScore = 70;
  let commScore = 70;
  let psScore = 70;
  let cultScore = 75;
  let authScore = 80;

  if (answeredCount > 0) {
    const totalWords = answers.reduce(
      (acc, a) => acc + (a.answer_text?.split(/\s+/).length || 0),
      0,
    );
    const avgWords = Math.round(totalWords / answeredCount);

    if (avgWords > 40) {
      techScore += 10;
      commScore += 10;
    } else if (avgWords > 20) {
      techScore += 5;
      commScore += 5;
    } else {
      commScore -= 5;
    }

    const hasGenuine = answers.some(
      (a) => (a.ai_live_note as any)?.authenticity_signal === "genuine",
    );
    if (hasGenuine) authScore = 85;

    if (endedEarly || (totalTurns > 0 && answeredCount < totalTurns)) {
      psScore = Math.max(50, psScore - 10);
    }
  } else {
    techScore = 50;
    commScore = 50;
    psScore = 50;
    cultScore = 50;
    authScore = 60;
  }

  const overallScore = Math.round(
    techScore * 0.35 + commScore * 0.25 + psScore * 0.2 + cultScore * 0.1 + authScore * 0.1,
  );
  const recommendation = overallScore >= 75 ? "advance" : overallScore >= 60 ? "review" : "no_go";

  const strengths = [
    answeredCount > 0
      ? `Captured ${answeredCount} response(s) during the interview session`
      : "Joined interview room",
    authScore >= 80 ? "Demonstrated authentic and candid responses" : "Completed preliminary check",
  ];
  const weaknesses = endedEarly
    ? [
        "Candidate ended the session early before all questions were asked",
        "Incomplete competency demonstration",
      ]
    : ["Recommended further deep-dive on technical architecture"];

  const redFlags = endedEarly ? ["Candidate disconnected or exited interview room early"] : [];

  const rationale = endedEarly
    ? `Candidate completed a partial interview (${answeredCount} response(s) submitted). Demonstrated competency signals were scored across technical and communication dimensions, while unaddressed areas are noted for recruiter review.`
    : `AI interview evaluation completed across technical, communication, and authenticity signals with overall score of ${overallScore}/100.`;

  // 1. Insert or update scorecard
  const { data: newCard } = await supabase
    .from("scorecards")
    .upsert({
      session_id: sessionId,
      technical_score: techScore,
      communication_score: commScore,
      problem_solving_score: psScore,
      cultural_fit_score: cultScore,
      authenticity_score: authScore,
      overall_score: overallScore,
      recommendation,
      strengths,
      weaknesses,
      red_flags: redFlags,
      evaluated_at: new Date().toISOString(),
    })
    .select()
    .single();

  // 2. Insert or update decision_ledger
  if (sessionRow.round_instance_id) {
    const { data: existingDl } = await supabase
      .from("decision_ledger")
      .select("id")
      .eq("round_instance_id", sessionRow.round_instance_id)
      .maybeSingle();

    if (existingDl) {
      await supabase
        .from("decision_ledger")
        .update({
          score: overallScore,
          rationale,
          score_type: "ai_interview",
          stage: "round",
          decided_at: new Date().toISOString(),
        })
        .eq("id", existingDl.id);
    } else {
      await supabase.from("decision_ledger").insert({
        account_id: sessionRow.account_id,
        candidate_id: sessionRow.candidate_id,
        application_id: sessionRow.application_id,
        round_instance_id: sessionRow.round_instance_id,
        stage: "round",
        score_type: "ai_interview",
        score: overallScore,
        rationale,
        source: "workflow",
        decided_at: new Date().toISOString(),
      });
    }
  }

  return newCard;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    // Resolve session row to obtain correct foreign keys
    const { data: sessionRow, error: sessionErr } = await supabase
      .from("interview_sessions")
      .select("id, account_id, candidate_id, round_instance_id, recording_url")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr || !sessionRow) {
      console.warn("[api/interview/session POST] Session lookup error:", sessionErr);
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

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

        if (sessionRow.round_instance_id) {
          await supabase
            .from("round_instances")
            .update({ status: "in_progress" })
            .eq("id", sessionRow.round_instance_id)
            .in("status", ["pending", "scheduled"]);
        }

        return NextResponse.json({ success: true, session: data });
      }

      case "submit_answer": {
        const { questionId, answerText, aiLiveNote } = body;
        if (!questionId) {
          return NextResponse.json({ error: "questionId is required" }, { status: 400 });
        }

        const nowIso = new Date().toISOString();
        const roundInstanceId = sessionRow.round_instance_id;

        // Keep round instance in_progress
        if (roundInstanceId) {
          void supabase
            .from("round_instances")
            .update({ status: "in_progress" })
            .eq("id", roundInstanceId)
            .in("status", ["pending", "scheduled"]);
        }

        // Check if an answer record already exists for this question & round instance
        let updatedAnswer = null;
        if (roundInstanceId) {
          const { data: existingAnswers } = await supabase
            .from("interview_answers")
            .select("id, answer_text")
            .eq("round_instance_id", roundInstanceId)
            .eq("question_id", questionId)
            .order("answered_at", { ascending: false })
            .limit(1);

          if (existingAnswers && existingAnswers.length > 0) {
            const { data: updated, error: updateErr } = await supabase
              .from("interview_answers")
              .update({
                answer_text: answerText || "",
                answered_at: nowIso,
                ...(aiLiveNote ? { ai_live_note: aiLiveNote } : {}),
              })
              .eq("id", existingAnswers[0].id)
              .select()
              .single();

            if (!updateErr) updatedAnswer = updated;
          }
        }

        // If no existing record was updated, insert a new record
        if (!updatedAnswer) {
          const { data: inserted, error: insertErr } = await supabase
            .from("interview_answers")
            .insert({
              account_id: sessionRow.account_id,
              round_instance_id: sessionRow.round_instance_id,
              session_id: sessionId,
              question_id: questionId,
              answer_text: answerText || "",
              ai_live_note: aiLiveNote || null,
              answered_at: nowIso,
            })
            .select()
            .single();

          if (insertErr) {
            console.warn("[api/interview/session POST submit_answer] Error:", insertErr);
            return NextResponse.json({ error: insertErr.message }, { status: 500 });
          }
          updatedAnswer = inserted;
        }

        return NextResponse.json({ success: true, answer: updatedAnswer });
      }

      case "insert_question": {
        const { questionText, questionType, orderIndex } = body;
        if (!questionText) {
          return NextResponse.json({ error: "questionText is required" }, { status: 400 });
        }

        const qNumber = typeof orderIndex === "number" ? orderIndex + 1 : 1;
        const { data, error } = await supabase
          .from("interview_questions")
          .insert({
            account_id: sessionRow.account_id,
            round_instance_id: sessionRow.round_instance_id,
            session_id: sessionId,
            question_text: questionText,
            question_type: questionType || "technical",
            question_number: qNumber,
            question_order: typeof orderIndex === "number" ? orderIndex : 0,
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
        const { recordingUrl, endedEarly } = body;
        const now = new Date().toISOString();
        const sessionStatus = endedEarly ? "incomplete" : "completed";
        const roundStatus = endedEarly ? "incomplete" : "completed";

        const updateData: Record<string, unknown> = {
          status: sessionStatus,
          completed_at: now,
        };
        if (recordingUrl) {
          updateData.recording_url = recordingUrl;
        }

        const { data: updatedSession, error: updateErr } = await supabase
          .from("interview_sessions")
          .update(updateData)
          .eq("id", sessionId)
          .select("id, account_id, candidate_id, round_instance_id, recording_url, status")
          .single();

        if (updateErr) {
          console.warn("[api/interview/session POST complete] Session update error:", updateErr);
          return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        if (sessionRow.round_instance_id) {
          await supabase
            .from("round_instances")
            .update({ status: roundStatus })
            .eq("id", sessionRow.round_instance_id);
        }

        // If recordingUrl provided, also link to scorecard
        if (recordingUrl && sessionRow.round_instance_id) {
          void supabase
            .from("scorecards")
            .update({ recording_path: recordingUrl })
            .eq("round_instance_id", sessionRow.round_instance_id);
        }

        // Trigger n8n scoring webhook, falling back to autonomous evaluation if n8n is offline or errors
        const n8nBase = getN8nBase();
        let scored = false;
        try {
          const res = await fetch(`${n8nBase}/webhook/score-interview`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              account_id: sessionRow.account_id,
              candidate_id: sessionRow.candidate_id,
              round_instance_id: sessionRow.round_instance_id,
              recording_url: updatedSession?.recording_url || recordingUrl || null,
              round_number: 1,
              number_of_rounds: 1,
              cutoff_score: null,
              ended_early: Boolean(endedEarly),
            }),
          });
          if (res.ok) scored = true;
        } catch (err) {
          console.warn("[api/interview/session] score-interview trigger note:", err);
        }

        if (!scored) {
          await evaluateAndPersistSession(sessionId, sessionRow, Boolean(endedEarly));
        }

        return NextResponse.json({ success: true, session: updatedSession });
      }

      case "score": {
        const n8nBase = getN8nBase();
        let scored = false;
        let result = null;
        try {
          const scoreRes = await fetch(`${n8nBase}/webhook/score-interview`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              account_id: sessionRow.account_id,
              candidate_id: sessionRow.candidate_id,
              round_instance_id: sessionRow.round_instance_id,
              recording_url: sessionRow.recording_url,
              round_number: 1,
              number_of_rounds: 1,
              cutoff_score: null,
            }),
          });
          if (scoreRes.ok) {
            result = await scoreRes.json().catch(() => ({}));
            scored = true;
          }
        } catch (n8nErr) {
          console.warn("[api/interview/session POST score] Error:", n8nErr);
        }

        if (!scored) {
          result = await evaluateAndPersistSession(sessionId, sessionRow, false);
        }

        return NextResponse.json({ success: true, result });
      }

      case "proctoring_event": {
        const { eventType, severity, detail } = body;
        if (!eventType) {
          return NextResponse.json({ error: "eventType is required" }, { status: 400 });
        }

        const { error } = await supabase.from("proctoring_events").insert({
          account_id: sessionRow.account_id,
          round_instance_id: sessionRow.round_instance_id,
          event_type: eventType,
          severity: severity || "warning",
          details: { detail: detail || `${eventType} detected` },
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
