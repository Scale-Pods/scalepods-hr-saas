import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { sanitizeQuestionPlaceholders } from "@/features/interview/utils/llm";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase credentials are not configured.");
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

function formatNameFromEmail(email: string): string {
  if (!email?.includes("@")) return "";
  const prefix = email
    .split("@")[0]
    .replace(/[0-9._-]+/g, " ")
    .trim();
  if (!prefix) return "";
  return prefix
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
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
    let { data: session, error: sessionErr } = await supabase
      .from("interview_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session && !sessionErr) {
      const { data: sessionByRi } = await supabase
        .from("interview_sessions")
        .select("*")
        .eq("round_instance_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sessionByRi) {
        session = sessionByRi;
      }
    }

    if (sessionErr || !session) {
      return NextResponse.json(
        { error: sessionErr?.message || "Interview session not found or link has expired." },
        { status: 404 },
      );
    }

    // Recovery Guard: If session was prematurely marked 'incomplete' or 'completed' without any recorded answers
    // (e.g. accidental browser reload during device precheck), recover it back to 'pending'
    if (session.status === "incomplete" || session.status === "completed") {
      const { count: answerCount } = await supabase
        .from("interview_answers")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id);

      if (!answerCount || answerCount === 0) {
        await supabase
          .from("interview_sessions")
          .update({ status: "pending", started_at: null, completed_at: null })
          .eq("id", session.id);

        if (session.round_instance_id) {
          await supabase
            .from("round_instances")
            .update({ status: "pending" })
            .eq("id", session.round_instance_id);
        }
        session.status = "pending";
        session.started_at = null;
        session.completed_at = null;
      }
    }

    // 2. Fetch Round Instance
    const { data: roundInstance } = await supabase
      .from("round_instances")
      .select(
        "id, campaign_id, candidate_id, application_id, round_number, round_type, scheduled_at, deadline_at, account_id",
      )
      .eq("id", session.round_instance_id)
      .maybeSingle();

    // 3. Fetch Candidate (resolve candidate_id from session or roundInstance)
    const effectiveCandidateId = session.candidate_id || roundInstance?.candidate_id;
    let candidate: {
      id: string;
      name: string | null;
      email: string | null;
      phone?: string | null;
      resume_url?: string | null;
    } | null = null;

    if (effectiveCandidateId) {
      const { data: candRow } = await supabase
        .from("candidates")
        .select("id, name, email, phone, resume_url")
        .eq("id", effectiveCandidateId)
        .maybeSingle();
      if (candRow) candidate = candRow;
    }

    // Fallback: If candidate not found directly, check application
    const effectiveAppId = session.application_id || roundInstance?.application_id;
    let application: {
      candidate_name?: string | null;
      candidate_email?: string | null;
      candidate_phone?: string | null;
      resume_path?: string | null;
    } | null = null;
    if (!candidate?.name && effectiveAppId) {
      const { data: appRow } = await supabase
        .from("applications")
        .select("candidate_name, candidate_email, candidate_phone, resume_path")
        .eq("id", effectiveAppId)
        .maybeSingle();
      if (appRow) application = appRow;
    }

    // Secondary fallback: lookup application by effectiveCandidateId
    if (
      (!candidate?.name || candidate.name.toLowerCase() === "candidate") &&
      effectiveCandidateId &&
      !application?.candidate_name
    ) {
      const { data: appByCand } = await supabase
        .from("applications")
        .select("candidate_name, candidate_email, candidate_phone, resume_path")
        .eq("candidate_id", effectiveCandidateId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (appByCand?.candidate_name) application = appByCand;
    }

    const resolvedEmail = candidate?.email || application?.candidate_email || "";
    const rawName = (candidate?.name || "").trim() || (application?.candidate_name || "").trim();
    // Use real name, or construct friendly name from email if placeholder was used
    const resolvedCandidateName =
      rawName.toLowerCase() === "candidate" || !rawName
        ? resolvedEmail
          ? formatNameFromEmail(resolvedEmail)
          : ""
        : rawName;
    const resolvedCandidateEmail = resolvedEmail;

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

    // 7. Resolve Resume Text (from decision_ledger, applications, or candidate profile)
    let resumeText = "";
    if (effectiveCandidateId) {
      // 7a. Look up decision_ledger where resume screening text was recorded
      const { data: dlRows } = await supabase
        .from("decision_ledger")
        .select("raw_text, rationale, score_type")
        .eq("candidate_id", effectiveCandidateId)
        .order("decided_at", { ascending: false })
        .limit(10);

      if (dlRows && dlRows.length > 0) {
        // Priority 1: row with score_type === 'resume' and non-empty raw_text
        const resumeScoreRow = dlRows.find(
          (r) => r.score_type === "resume" && typeof r.raw_text === "string" && r.raw_text.trim(),
        );
        if (resumeScoreRow?.raw_text && resumeScoreRow.raw_text.trim().length > 30) {
          resumeText = resumeScoreRow.raw_text.trim();
        } else {
          // Priority 2: any row with raw_text
          const anyRawRow = dlRows.find(
            (r) => typeof r.raw_text === "string" && r.raw_text.trim().length > 30,
          );
          if (anyRawRow?.raw_text) {
            resumeText = anyRawRow.raw_text.trim();
          } else {
            // Priority 3: check rationale from resume screening
            const resumeRationaleRow = dlRows.find(
              (r) =>
                r.score_type === "resume" &&
                typeof r.rationale === "string" &&
                r.rationale.trim().length > 50,
            );
            if (resumeRationaleRow?.rationale) {
              resumeText = resumeRationaleRow.rationale.trim();
            }
          }
        }
      }

      // 7b. If still empty, check applications or candidates table for stored resume
      if (!resumeText) {
        const candidateResumePath = application?.resume_path || candidate?.resume_url;
        if (candidateResumePath && !candidateResumePath.startsWith("http")) {
          try {
            const { data: fileBlob, error: downloadErr } = await supabase.storage
              .from("resumes")
              .download(candidateResumePath);
            if (!downloadErr && fileBlob) {
              const buffer = Buffer.from(await fileBlob.arrayBuffer());
              try {
                // Parse actual text from PDF binary stream using pdfjs-dist
                const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
                const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
                let fullText = "";
                for (let i = 1; i <= doc.numPages; i++) {
                  const page = await doc.getPage(i);
                  const content = await page.getTextContent();
                  const strings = content.items.map(
                    (item: { str?: string } | Record<string, unknown>) =>
                      (item as { str?: string }).str || "",
                  );
                  fullText += `${strings.join(" ")}\n`;
                }
                if (fullText.trim().length > 50) {
                  resumeText = fullText.trim().slice(0, 20000);
                }
              } catch {
                const rawStr = buffer.toString("utf-8");
                const printable = rawStr
                  .replace(/[^\x20-\x7E\n\r\t]/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();
                if (printable.length > 100) {
                  resumeText = printable.slice(0, 20000);
                }
              }
            }
          } catch (e) {
            console.warn("[session/route] Fallback download from resumes bucket failed:", e);
          }
        }
      }
    }
    if (!resumeText && (resolvedCandidateName || resolvedCandidateEmail)) {
      resumeText = `Candidate: ${resolvedCandidateName || "Candidate"}, Email: ${resolvedCandidateEmail || ""}`;
    }

    // 8. Fetch and sanitize Questions
    const { data: rawQuestions } = await supabase
      .from("interview_questions")
      .select("*")
      .or(
        session.round_instance_id
          ? `round_instance_id.eq.${session.round_instance_id},session_id.eq.${sessionId}`
          : `session_id.eq.${sessionId}`,
      )
      .order("question_number", { ascending: true });

    // Clean any bracketed placeholders like [specific project] or [specific tool]
    const questions = (rawQuestions || []).map((q) => {
      if (q.question_type === "blueprint_meta" || !q.question_text) return q;
      const sanitized = sanitizeQuestionPlaceholders(
        q.question_text,
        resumeText,
        campaign?.jd_text,
      );
      if (sanitized !== q.question_text) {
        // Auto-heal the database row asynchronously so subsequent queries are clean
        void supabase
          .from("interview_questions")
          .update({ question_text: sanitized })
          .eq("id", q.id);
      }
      return {
        ...q,
        question_text: sanitized,
      };
    });

    // 9. Fetch Answers using valid columns (round_instance_id)
    const { data: answers } = session.round_instance_id
      ? await supabase
          .from("interview_answers")
          .select("*")
          .eq("round_instance_id", session.round_instance_id)
          .order("answered_at", { ascending: true })
      : { data: [] };

    // 10. Fetch Scorecard
    let scorecard = null;
    if (sessionId) {
      const { data: scRow } = await supabase
        .from("scorecards")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();
      scorecard = scRow;
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
        id: candidate?.id || session.candidate_id || roundInstance?.candidate_id,
        name: resolvedCandidateName || "",
        email: resolvedCandidateEmail,
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

async function syncExistingScorecardToLedger(
  sessionId: string,
  sessionRow: {
    id: string;
    account_id: string;
    candidate_id: string;
    round_instance_id: string;
    application_id?: string | null;
  },
) {
  const supabase = getAdminSupabase();

  // Check if real scorecard already exists
  const { data: existingCard } = await supabase
    .from("scorecards")
    .select("id, overall_score, rationale")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingCard && existingCard.overall_score != null) {
    if (sessionRow.round_instance_id) {
      await supabase
        .from("decision_ledger")
        .update({
          score: existingCard.overall_score,
          stage: "round_1",
          rationale:
            existingCard.rationale ||
            `AI interview evaluation completed with score ${existingCard.overall_score}/100.`,
          score_type: "ai_interview",
          decided_at: new Date().toISOString(),
        })
        .eq("round_instance_id", sessionRow.round_instance_id);
    }
    return existingCard;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    // Resolve session row to obtain correct foreign keys and lifecycle state
    const { data: sessionRow, error: sessionErr } = await supabase
      .from("interview_sessions")
      .select("id, account_id, candidate_id, round_instance_id, status, started_at")
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

        // Check if an answer record already exists for this question & session/round instance
        let updatedAnswer = null;
        let existingAnswersQuery = supabase
          .from("interview_answers")
          .select("id, answer_text, ai_live_note")
          .eq("question_id", questionId);

        if (roundInstanceId) {
          existingAnswersQuery = existingAnswersQuery.eq("round_instance_id", roundInstanceId);
        } else {
          existingAnswersQuery = existingAnswersQuery.eq("session_id", sessionId);
        }

        const { data: existingAnswers } = await existingAnswersQuery
          .order("answered_at", { ascending: false })
          .limit(1);

        if (existingAnswers && existingAnswers.length > 0) {
          const prevNote =
            typeof existingAnswers[0].ai_live_note === "object" &&
            existingAnswers[0].ai_live_note !== null
              ? (existingAnswers[0].ai_live_note as Record<string, unknown>)
              : {};
          const mergedNote = aiLiveNote
            ? { ...prevNote, ...aiLiveNote }
            : existingAnswers[0].ai_live_note;

          const { data: updated, error: updateErr } = await supabase
            .from("interview_answers")
            .update({
              answer_text: answerText || "",
              answered_at: nowIso,
              ...(mergedNote ? { ai_live_note: mergedNote } : {}),
            })
            .eq("id", existingAnswers[0].id)
            .select()
            .single();

          if (!updateErr) updatedAnswer = updated;
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
        const { questionText, questionType, orderIndex, questionId } = body;
        if (!questionText) {
          return NextResponse.json({ error: "questionText is required" }, { status: 400 });
        }

        const qNumber = typeof orderIndex === "number" ? orderIndex + 1 : 1;
        const insertPayload: Record<string, unknown> = {
          account_id: sessionRow.account_id,
          round_instance_id: sessionRow.round_instance_id,
          session_id: sessionId,
          question_text: questionText,
          question_type: questionType || "technical",
          question_number: qNumber,
          order_index: typeof orderIndex === "number" ? orderIndex : 0,
        };
        if (
          typeof questionId === "string" &&
          questionId.length === 36 &&
          !questionId.startsWith("q-turn")
        ) {
          insertPayload.id = questionId;
        }

        const { data, error } = await supabase
          .from("interview_questions")
          .insert(insertPayload)
          .select()
          .single();

        if (error) {
          console.warn("[api/interview/session POST insert_question] Error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, question: data });
      }

      case "complete": {
        const { endedEarly } = body;

        // Safety Guard 1: Do not complete a session that was never started
        if (sessionRow.status !== "in_progress" && !sessionRow.started_at) {
          console.warn(
            "[api/interview/session POST complete] Ignored complete on unstarted session:",
            sessionId,
          );
          return NextResponse.json({
            success: false,
            message: "Cannot complete an interview session that has not started yet.",
            session: sessionRow,
          });
        }

        // Safety Guard 2: If early exit is requested but 0 answers were recorded,
        // candidate closed/reloaded the window right at the start or during setup.
        // Do not fail/incomplete the interview; allow them to restart cleanly.
        if (endedEarly) {
          const { count: answerCount } = await supabase
            .from("interview_answers")
            .select("id", { count: "exact", head: true })
            .eq("session_id", sessionId);

          if (!answerCount || answerCount === 0) {
            console.warn(
              "[api/interview/session POST complete] Ignored endedEarly with 0 answers for session:",
              sessionId,
            );
            return NextResponse.json({
              success: false,
              message: "Session has no submitted answers; ignoring premature early completion.",
              session: sessionRow,
            });
          }
        }

        const sessionStatus = endedEarly ? "incomplete" : "completed";
        const roundStatus = endedEarly ? "incomplete" : "completed";

        const { data: updatedSession, error: updateErr } = await supabase
          .from("interview_sessions")
          .update({ status: sessionStatus })
          .eq("id", sessionId)
          .select("id, account_id, candidate_id, round_instance_id, status")
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

        // Trigger n8n scoring webhook (include proctoring events for penalty scoring)
        const n8nBase = getN8nBase();
        try {
          const { data: proctoringEvents } = await supabase
            .from("proctoring_events")
            .select("event_type, severity, details, timestamp")
            .eq("round_instance_id", sessionRow.round_instance_id);

          await fetch(`${n8nBase}/webhook/score-interview`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              account_id: sessionRow.account_id,
              candidate_id: sessionRow.candidate_id,
              round_instance_id: sessionRow.round_instance_id,
              recording_url: null,
              round_number: 1,
              number_of_rounds: 1,
              cutoff_score: null,
              ended_early: Boolean(endedEarly),
              proctoring_events: proctoringEvents || [],
            }),
          });
        } catch (err) {
          console.warn("[api/interview/session] score-interview trigger note:", err);
        }

        // Only sync if real evaluation scorecard already exists in DB; never generate synthetic/dummy scores
        await syncExistingScorecardToLedger(sessionId, sessionRow);

        return NextResponse.json({ success: true, session: updatedSession });
      }

      case "score": {
        const n8nBase = getN8nBase();
        let scored = false;
        let result = null;
        try {
          const { data: procEvts } = await supabase
            .from("proctoring_events")
            .select("event_type, severity, details, timestamp")
            .eq("round_instance_id", sessionRow.round_instance_id);

          const scoreRes = await fetch(`${n8nBase}/webhook/score-interview`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              account_id: sessionRow.account_id,
              candidate_id: sessionRow.candidate_id,
              round_instance_id: sessionRow.round_instance_id,
              recording_url: null,
              round_number: 1,
              number_of_rounds: 1,
              cutoff_score: null,
              proctoring_events: procEvts || [],
            }),
          });
          if (scoreRes.ok) {
            result = await scoreRes.json().catch(() => ({}));
            scored = true;
          }
        } catch (n8nErr) {
          console.warn("[api/interview/session POST score] Error:", n8nErr);
        }

        const existingCard = await syncExistingScorecardToLedger(sessionId, sessionRow);

        return NextResponse.json({
          success: scored || !!existingCard,
          result: result || existingCard || null,
          status: scored || existingCard ? "evaluated" : "evaluating",
        });
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
