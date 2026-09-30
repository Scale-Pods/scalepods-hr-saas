import {
  type CandidatesRow,
  type DecisionLedgerRow,
  type InterviewSessionRow,
  type OutreachLogRow,
  type RoundInstancesRow,
  type ScorecardRow,
  TIER_LIMITS,
} from "@scalepods/core";
import { BUCKETS } from "@/lib/storage";
import { supabaseBrowser } from "@/lib/supabase/client";

export type { ScorecardRow };
export interface LedgerView extends DecisionLedgerRow {
  session?: InterviewSessionRow;
  scorecard?: ScorecardRow;
  forRound?: RoundInstancesRow;
  recordingExpired?: boolean;
  recordingSignedUrl?: string | null;
}

export interface CandidateCampaignItem {
  id: string;
  name: string;
}

export interface InterviewTranscriptItem {
  id: string;
  question_number?: number;
  question_text: string;
  question_type?: string;
  interviewer_text?: string | null;
  answer_text: string;
  answered_at: string;
  ai_note?: Record<string, unknown> | null;
}

export interface InterviewRecordingItem {
  sessionId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  recordingSignedUrl: string | null;
}

export interface VoiceScreenTranscriptItem {
  id: string;
  score: number | null;
  rationale: string | null;
  transcript: string;
  decided_at: string;
}

export interface CandidateProfile {
  candidate: CandidatesRow;
  campaignName: string | null;
  selectedCampaignId?: string | null;
  candidateCampaigns: CandidateCampaignItem[];
  resumeUrl: string | null;
  timeline: LedgerView[];
  outreach: OutreachLogRow[];
  interviewRecordings: InterviewRecordingItem[];
  interviewTranscripts: InterviewTranscriptItem[];
  voiceScreenTranscripts: VoiceScreenTranscriptItem[];
  latestScorecard?: ScorecardRow | null;
}

function roundNumberFromStage(stage: string): number | null {
  const m = /^round_(\d+)$/.exec(stage);
  if (m) return Number(m[1]);
  if (stage === "round_undefined" || stage.includes("round") || stage.includes("interview"))
    return 1;
  return null;
}

