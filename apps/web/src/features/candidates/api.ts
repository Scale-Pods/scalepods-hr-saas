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

export interface LedgerView extends DecisionLedgerRow {
  session?: InterviewSessionRow;
  scorecard?: ScorecardRow;
  forRound?: RoundInstancesRow;
  recordingExpired?: boolean;
  recordingSignedUrl?: string | null;
}

export interface InterviewTranscriptItem {
  id: string;
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
  resumeUrl: string | null;
  timeline: LedgerView[];
  outreach: OutreachLogRow[];
  interviewRecordings: InterviewRecordingItem[];
  interviewTranscripts: InterviewTranscriptItem[];
  voiceScreenTranscripts: VoiceScreenTranscriptItem[];
}

function roundNumberFromStage(stage: string): number | null {
  const m = /^round_(\d+)$/.exec(stage);
  if (m) return Number(m[1]);
  if (stage === "round_undefined" || stage.includes("round") || stage.includes("interview"))
    return 1;
  return null;
}

export async function fetchCandidateProfile(id: string, tier: string): Promise<CandidateProfile> {
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

  const roundRows = (rounds.data ?? []) as RoundInstancesRow[];
  const sessionRows = (sessions.data ?? []) as unknown as InterviewSessionRow[];
  const roundIds = roundRows.map((r) => r.id);

  const campaignIds = Array.from(new Set(roundRows.map((r) => r.campaign_id)));
  let campaignName: string | null = null;
  if (campaignIds.length > 0) {
    const { data: camps } = await supabase
      .from("campaigns")
      .select("id,name")
      .in("id", campaignIds)
      .limit(5);
    campaignName = ((camps ?? []) as { name: string }[]).map((c) => c.name).join(", ") || null;
  }

  const scorecardByRoundId = new Map<string, ScorecardRow>();
  if (roundIds.length > 0) {
    const { data: cards } = await supabase
      .from("scorecards")
      .select("*")
      .in("round_instance_id", roundIds);

    for (const raw of (cards ?? []) as any[]) {
      const criteria = raw.criteria || {};
      const sc: ScorecardRow = {
        id: raw.id,
        session_id: raw.round_instance_id,
        technical_score: raw.technical_score ?? criteria.technical_score ?? null,
        communication_score: raw.communication_score ?? criteria.communication_score ?? null,
        problem_solving_score: raw.problem_solving_score ?? criteria.problem_solving_score ?? null,
        cultural_fit_score: raw.cultural_fit_score ?? criteria.cultural_fit_score ?? null,
        overall_score: raw.overall_score ?? criteria.overall_score ?? null,
        authenticity_score: raw.authenticity_score ?? criteria.authenticity_score ?? null,
        recommendation: raw.recommendation ?? criteria.recommendation ?? null,
        red_flags: raw.red_flags ?? criteria.red_flags ?? null,
        strengths: raw.strengths ?? criteria.strengths ?? null,
        weaknesses: raw.weaknesses ?? criteria.weaknesses ?? null,
        evaluated_at: raw.evaluated_at ?? criteria.evaluated_at ?? raw.created_at,
      };
      scorecardByRoundId.set(raw.round_instance_id, sc);
    }
  }

  const retentionDays = TIER_LIMITS[tier as keyof typeof TIER_LIMITS]?.retentionDays ?? 7;
  const now = Date.now();

  const view: LedgerView[] = await Promise.all(
    ((ledger.data ?? []) as any[]).map(async (row) => {
      const roundNumber = roundNumberFromStage(row.stage);
      let forRound = roundNumber
        ? roundRows.find((r) => r.round_number === roundNumber)
        : undefined;

      if (!forRound && row.round_instance_id) {
        forRound = roundRows.find((r) => r.id === row.round_instance_id);
      }
      if (!forRound && (row.stage === "round_undefined" || row.stage.includes("interview"))) {
        forRound = roundRows[0];
      }

      const session =
        (forRound ? sessionRows.find((s) => s.round_instance_id === forRound.id) : undefined) ??
        sessionRows[0];

      const scorecard = forRound ? scorecardByRoundId.get(forRound.id) : undefined;
      let recordingExpired = false;
      if (scorecard?.evaluated_at) {
        recordingExpired =
          now - new Date(scorecard.evaluated_at).getTime() > retentionDays * 86_400_000;
      }

      let recordingSignedUrl: string | null = null;
      const recPath = session?.recording_url || (scorecard as any)?.recording_path;
      if (recPath && !recordingExpired) {
        try {
          const { data: signed } = await supabase.storage
            .from("recordings")
            .createSignedUrl(recPath, 3600);
          recordingSignedUrl = signed?.signedUrl ?? null;
        } catch {}
      }

      return {
        ...row,
        decided_at: row.created_at,
        source: row.source ?? "workflow",
        session,
        scorecard,
        forRound,
        recordingExpired,
        recordingSignedUrl,
      };
    }),
  );

  let resumeUrl: string | null = null;
  if ((cand as any).resume_url) {
    const { data } = await supabase.storage
      .from(BUCKETS.resumes)
      .createSignedUrl((cand as any).resume_url, 3600);
    resumeUrl = data?.signedUrl ?? (cand as any).resume_url;
  }

  // 1. Fetch all interview recordings for this candidate
  const interviewRecordings: InterviewRecordingItem[] = await Promise.all(
    sessionRows.map(async (s) => {
      let resolvedPath = s.recording_url;
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
            .createSignedUrl(resolvedPath, 3600);
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

  // 2. Fetch full AI interview Q&A dialogue transcript
  let interviewTranscripts: InterviewTranscriptItem[] = [];
  const targetSessionIds = sessionRows.map((s) => s.id);
  const targetRoundIds = roundRows.map((r) => r.id);

  if (targetRoundIds.length > 0 || targetSessionIds.length > 0) {
    try {
      let query = (supabase as any)
        .from("interview_answers")
        .select("id,session_id,round_instance_id,question_id,answer_text,answered_at,ai_live_note");

      if (targetRoundIds.length > 0) {
        query = query.in("round_instance_id", targetRoundIds);
      } else {
        query = query.in("session_id", targetSessionIds);
      }

      const { data: answersData } = await query.order("answered_at", { ascending: true });

      if (answersData && answersData.length > 0) {
        interviewTranscripts = answersData.map((ans: any) => {
          const liveNote = ans.ai_live_note || {};
          return {
            id: ans.id,
            question_text:
              liveNote.question_text || liveNote.interviewer_text || "Interview Question",
            question_type: liveNote.question_type || "General",
            interviewer_text: liveNote.interviewer_text || null,
            answer_text:
              ans.answer_text ||
              (liveNote.turn_type === "question" ? "Candidate listened to question" : ""),
            answered_at: ans.answered_at,
            ai_note: liveNote,
          };
        });
      }
    } catch (ansErr) {
      console.warn("Could not load interview answers:", ansErr);
    }
  }

  // 3. Extract voice screening call transcripts from decision_ledger
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

  return {
    candidate: cand as CandidatesRow,
    campaignName,
    resumeUrl,
    timeline: view,
    outreach: (logs.data ?? []) as OutreachLogRow[],
    interviewRecordings,
    interviewTranscripts,
    voiceScreenTranscripts,
  };
}
