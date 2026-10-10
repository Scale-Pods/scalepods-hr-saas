import {
  type ApplicationsRow,
  type AssignmentsRow,
  type CampaignsRow,
  type CandidatesRow,
  type DecisionLedgerRow,
  type InterviewerFeedbackRow,
  type InterviewSessionRow,
  type OffersRow,
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
  application?: ApplicationsRow | null;
  campaign?: CampaignsRow | null;
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
  assignments?: AssignmentsRow[];
  interviewerFeedback?: InterviewerFeedbackRow[];
  offers?: OffersRow[];
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
  tier: string = "free",
  targetCampaignId?: string | null,
  accountId?: string | null,
): Promise<CandidateProfile> {
  const supabase = supabaseBrowser();

  // 1. Fetch candidate and enforce account isolation
  let candQuery = supabase.from("candidates").select("*").eq("id", id);
  if (accountId) {
    candQuery = candQuery.eq("account_id", accountId);
  }
  const { data: cand, error: candErr } = await candQuery.maybeSingle();
  if (candErr || !cand) throw new Error("Candidate not found");
  if (accountId && cand.account_id !== accountId) {
    throw new Error("Unauthorized access to candidate");
  }

  // 2. Fetch all candidate records strictly scoped to this account
  const [ledger, rounds, sessions, logs, applicationsRes] = await Promise.all([
    supabase
      .from("decision_ledger")
      .select(
        "id,account_id,candidate_id,round_instance_id,stage,score,rationale,weight,created_at,raw_text",
      )
      .eq("candidate_id", id)
      .eq("account_id", cand.account_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("round_instances")
      .select("*")
      .eq("candidate_id", id)
      .eq("account_id", cand.account_id)
      .order("round_number"),
    supabase
      .from("interview_sessions")
      .select(
        "id,round_instance_id,candidate_id,status,expires_at,started_at,completed_at,created_at,recording_url,account_id",
      )
      .eq("candidate_id", id)
      .eq("account_id", cand.account_id),
    supabase
      .from("outreach_log")
      .select("*")
      .eq("candidate_id", id)
      .eq("account_id", cand.account_id)
      .order("sent_at", { ascending: true }),
    supabase
      .from("applications")
      .select("*")
      .eq("candidate_id", id)
      .eq("account_id", cand.account_id),
  ]);

  const allRoundRows = (rounds.data ?? []) as RoundInstancesRow[];
  const allSessionRows = (sessions.data ?? []) as unknown as InterviewSessionRow[];
  const allLedgerRows = (ledger.data ?? []) as DecisionLedgerRow[];
  const allOutreachLogs = (logs.data ?? []) as OutreachLogRow[];
  const allApplications = (applicationsRes.data ?? []) as ApplicationsRow[];

  // 3. Resolve all campaigns this candidate belongs to within this account
  const campaignIdSet = new Set<string>(
    allRoundRows.map((r) => r.campaign_id).filter(Boolean) as string[],
  );

  if (targetCampaignId) {
    campaignIdSet.add(targetCampaignId);
  }

  // Check storage for any other campaigns under this account where candidate's resume was uploaded
  if (cand.account_id && cand.email) {
    try {
      const { data: campFolders } = await supabase.storage
        .from(BUCKETS.resumes)
        .list(cand.account_id, { limit: 100 });
      for (const folder of campFolders ?? []) {
        if (
          folder.name &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folder.name)
        ) {
          campaignIdSet.add(folder.name);
        }
      }
    } catch {}
  }

  const rawCampaignIds = Array.from(campaignIdSet);
  let candidateCampaigns: CandidateCampaignItem[] = [];
  if (rawCampaignIds.length > 0) {
    const { data: camps } = await supabase
      .from("campaigns")
      .select("id,name")
      .eq("account_id", cand.account_id)
      .in("id", rawCampaignIds);
    candidateCampaigns = ((camps ?? []) as { id: string; name: string }[]).map((c) => ({
      id: c.id,
      name: c.name,
    }));
  }

  // 4. Select active campaign
  let activeCampaignId: string | null = null;
  if (targetCampaignId && candidateCampaigns.some((c) => c.id === targetCampaignId)) {
    activeCampaignId = targetCampaignId;
  } else if (candidateCampaigns.length > 0) {
    activeCampaignId = candidateCampaigns[0].id;
  }

  const activeCampaign = candidateCampaigns.find((c) => c.id === activeCampaignId);
  const campaignName = activeCampaign?.name ?? (candidateCampaigns[0]?.name || null);

  // 5. Filter rounds and sessions strictly to active campaign (NO cross-campaign leaking!)
  const roundRows = activeCampaignId
    ? allRoundRows.filter((r) => r.campaign_id === activeCampaignId)
    : [];
  const roundIds = roundRows.map((r) => r.id);

  const sessionRows =
    roundIds.length > 0
      ? allSessionRows.filter((s) => s.round_instance_id && roundIds.includes(s.round_instance_id))
      : [];

  // 6. Fetch scorecards strictly for active campaign rounds and sessions
  const scorecardByRoundId = new Map<string, ScorecardRow>();
  const scorecardBySessionId = new Map<string, ScorecardRow>();
  if (roundIds.length > 0 || sessionRows.length > 0) {
    const filters = [
      roundIds.length > 0 ? `round_instance_id.in.(${roundIds.join(",")})` : null,
      sessionRows.length > 0 ? `session_id.in.(${sessionRows.map((s) => s.id).join(",")})` : null,
    ].filter(Boolean);

    if (filters.length > 0) {
      const { data: cards } = await supabase.from("scorecards").select("*").or(filters.join(","));

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

  // 7. Filter timeline (decision_ledger) strictly to this campaign
  const ledgerRows = allLedgerRows.filter((row) => {
    // 7a. Explicit round instance linkage
    if (row.round_instance_id) {
      return roundIds.includes(row.round_instance_id);
    }

    // 7b. Resume screening stage (round_instance_id is null)
    const isResume =
      row.stage === "resume" ||
      row.stage === "resume screening" ||
      row.stage.toLowerCase().includes("resume") ||
      row.stage.toLowerCase().includes("screen");

    if (isResume) {
      // If candidate has rounds across multiple campaigns, match resume screening to this campaign's round 1 by timestamp
      if (candidateCampaigns.length > 1 && roundRows.length > 0) {
        const r1 = roundRows.find((r) => r.round_number === 1) || roundRows[0];
        const r1Time = new Date(r1.created_at).getTime();
        const rowTime = new Date(row.created_at).getTime();

        let closestCampId = activeCampaignId;
        let minDiff = Math.abs(rowTime - r1Time);

        for (const otherCamp of candidateCampaigns) {
          if (otherCamp.id === activeCampaignId) continue;
          const otherR1 =
            allRoundRows.find((r) => r.campaign_id === otherCamp.id && r.round_number === 1) ||
            allRoundRows.find((r) => r.campaign_id === otherCamp.id);
          if (otherR1) {
            const otherTime = new Date(otherR1.created_at).getTime();
            const diff = Math.abs(rowTime - otherTime);
            if (diff < minDiff) {
              minDiff = diff;
              closestCampId = otherCamp.id;
            }
          }
        }
        return closestCampId === activeCampaignId;
      }
      return true;
    }

    // 7c. Round stage without round_instance_id (legacy rows)
    if (roundRows.length > 0) {
      const rowTime = new Date(row.created_at).getTime();
      const matchingSession = sessionRows.find((s) => {
        const sTime = new Date(s.completed_at || s.started_at || s.created_at).getTime();
        return Math.abs(rowTime - sTime) < 15 * 60 * 1000;
      });
      if (matchingSession) return true;

      // Ensure it doesn't belong to another campaign's session
      const otherCampaignSessions = allSessionRows.filter(
        (s) => s.round_instance_id && !roundIds.includes(s.round_instance_id),
      );
      const matchesOther = otherCampaignSessions.some((s) => {
        const sTime = new Date(s.completed_at || s.started_at || s.created_at).getTime();
        return Math.abs(rowTime - sTime) < 15 * 60 * 1000;
      });
      if (matchesOther) return false;
    }

    return false;
  });

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

  // Synthesize Round 1 entry if an interview in THIS campaign was completed/scored but missing from ledger
  const firstSession = sessionRows[0];
  const firstRound = roundRows[0];
  const sc =
    (firstRound ? scorecardByRoundId.get(firstRound.id) : undefined) ??
    (firstSession ? scorecardBySessionId.get(firstSession.id) : undefined);

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

  // 8. Resolve campaign-specific resume URL
  let resumeUrl: string | null = null;
  if (cand.account_id && activeCampaignId && cand.email) {
    try {
      const { data: files } = await supabase.storage
        .from(BUCKETS.resumes)
        .list(`${cand.account_id}/${activeCampaignId}/${cand.email}`, { limit: 1 });
      if (files && files.length > 0 && files[0]?.name) {
        const path = `${cand.account_id}/${activeCampaignId}/${cand.email}/${files[0].name}`;
        const { data: signed } = await supabase.storage
          .from(BUCKETS.resumes)
          .createSignedUrl(path, 3600);
        resumeUrl = signed?.signedUrl ?? null;
      }
    } catch {}
  }
  if (!resumeUrl && (cand as any).resume_url) {
    try {
      const { data } = await supabase.storage
        .from(BUCKETS.resumes)
        .createSignedUrl((cand as any).resume_url, 3600);
      resumeUrl = data?.signedUrl ?? (cand as any).resume_url;
    } catch {
      resumeUrl = (cand as any).resume_url;
    }
  }

  // 9. Fetch interview recordings strictly for this campaign's sessions
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

  // 10. Fetch turn-by-turn Q&A transcripts strictly for this campaign's rounds & sessions
  let interviewTranscripts: InterviewTranscriptItem[] = [];
  const targetRoundIds = roundRows.map((r) => r.id);
  const targetSessionIds = sessionRows.map((s) => s.id);

  if (targetRoundIds.length > 0 || targetSessionIds.length > 0) {
    try {
      const qFilters = [
        targetRoundIds.length > 0 ? `round_instance_id.in.(${targetRoundIds.join(",")})` : null,
        targetSessionIds.length > 0 ? `session_id.in.(${targetSessionIds.join(",")})` : null,
      ].filter(Boolean);

      const { data: questionsData } = await (supabase as any)
        .from("interview_questions")
        .select(
          "id,round_instance_id,session_id,question_number,question_text,question_type,created_at",
        )
        .or(qFilters.join(","))
        .order("question_number", { ascending: true });

      const ansFilters = [
        targetRoundIds.length > 0 ? `round_instance_id.in.(${targetRoundIds.join(",")})` : null,
        targetSessionIds.length > 0 ? `session_id.in.(${targetSessionIds.join(",")})` : null,
      ].filter(Boolean);

      const { data: answersData } = await (supabase as any)
        .from("interview_answers")
        .select("id,round_instance_id,session_id,question_id,answer_text,answered_at,ai_live_note")
        .or(ansFilters.join(","))
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

  // 11. Extract voice screening call transcripts strictly for this campaign
  const voiceScreenTranscripts: VoiceScreenTranscriptItem[] = allLedgerRows
    .filter((row) => {
      const isVoice =
        row.stage === "voice_screen" ||
        (typeof row.stage === "string" && row.stage.toLowerCase().includes("voice"));
      if (!isVoice) return false;
      if (row.account_id !== cand.account_id) return false;
      if (row.round_instance_id) {
        return roundIds.includes(row.round_instance_id);
      }
      if (roundRows.length > 0) {
        const rowTime = new Date(row.created_at).getTime();
        const r1 = roundRows[0];
        const r1Time = new Date(r1.created_at).getTime();
        return Math.abs(rowTime - r1Time) < 24 * 3600 * 1000;
      }
      return false;
    })
    .map((row) => ({
      id: String(row.id ?? ""),
      score: row.score != null ? Number(row.score) : null,
      rationale: (row.rationale as string) ?? null,
      transcript: (row.raw_text as string) ?? "",
      decided_at: String(row.created_at ?? ""),
    }));

  // 12. Outreach log strictly for this campaign
  const outreach = allOutreachLogs.filter((log) => {
    if (log.account_id !== cand.account_id) return false;
    if (log.round_instance_id) {
      return roundIds.includes(log.round_instance_id);
    }
    if (roundRows.length > 0) {
      const logTime = new Date(log.sent_at).getTime();
      return roundRows.some((r) => {
        const rTime = new Date(r.created_at).getTime();
        return Math.abs(logTime - rTime) < 48 * 3600 * 1000;
      });
    }
    return false;
  });

  // 13. Latest scorecard for active campaign
  const latestScorecard =
    (roundRows[roundRows.length - 1]
      ? scorecardByRoundId.get(roundRows[roundRows.length - 1].id)
      : undefined) ??
    (sessionRows[sessionRows.length - 1]
      ? scorecardBySessionId.get(sessionRows[sessionRows.length - 1].id)
      : undefined) ??
    Array.from(scorecardByRoundId.values())[0] ??
    Array.from(scorecardBySessionId.values())[0] ??
    null;

  const matchedApplication =
    allApplications.find((a) => a.campaign_id === activeCampaignId) || allApplications[0] || null;

  let activeCampaignRow: CampaignsRow | null = null;
  if (activeCampaignId) {
    const { data: cRow } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", activeCampaignId)
      .maybeSingle();
    activeCampaignRow = (cRow as CampaignsRow) || null;
  }

  let assignments: AssignmentsRow[] = [];
  let interviewerFeedback: InterviewerFeedbackRow[] = [];
  let offers: OffersRow[] = [];

  if (matchedApplication?.id) {
    const [assignRes, feedbackRes, offersRes] = await Promise.all([
      supabase.from("assignments").select("*").eq("application_id", matchedApplication.id),
      supabase.from("interviewer_feedback").select("*").eq("application_id", matchedApplication.id),
      supabase.from("offers").select("*").eq("application_id", matchedApplication.id),
    ]);
    assignments = (assignRes.data ?? []) as AssignmentsRow[];
    interviewerFeedback = (feedbackRes.data ?? []) as InterviewerFeedbackRow[];
    offers = (offersRes.data ?? []) as OffersRow[];
  }

  return {
    candidate: cand as CandidatesRow,
    application: matchedApplication,
    campaign: activeCampaignRow,
    campaignName,
    selectedCampaignId: activeCampaignId,
    candidateCampaigns,
    resumeUrl: matchedApplication?.resume_path || resumeUrl,
    timeline: view,
    outreach,
    interviewRecordings,
    interviewTranscripts,
    voiceScreenTranscripts,
    latestScorecard,
    assignments,
    interviewerFeedback,
    offers,
  };
}

export async function decideApplication(params: {
  applicationId: string;
  action: "advance" | "reject" | "hold" | "resume";
  rejectionReason?: string | null;
}): Promise<any> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to change this application.");

  const response = await fetch("/api/applications/command", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      operation: "decision",
      application_id: params.applicationId,
      action: params.action,
      rejection_reason: params.rejectionReason ?? null,
      confirm_rejection: params.action === "reject",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not update the application.");
  return result;
}

export async function updateApplicationContact(params: {
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string | null;
  whatsappOptIn?: boolean;
}): Promise<void> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to update candidate contact details.");

  const response = await fetch("/api/applications/command", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      operation: "update_contact",
      application_id: params.applicationId,
      candidate_name: params.candidateName,
      candidate_email: params.candidateEmail,
      candidate_phone: params.candidatePhone ?? null,
      whatsapp_opt_in: params.whatsappOptIn ?? false,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not update candidate contact details.");
}