export async function fetchCandidateProfile(
  id: string,
  tier: string,
  targetCampaignId?: string | null,
): Promise<CandidateProfile> {
  const supabase = supabaseBrowser();

  const { data: cand, error: candErr } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (candErr || !cand) throw new Error("Candidate not found");

  const [ledger, rounds, sessions, logs] = await Promise.all([
    supabase
      .from("decision_ledger")
      .select(
        "id,account_id,candidate_id,round_instance_id,stage,score,rationale,weight,created_at,raw_text",
      )
      .eq("candidate_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("round_instances").select("*").eq("candidate_id", id).order("round_number"),
    supabase
      .from("interview_sessions")
      .select(
        "id,round_instance_id,candidate_id,status,expires_at,started_at,completed_at,created_at,recording_url,account_id",
      )
      .eq("candidate_id", id),
    supabase
      .from("outreach_log")
      .select("*")
      .eq("candidate_id", id)
      .order("sent_at", { ascending: true }),
  ]);

  const allRoundRows = (rounds.data ?? []) as RoundInstancesRow[];
  const allSessionRows = (sessions.data ?? []) as unknown as InterviewSessionRow[];

  // 1. Resolve all campaigns this candidate is part of
  const rawCampaignIds = Array.from(
    new Set(allRoundRows.map((r) => r.campaign_id).filter(Boolean)),
  );
  let candidateCampaigns: CandidateCampaignItem[] = [];
  if (rawCampaignIds.length > 0) {
    const { data: camps } = await supabase
      .from("campaigns")
      .select("id,name")
      .in("id", rawCampaignIds);
    candidateCampaigns = ((camps ?? []) as { id: string; name: string }[]).map((c) => ({
      id: c.id,
      name: c.name,
    }));
  }

  // 2. Select active campaign (targetCampaignId if provided and valid, otherwise first available)
  let activeCampaignId: string | null = null;
  if (targetCampaignId && candidateCampaigns.some((c) => c.id === targetCampaignId)) {
    activeCampaignId = targetCampaignId;
  } else if (candidateCampaigns.length > 0) {
    activeCampaignId = candidateCampaigns[0].id;
  }

  const activeCampaign = candidateCampaigns.find((c) => c.id === activeCampaignId);
  const campaignName = activeCampaign?.name ?? (candidateCampaigns[0]?.name || null);

  // 3. Filter data strictly by active campaign if multiple campaigns exist
  const roundRows = activeCampaignId
    ? allRoundRows.filter((r) => r.campaign_id === activeCampaignId)
    : allRoundRows;
  const roundIds = roundRows.map((r) => r.id);

  const sessionRows =
    roundIds.length > 0
      ? allSessionRows.filter((s) => s.round_instance_id && roundIds.includes(s.round_instance_id))
      : allSessionRows;

  // 4. Fetch scorecards for active rounds and sessions
  const scorecardByRoundId = new Map<string, ScorecardRow>();
  const scorecardBySessionId = new Map<string, ScorecardRow>();
  if (roundIds.length > 0 || sessionRows.length > 0) {
    const filters = [
      roundIds.length > 0 ? `round_instance_id.in.(${roundIds.join(",")})` : null,
      sessionRows.length > 0
        ? `session_id.in.(${sessionRows.map((s) => s.id).join(",")})`
        : null,
    ].filter(Boolean);

    if (filters.length > 0) {
      const { data: cards } = await supabase
        .from("scorecards")
        .select("*")
        .or(filters.join(","));

      for (const raw of (cards ?? []) as any[]) {
        const criteria = raw.criteria || {};
        const sc: ScorecardRow = {
          id: raw.id,
          session_id: raw.round_instance_id || raw.session_id,
          technical_score: raw.technical_score ?? criteria.technical_score ?? null,
          communication_score: raw.communication_score ?? criteria.communication_score ?? null,
          problem_solving_score:
            raw.problem_solving_score ?? criteria.problem_solving_score ?? null,
          cultural_fit_score: raw.cultural_fit_score ?? criteria.cultural_fit_score ?? null,
          overall_score: raw.overall_score ?? criteria.overall_score ?? null,
          authenticity_score: raw.authenticity_score ?? criteria.authenticity_score ?? null,
          recommendation: raw.recommendation ?? criteria.recommendation ?? null,
          red_flags: raw.red_flags ?? criteria.red_flags ?? null,
          strengths: raw.strengths ?? criteria.strengths ?? null,
          weaknesses: raw.weaknesses ?? criteria.weaknesses ?? null,
          evaluated_at: raw.evaluated_at ?? criteria.evaluated_at ?? raw.created_at,
          recording_path: raw.recording_path ?? null,
          rationale: raw.rationale ?? criteria.detailed_rationale ?? null,
        };
        if (raw.round_instance_id) scorecardByRoundId.set(raw.round_instance_id, sc);
        if (raw.session_id) scorecardBySessionId.set(raw.session_id, sc);
      }
    }
  }

  // 5. Build timeline (decision_ledger) scoped to this campaign's rounds
  const allLedgerRows = (ledger.data ?? []) as DecisionLedgerRow[];
  const ledgerRows =
    roundIds.length > 0
      ? allLedgerRows.filter(
          (row) =>
            (row.round_instance_id && roundIds.includes(row.round_instance_id)) ||
            (!row.round_instance_id &&
              row.account_id === cand.account_id &&
              (row.stage === "resume" ||
                row.stage === "voice_screen" ||
                row.stage === "round_1")),
        )
      : allLedgerRows;

  const view: LedgerView[] = [];
  const limitDays = TIER_LIMITS[tier as keyof typeof TIER_LIMITS]?.retentionDays ?? 90;
  const now = Date.now();

  for (const row of ledgerRows) {
    const ageDays = (now - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > limitDays) continue;

    const roundNum = roundNumberFromStage(row.stage);
    let forRound: RoundInstancesRow | undefined;
    if (roundNum != null) {
      forRound = roundRows.find((r) => r.round_number === roundNum);
    }
    if (!forRound && row.round_instance_id) {
      forRound = roundRows.find((r) => r.id === row.round_instance_id);
    }

    const session =
      (forRound ? sessionRows.find((s) => s.round_instance_id === forRound.id) : undefined) ??
      (row.round_instance_id
        ? sessionRows.find((s) => s.round_instance_id === row.round_instance_id)
        : undefined) ??
      (roundNum === 1 ? sessionRows[0] : undefined);

    const scorecard =
      (forRound ? scorecardByRoundId.get(forRound.id) : undefined) ??
      (session ? scorecardBySessionId.get(session.id) : undefined) ??
      (row.round_instance_id ? scorecardByRoundId.get(row.round_instance_id) : undefined) ??
      (roundNum === 1 ? Array.from(scorecardByRoundId.values())[0] : undefined) ??
      (roundNum === 1 ? Array.from(scorecardBySessionId.values())[0] : undefined);

    let recordingSignedUrl: string | null = null;
    let recordingExpired = false;
    const recordingPath = session?.recording_url || scorecard?.recording_path;
    if (recordingPath) {
      try {
        const { data: signed } = await supabase.storage
          .from("recordings")
          .createSignedUrl(recordingPath, 3600);
        recordingSignedUrl = signed?.signedUrl ?? null;
      } catch {
        recordingExpired = true;
      }
    }

    view.push({
      ...row,
      decided_at: row.created_at,
      source: "workflow",
      session,
      scorecard,
      forRound,
      recordingExpired,
      recordingSignedUrl,
    });
  }

  // Synthesize Round 1 entry if an interview was completed/scored but missing from ledger
  const firstSession = sessionRows[0];
  const firstRound = roundRows[0];
  const sc =
    (firstRound ? scorecardByRoundId.get(firstRound.id) : undefined) ??
    (firstSession ? scorecardBySessionId.get(firstSession.id) : undefined) ??
    Array.from(scorecardByRoundId.values())[0];

  if ((firstSession || sc) && !view.some((v) => roundNumberFromStage(v.stage) === 1)) {
    view.push({
      id: `synth-${firstSession?.id || firstRound?.id || "r1"}`,
      account_id: firstRound?.account_id ?? cand.account_id,
      candidate_id: id,
      round_instance_id: firstRound?.id ?? null,
      stage: "round_1",
      score: sc?.overall_score ?? 0,
      rationale: sc?.rationale ?? "AI Interview assessment completed.",
      weight: 1,
      created_at: sc?.evaluated_at ?? firstSession?.completed_at ?? new Date().toISOString(),
      decided_at: sc?.evaluated_at ?? firstSession?.completed_at ?? new Date().toISOString(),
      raw_text: null,
      source: "workflow",
      session: firstSession,
      scorecard: sc,
      forRound: firstRound,
      recordingExpired: false,
      recordingSignedUrl: null,
    });
  }

  let resumeUrl: string | null = null;
  if ((cand as any).resume_url) {
    const { data } = await supabase.storage
      .from(BUCKETS.resumes)
      .createSignedUrl((cand as any).resume_url, 3600);
    resumeUrl = data?.signedUrl ?? (cand as any).resume_url;
  }

  // 6. Fetch interview recordings for this campaign
  const interviewRecordings: InterviewRecordingItem[] = await Promise.all(
    sessionRows.map(async (s) => {
      let resolvedPath =
        s.recording_url ||
        (s.round_instance_id ? scorecardByRoundId.get(s.round_instance_id)?.recording_path : null);

      if (!resolvedPath && s.account_id && s.id) {
        try {
          const { data: files } = await supabase.storage
            .from("recordings")
            .list(`${s.account_id}/${s.id}`, { limit: 1 });
          if (files && files.length > 0 && files[0]?.name) {
            resolvedPath = `${s.account_id}/${s.id}/${files[0].name}`;
            void supabase
              .from("interview_sessions")
              .update({ recording_url: resolvedPath })
              .eq("id", s.id);
          }
        } catch {}
      }

      let recordingSignedUrl: string | null = null;
      if (resolvedPath) {
        try {
          const { data: signed } = await supabase.storage
            .from("recordings")
            .createSignedUrl(resolvedPath, 86400);
          recordingSignedUrl = signed?.signedUrl ?? null;
        } catch (storageErr) {
          console.warn("Could not generate signed URL for recording:", storageErr);
        }
      }
      return {
        sessionId: s.id,
        status: s.status,
        startedAt: s.started_at ?? null,
        completedAt: s.completed_at ?? null,
        recordingSignedUrl,
      };
    }),
  );

  // 7. Fetch accurate turn-by-turn Q&A transcripts
  let interviewTranscripts: InterviewTranscriptItem[] = [];
  const targetRoundIds = roundRows.map((r) => r.id);

  if (targetRoundIds.length > 0) {
    try {
      // Query real interview questions
      const { data: questionsData } = await (supabase as any)
        .from("interview_questions")
        .select("id,round_instance_id,question_number,question_text,question_type,created_at")
        .in("round_instance_id", targetRoundIds)
        .order("question_number", { ascending: true });

      // Query candidate answers
      const { data: answersData } = await (supabase as any)
        .from("interview_answers")
        .select("id,round_instance_id,question_id,answer_text,answered_at,ai_live_note")
        .in("round_instance_id", targetRoundIds)
        .order("answered_at", { ascending: true });

      const answersList = (answersData ?? []) as any[];
      const questionsList = (
        (questionsData ?? []) as {
          id: string;
          round_instance_id: string;
          question_number: number;
          question_text: string;
          question_type: string;
          created_at: string;
        }[]
      ).filter((q) => q && q.question_type !== "blueprint_meta");

      // Group answers by question_id
      const answersByQuestionId = new Map<string, any[]>();
      for (const ans of answersList) {
        if (!ans.question_id) continue;
        const existing = answersByQuestionId.get(ans.question_id) || [];
        existing.push(ans);
        answersByQuestionId.set(ans.question_id, existing);
      }

      const mappedTranscripts: InterviewTranscriptItem[] = [];

      // A. Map known questions from interview_questions
      if (questionsList.length > 0) {
        questionsList.forEach((q) => {
          const ansList = answersByQuestionId.get(q.id) || [];
          // Pick the answer with actual content if available, else latest
          const bestAnswer =
            ansList.find((a) => a.answer_text && a.answer_text.trim().length > 0) ||
            ansList[ansList.length - 1] ||
            null;

          const liveNote = bestAnswer?.ai_live_note || {};
          mappedTranscripts.push({
            id: bestAnswer?.id || `q-${q.id}`,
            question_number: q.question_number,
            question_text: q.question_text,
            question_type: q.question_type || "Technical",
            interviewer_text: liveNote.interviewer_text || null,
            answer_text: bestAnswer?.answer_text || "",
            answered_at: bestAnswer?.answered_at || q.created_at,
            ai_note: liveNote,
          });
        });
      } else if (answersList.length > 0) {
        // Fallback if interview_questions was empty: deduplicate by question text
        const seenQuestionTexts = new Set<string>();
        answersList.forEach((ans) => {
          const liveNote = ans.ai_live_note || {};
          const qText = liveNote.question_text || "Interview Question";
          if (seenQuestionTexts.has(qText)) return;
          seenQuestionTexts.add(qText);

          mappedTranscripts.push({
            id: ans.id,
            question_text: qText,
            question_type: liveNote.question_type || "General",
            interviewer_text: liveNote.interviewer_text || null,
            answer_text: ans.answer_text || "",
            answered_at: ans.answered_at,
            ai_note: liveNote,
          });
        });
      }

      interviewTranscripts = mappedTranscripts;
    } catch (ansErr) {
      console.warn("Could not load interview answers:", ansErr);
    }
  }

  // 8. Extract voice screening call transcripts from decision_ledger
  const voiceScreenTranscripts: VoiceScreenTranscriptItem[] = (
    (ledger.data ?? []) as Record<string, unknown>[]
  )
    .filter(
      (row) =>
        row.stage === "voice_screen" ||
        (typeof row.stage === "string" && row.stage.toLowerCase().includes("voice")) ||
        (typeof row.raw_text === "string" && row.raw_text.length > 10),
    )
    .map((row) => ({
      id: String(row.id ?? ""),
      score: row.score != null ? Number(row.score) : null,
      rationale: (row.rationale as string) ?? null,
      transcript: (row.raw_text as string) ?? "",
      decided_at: String(row.created_at ?? ""),
    }));

  const latestScorecard =
    Array.from(scorecardByRoundId.values())[0] ??
    Array.from(scorecardBySessionId.values())[0] ??
    null;

  return {
    candidate: cand as CandidatesRow,
    campaignName,
    selectedCampaignId: activeCampaignId,
    candidateCampaigns,
    resumeUrl,
    timeline: view,
    outreach: (logs.data ?? []) as OutreachLogRow[],
    interviewRecordings,
    interviewTranscripts,
    voiceScreenTranscripts,
    latestScorecard,
  };
}
