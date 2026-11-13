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

export interface CriterionScoreItem {
  name: string;
  score: number;
  weight?: number;
  description?: string;
}

export function parseCriteriaScores(raw: unknown): CriterionScoreItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as CriterionScoreItem[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, any>).map(([name, val]) => ({
      name,
      score: typeof val === "number" ? val : Number(val?.score ?? 0),
      weight: typeof val === "object" ? val?.weight : undefined,
    }));
  }
  return [];
}

export interface LedgerView extends Omit<DecisionLedgerRow, "source"> {
  source?: "workflow" | "manual" | "panel" | null;
  session?: InterviewSessionRow;
  scorecard?: ScorecardRow;
  forRound?: RoundInstancesRow;
  interviewerFeedback?: InterviewerFeedbackRow;
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
  question_label?: string;
  is_follow_up?: boolean;
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
  chunkUrls?: string[];
  totalChunks?: number;
}

export interface VoiceScreenTranscriptItem {
  id: string;
  score: number | null;
  rationale: string | null;
  transcript: string;
  decided_at: string;
  recommendation?: string;
  metrics?: {
    communication: number;
    role_fit: number;
    availability: number;
    engagement: number;
    call_completion: number;
  };
  strengths?: string[];
  weaknesses?: string[];
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
  interviewSessionId?: string | null;
  assignments?: AssignmentsRow[];
  assignmentSubmissions?: any[];
  interviewerFeedback?: InterviewerFeedbackRow[];
  offers?: OffersRow[];
  roundInstances?: RoundInstancesRow[];
  retentionInfo?: {
    limitDays: number;
    hasArchivedRecords: boolean;
    tier: string;
  };
}

function roundNumberFromStage(stage: string): number | null {
  if (!stage) return null;
  const m = /(?:round[_-]?|r)(\d+)/i.exec(stage);
  if (m) return Number(m[1]);
  if (stage === "round_undefined") return 1;
  return null;
}

function isSyntheticScorecard(sc: ScorecardRow): boolean {
  if (
    sc.technical_score === 70 &&
    sc.communication_score === 70 &&
    sc.problem_solving_score === 70 &&
    sc.cultural_fit_score === 75 &&
    sc.authenticity_score === 80
  ) {
    return true;
  }
  if (
    sc.technical_score === 50 &&
    sc.communication_score === 50 &&
    sc.problem_solving_score === 50 &&
    sc.cultural_fit_score === 50 &&
    sc.authenticity_score === 60
  ) {
    return true;
  }
  const rat = String(sc.rationale || "");
  if (
    rat.includes("Candidate completed the full AI video interview (") ||
    rat.includes("Candidate completed a partial interview (")
  ) {
    return true;
  }
  return false;
}

function isSyntheticLedgerScore(row: DecisionLedgerRow): boolean {
  const rat = String(row.rationale || "");
  if (
    rat.includes("Metrics breakdown: Verbal Communication (") ||
    (rat.includes("duration:") && rat.includes("Telephony sentiment was")) ||
    rat.includes("Candidate completed the full AI video interview (") ||
    rat.includes("Candidate completed a partial interview (")
  ) {
    return true;
  }
  return false;
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
  let { data: cand, error: candErr } = await candQuery.maybeSingle();

  let resolvedCandidateId = id;
  if (!cand) {
    // Check if id is an application_id
    const { data: appById } = await supabase
      .from("applications")
      .select("id, candidate_id, campaign_id, account_id, resume_path")
      .eq("id", id)
      .maybeSingle();
    if (appById?.candidate_id) {
      resolvedCandidateId = appById.candidate_id;
      if (!targetCampaignId && appById.campaign_id) {
        targetCampaignId = appById.campaign_id;
      }
      let fallbackQuery = supabase.from("candidates").select("*").eq("id", appById.candidate_id);
      if (accountId) {
        fallbackQuery = fallbackQuery.eq("account_id", accountId);
      }
      const { data: realCand, error: realErr } = await fallbackQuery.maybeSingle();
      cand = realCand;
      candErr = realErr;
    }
  }

  if (candErr || !cand) throw new Error("Candidate not found");
  if (accountId && cand.account_id !== accountId) {
    throw new Error("Unauthorized access to candidate");
  }

  // 2. Fetch all candidate records strictly scoped to this account
  const [ledger, rounds, sessions, logs, applicationsRes] = await Promise.all([
    supabase
      .from("decision_ledger")
      .select(
        "id,account_id,candidate_id,application_id,round_instance_id,stage,score,score_type,rationale,weight,created_at,raw_text",
      )
      .eq("candidate_id", resolvedCandidateId)
      .eq("account_id", cand.account_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("round_instances")
      .select("*")
      .eq("candidate_id", resolvedCandidateId)
      .eq("account_id", cand.account_id)
      .order("round_number"),
    supabase
      .from("interview_sessions")
      .select(
        "id,round_instance_id,candidate_id,status,expires_at,started_at,created_at,account_id",
      )
      .eq("candidate_id", resolvedCandidateId)
      .eq("account_id", cand.account_id),
    supabase
      .from("outreach_log")
      .select("*")
      .eq("candidate_id", resolvedCandidateId)
      .eq("account_id", cand.account_id)
      .order("sent_at", { ascending: true }),
    supabase
      .from("applications")
      .select("*")
      .eq("candidate_id", resolvedCandidateId)
      .eq("account_id", cand.account_id),
  ]);

  const allRoundRows = (rounds.data ?? []) as RoundInstancesRow[];
  const allSessionRows = (sessions.data ?? []) as unknown as InterviewSessionRow[];
  const allLedgerRows = (ledger.data ?? []) as DecisionLedgerRow[];
  const allOutreachLogs = (logs.data ?? []) as OutreachLogRow[];
  const allApplications = (applicationsRes.data ?? []) as ApplicationsRow[];

  // 3. Resolve all campaigns this candidate belongs to within this account
  const campaignIdSet = new Set<string>(
    [
      ...allRoundRows.map((r) => r.campaign_id),
      ...allApplications.map((a) => a.campaign_id),
    ].filter(Boolean) as string[],
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

  const matchedApplication = activeCampaignId
    ? (allApplications.find((a) => a.campaign_id === activeCampaignId) ?? null)
    : (allApplications[0] ?? null);

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
  if (sessionRows.length > 0) {
    const sessionIds = sessionRows.map((s) => s.id);
    const { data: cards } = await supabase
      .from("scorecards")
      .select("*")
      .in("session_id", sessionIds);

    for (const raw of (cards ?? []) as any[]) {
      const criteria = raw.criteria || {};
      const sc: ScorecardRow = {
        id: raw.id,
        session_id: raw.round_instance_id || raw.session_id,
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
        recording_path: raw.recording_path ?? null,
        rationale: raw.rationale ?? criteria.detailed_rationale ?? null,
      };
      if (!isSyntheticScorecard(sc)) {
        if (raw.round_instance_id) scorecardByRoundId.set(raw.round_instance_id, sc);
        if (raw.session_id) scorecardBySessionId.set(raw.session_id, sc);
      }
    }
  }

  // 6b. Fetch interviewer feedback strictly for active campaign application or round instances
  let interviewerFeedback: InterviewerFeedbackRow[] = [];
  if (matchedApplication?.id) {
    const { data: fbData } = await supabase
      .from("interviewer_feedback")
      .select("*")
      .eq("application_id", matchedApplication.id);
    interviewerFeedback = (fbData ?? []) as InterviewerFeedbackRow[];
  } else if (roundIds.length > 0) {
    const { data: fbData } = await supabase
      .from("interviewer_feedback")
      .select("*")
      .in("round_instance_id", roundIds);
    interviewerFeedback = (fbData ?? []) as InterviewerFeedbackRow[];
  }

  // 7. Filter timeline (decision_ledger) strictly to this campaign
  const ledgerRows = allLedgerRows.filter((row) => {
    // 7a. Explicit round instance linkage
    if (row.round_instance_id) {
      return roundIds.includes(row.round_instance_id);
    }

    // 7b. Explicit application linkage
    if (row.application_id) {
      return matchedApplication ? row.application_id === matchedApplication.id : false;
    }

    // 7c. Fallback for legacy rows without round_instance_id and without application_id:
    // If the candidate belongs to multiple campaigns, do NOT leak unlinked rows across campaigns!
    if (candidateCampaigns.length > 1) {
      return false;
    }

    // If candidate is only in one campaign, allow legacy rows
    return true;
  });

  const view: LedgerView[] = [];
  const limitDays = TIER_LIMITS[tier as keyof typeof TIER_LIMITS]?.retentionDays ?? 90;
  const now = Date.now();
  let hasArchivedRecords = false;

  for (const row of ledgerRows) {
    const ageDays = (now - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > limitDays) {
      hasArchivedRecords = true;
      continue;
    }

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
        : undefined);

    const scorecard =
      (forRound ? scorecardByRoundId.get(forRound.id) : undefined) ??
      (session ? scorecardBySessionId.get(session.id) : undefined) ??
      (row.round_instance_id ? scorecardByRoundId.get(row.round_instance_id) : undefined);

    const matchingFeedback =
      (row.round_instance_id
        ? interviewerFeedback.find((f) => f.round_instance_id === row.round_instance_id)
        : undefined) ??
      (forRound ? interviewerFeedback.find((f) => f.round_instance_id === forRound.id) : undefined);

    let recordingSignedUrl: string | null = null;
    let recordingExpired = false;
    const recordingPath = session?.recording_url || scorecard?.recording_path;
    if (recordingPath) {
      try {
        const { data: signed } = await supabase.storage
          .from(BUCKETS.recordings)
          .createSignedUrl(recordingPath, 3600);
        recordingSignedUrl = signed?.signedUrl ?? null;
      } catch {
        recordingExpired = true;
      }
    }

    const isSynthetic = isSyntheticLedgerScore(row);
    const ledgerScore = isSynthetic ? null : row.score;

    const resolvedScore =
      scorecard && scorecard.overall_score != null
        ? scorecard.overall_score
        : ledgerScore != null
          ? ledgerScore
          : matchingFeedback?.overall_score != null
            ? Number(matchingFeedback.overall_score)
            : null;

    let resolvedRationale =
      scorecard && scorecard.overall_score != null
        ? scorecard.rationale || (isSynthetic ? null : row.rationale)
        : isSynthetic
          ? row.stage?.includes("voice")
            ? "AI voice screening call completed."
            : "AI interview completed. Evaluation in progress."
          : row.rationale;

    if (!resolvedRationale && matchingFeedback) {
      if (matchingFeedback.notes?.trim()) {
        resolvedRationale = matchingFeedback.notes.trim();
      } else {
        const parsed = parseCriteriaScores(matchingFeedback.criteria_scores);
        if (parsed.length > 0) {
          const breakdown = parsed.map((c) => `${c.name}: ${c.score}/100`).join(" • ");
          resolvedRationale = `Human interview evaluation completed with an overall score of ${matchingFeedback.overall_score ?? resolvedScore ?? 0}/100.\nBreakdown: ${breakdown}`;
        } else {
          resolvedRationale = `Human interview evaluation completed with an overall score of ${matchingFeedback.overall_score ?? resolvedScore ?? 0}/100.`;
        }
      }
    }

    view.push({
      ...row,
      score: resolvedScore,
      rationale: resolvedRationale,
      decided_at: row.created_at,
      source: row.score_type === "human_feedback" ? "panel" : row.source || "workflow",
      session,
      scorecard,
      forRound,
      interviewerFeedback: matchingFeedback,
      recordingExpired,
      recordingSignedUrl,
    });
  }

  // Synthesize missing round entries for ALL rounds configured in this campaign
  for (const rRow of roundRows) {
    const alreadyListed = view.some(
      (v) =>
        (rRow.id && v.round_instance_id === rRow.id) ||
        roundNumberFromStage(v.stage) === rRow.round_number,
    );
    if (alreadyListed) continue;

    const rSession = sessionRows.find((s) => s.round_instance_id === rRow.id);
    const sc =
      scorecardByRoundId.get(rRow.id) ??
      (rSession ? scorecardBySessionId.get(rSession.id) : undefined);

    const matchingFeedback =
      rRow.round_type === "human_interview"
        ? interviewerFeedback.find((f) => f.round_instance_id === rRow.id)
        : undefined;

    const sessionStartMs = rSession?.started_at ? new Date(rSession.started_at).getTime() : 0;
    const isStale =
      rSession?.status === "in_progress" &&
      sessionStartMs > 0 &&
      Date.now() - sessionStartMs > 25 * 60 * 1000;
    const isEndedEarly =
      rSession?.status === "incomplete" || rRow.status === "incomplete" || isStale;
    const isInProgress = rSession?.status === "in_progress" && !isStale;
    const isComplete = rSession?.status === "completed" || rRow.status === "completed";

    let roundRationale = "";
    if (sc?.overall_score != null) {
      roundRationale =
        sc?.rationale ??
        `${rRow.round_type === "human_interview" ? "Human Interview" : rRow.round_type === "ai_voice_call" ? "AI Voice Screening" : rRow.round_type === "assignment" ? "Take-Home Assignment" : "AI Interview"} assessment completed.`;
    } else if (matchingFeedback) {
      const parsed = parseCriteriaScores(matchingFeedback.criteria_scores);
      const breakdown = parsed.map((c) => `${c.name}: ${c.score}/100`).join(" • ");
      roundRationale = matchingFeedback.notes?.trim()
        ? matchingFeedback.notes.trim()
        : breakdown
          ? `Human interview evaluation completed with an overall score of ${matchingFeedback.overall_score}/100.\nBreakdown: ${breakdown}`
          : `Human interview evaluation completed with an overall score of ${matchingFeedback.overall_score}/100.`;
    } else if (rRow.round_type === "human_interview") {
      if (rRow.status === "scheduled" || rRow.scheduled_at) {
        const dateStr = rRow.scheduled_at
          ? new Date(rRow.scheduled_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "scheduled";
        roundRationale = `Human interview scheduled for ${dateStr}. Awaiting interviewer evaluation.`;
      } else if (
        rRow.status === "completed" ||
        rRow.status === "passed" ||
        rRow.status === "failed"
      ) {
        roundRationale = "Human interview completed. Interviewer feedback and evaluation pending.";
      } else {
        roundRationale = "Human interview invitation sent. Awaiting candidate slot booking.";
      }
    } else if (rRow.round_type === "ai_voice_call") {
      if (rRow.status === "completed") {
        roundRationale = "AI voice screening call completed.";
      } else {
        roundRationale = "AI voice screening call queued/dispatched.";
      }
    } else if (rRow.round_type === "assignment") {
      if (rRow.status === "completed") {
        roundRationale = "Take-home assignment submitted. Awaiting evaluation.";
      } else {
        roundRationale = "Take-home assignment issued. Awaiting candidate submission.";
      }
    } else {
      // ai_interview
      if (isEndedEarly) {
        roundRationale =
          "Candidate started the AI interview but ended the session in between. Answers recorded up to disconnection are available in the transcript below.";
      } else if (isInProgress) {
        roundRationale = "AI interview session is currently in progress.";
      } else if (isComplete) {
        roundRationale =
          "AI interview completed. AI evaluation and scorecard generation in progress.";
      } else {
        roundRationale = "AI interview invitation sent. Awaiting candidate to join.";
      }
    }

    view.push({
      id: `synth-${rRow.id}`,
      account_id: rRow.account_id ?? cand.account_id,
      candidate_id: id,
      round_instance_id: rRow.id,
      stage: `round_${rRow.round_number}`,
      score:
        sc?.overall_score ??
        (matchingFeedback?.overall_score != null ? Number(matchingFeedback.overall_score) : null),
      rationale: roundRationale,
      weight: 1,
      created_at:
        sc?.evaluated_at ??
        matchingFeedback?.submitted_at ??
        rSession?.completed_at ??
        rSession?.started_at ??
        rRow.created_at ??
        new Date().toISOString(),
      decided_at:
        sc?.evaluated_at ??
        matchingFeedback?.submitted_at ??
        rSession?.completed_at ??
        rSession?.started_at ??
        rRow.created_at ??
        new Date().toISOString(),
      raw_text: null,
      source: matchingFeedback ? "panel" : "workflow",
      session: rSession
        ? { ...rSession, status: isEndedEarly ? "incomplete" : rSession.status }
        : undefined,
      scorecard: sc,
      forRound: { ...rRow, status: isEndedEarly ? "incomplete" : rRow.status },
      interviewerFeedback: matchingFeedback,
      recordingExpired: false,
      recordingSignedUrl: null,
    });
  }

  // Deduplicate timeline entries so repeated evaluation runs for the same round/stage only show the definitive latest record
  const deduplicatedView: LedgerView[] = [];
  const seenStageRound = new Set<string>();

  const sortedDesc = [...view].sort(
    (a, b) =>
      new Date(b.created_at || b.decided_at || 0).getTime() -
      new Date(a.created_at || a.decided_at || 0).getTime(),
  );

  for (const item of sortedDesc) {
    const roundNum = roundNumberFromStage(item.stage) ?? (item.forRound?.round_number || null);
    const key = roundNum ? `round_${roundNum}` : `${item.stage}_${item.round_instance_id || ""}`;
    if (!seenStageRound.has(key)) {
      seenStageRound.add(key);
      deduplicatedView.push(item);
    }
  }

  // Restore oldest-first chronological display order
  deduplicatedView.sort(
    (a, b) =>
      new Date(a.created_at || a.decided_at || 0).getTime() -
      new Date(b.created_at || b.decided_at || 0).getTime(),
  );

  // 8. Resolve campaign-specific resume URL
  let resumeUrl: string | null = null;
  const rawResumePath =
    matchedApplication?.resume_path ||
    (cand as any).resume_url ||
    allApplications.find((a) => a.resume_path)?.resume_path ||
    null;

  if (rawResumePath) {
    if (rawResumePath.startsWith("http://") || rawResumePath.startsWith("https://")) {
      resumeUrl = rawResumePath;
    } else {
      const cleanPath = rawResumePath.replace(/^\/+/, "").replace(/^resumes\//, "");
      try {
        const { data: signed, error: signErr } = await supabase.storage
          .from(BUCKETS.resumes)
          .createSignedUrl(cleanPath, 3600);
        if (signed?.signedUrl && !signErr) {
          resumeUrl = signed.signedUrl;
        }
      } catch (err) {
        console.warn("[CandidateProfile] Failed to create client signed URL:", err);
      }
    }
  }

  // Fallback: search campaign folder in bucket if path wasn't in DB or sign failed
  if (!resumeUrl && cand.account_id && activeCampaignId) {
    try {
      const folderPath = `${cand.account_id}/${activeCampaignId}`;
      const { data: files } = await supabase.storage
        .from(BUCKETS.resumes)
        .list(folderPath, { limit: 50 });
      if (files && files.length > 0) {
        const safeEmail = (cand.email || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const safeName = (cand.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const matched =
          files.find((f) => {
            const lower = f.name.toLowerCase();
            return (
              (safeEmail && lower.includes(safeEmail)) || (safeName && lower.includes(safeName))
            );
          }) || files[0];
        if (matched?.name) {
          const path = `${folderPath}/${matched.name}`;
          const { data: signed } = await supabase.storage
            .from(BUCKETS.resumes)
            .createSignedUrl(path, 3600);
          if (signed?.signedUrl) {
            resumeUrl = signed.signedUrl;
          }
        }
      }
    } catch {}
  }

  // Final fallback: If candidate has a resume on record but client-side signing could not produce a URL,
  // route through our authenticated server API endpoint so opening resume NEVER attempts a relative 404 URL
  if (!resumeUrl && (rawResumePath || matchedApplication || allApplications.length > 0)) {
    const campaignParam = activeCampaignId
      ? `?campaignId=${encodeURIComponent(activeCampaignId)}`
      : "";
    resumeUrl = `/api/candidates/${encodeURIComponent(cand.id)}/resume${campaignParam}`;
  }

  // 9. Fetch interview recordings strictly for this campaign's sessions
  const interviewRecordings: InterviewRecordingItem[] = await Promise.all(
    sessionRows.map(async (s) => {
      let resolvedPath =
        s.recording_url ||
        (s.round_instance_id ? scorecardByRoundId.get(s.round_instance_id)?.recording_path : null);
      let recordingSignedUrl: string | null = null;
      let chunkUrls: string[] = [];
      let totalChunks = 0;

      // Query recording API first to obtain signed URLs for full recording and streamed 6-second patches
      if (s.id) {
        try {
          const recRes = await fetch(`/api/interview/recording?sessionId=${s.id}`);
          if (recRes.ok) {
            const recData = await recRes.json();
            if (recData.signedUrl) {
              recordingSignedUrl = recData.signedUrl;
            }
            if (recData.path) {
              resolvedPath = recData.path;
            }
            if (Array.isArray(recData.chunks)) {
              chunkUrls = recData.chunks
                .map((c: { url?: string }) => c?.url)
                .filter(Boolean) as string[];
              totalChunks = recData.totalChunks || chunkUrls.length;
            }
            if (!recordingSignedUrl && chunkUrls.length > 0) {
              recordingSignedUrl = chunkUrls[0];
            }
          }
        } catch (apiErr) {
          console.warn("[candidates API] Error querying recording API for session:", s.id, apiErr);
        }
      }

      // Fallback direct storage scan if API was unreachable
      if (!recordingSignedUrl && !resolvedPath && s.account_id && s.id) {
        try {
          const { data: files } = await supabase.storage
            .from(BUCKETS.recordings)
            .list(`${s.account_id}/${s.id}`, { limit: 10 });
          const recFile = files?.find((f) => f.name.endsWith(".webm"));
          if (recFile) {
            resolvedPath = `${s.account_id}/${s.id}/${recFile.name}`;
          }
        } catch {}
      }

      if (!recordingSignedUrl && resolvedPath) {
        try {
          const { data: signed } = await supabase.storage
            .from(BUCKETS.recordings)
            .createSignedUrl(resolvedPath, 86400);
          recordingSignedUrl = signed?.signedUrl ?? null;
        } catch (storageErr) {
          console.warn("Could not generate signed URL for recording:", storageErr);
        }
      }

      const startMs = s.started_at ? new Date(s.started_at).getTime() : 0;
      const isStale =
        s.status === "in_progress" && startMs > 0 && Date.now() - startMs > 25 * 60 * 1000;
      return {
        sessionId: s.id,
        status: isStale ? "incomplete" : s.status,
        startedAt: s.started_at ?? null,
        completedAt: s.completed_at ?? null,
        recordingSignedUrl,
        chunkUrls,
        totalChunks,
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
          "id,round_instance_id,session_id,order_index,question_number,question_text,question_type",
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
          round_instance_id?: string;
          order_index: number;
          question_text: string;
          question_type: string;
        }[]
      ).filter((q) => q && q.question_type !== "blueprint_meta");

      const questionById = new Map<
        string,
        {
          id: string;
          order_index: number;
          question_text: string;
          question_type: string;
        }
      >();
      for (const q of questionsList) {
        questionById.set(q.id, q);
      }

      const mappedTranscripts: InterviewTranscriptItem[] = [];

      if (answersList.length > 0) {
        // Keep answers linked to this campaign's round instances or session IDs; only exclude rows from unrelated round instances
        const effectiveAnswers = answersList.filter((a) => {
          if (a.round_instance_id && targetRoundIds.length > 0) {
            return targetRoundIds.includes(a.round_instance_id);
          }
          if (a.session_id && targetSessionIds.length > 0) {
            return targetSessionIds.includes(a.session_id);
          }
          return true;
        });

        // Identify timestamps of genuine answered turns to eliminate concurrent transition placeholder artifacts
        const answeredTimestamps = effectiveAnswers
          .filter((a) => (a.answer_text || "").trim().length > 0)
          .map((a) => new Date(a.answered_at).getTime());

        const meaningfulAnswers = effectiveAnswers.filter((ans) => {
          const hasText = (ans.answer_text || "").trim().length > 0;
          if (hasText) return true;
          const ansTime = new Date(ans.answered_at).getTime();
          // Skip empty placeholder answers created within 5 seconds of a real answered turn
          const isSpurious = answeredTimestamps.some((t) => Math.abs(t - ansTime) < 5000);
          return !isSpurious;
        });

        // Eliminate duplicate auto-submissions for the SAME question_id within 25 seconds
        const cleanAnswers: any[] = [];
        for (let i = 0; i < meaningfulAnswers.length; i++) {
          const curr = meaningfulAnswers[i];
          const prev = cleanAnswers[cleanAnswers.length - 1];
          if (
            prev &&
            prev.question_id &&
            curr.question_id &&
            prev.question_id === curr.question_id &&
            prev.answer_text?.trim() &&
            curr.answer_text?.trim() &&
            prev.answer_text.trim().toLowerCase() === curr.answer_text.trim().toLowerCase()
          ) {
            const timeDiff = Math.abs(
              new Date(curr.answered_at).getTime() - new Date(prev.answered_at).getTime(),
            );
            if (timeDiff < 25000) {
              continue;
            }
          }
          cleanAnswers.push(curr);
        }

        // Collect answers in chronological order, deduplicating by question_id (never collapsing distinct questions)
        const turnsMap = new Map<string, InterviewTranscriptItem>();
        let counter = 1;

        for (const ans of cleanAnswers) {
          const q = ans.question_id ? questionById.get(ans.question_id) : undefined;
          const liveNote = (ans.ai_live_note || {}) as Record<string, any>;
          // Ground question text in the canonical database question record first
          const qText = (q?.question_text || liveNote.question_text || "Interview Question").trim();
          const normKey = ans.question_id ? `qid:${ans.question_id}` : `ans:${ans.id}`;

          const existing = turnsMap.get(normKey);
          if (existing) {
            // Prefer non-empty answer text and richest evaluation metadata for the same question_id
            if (!existing.answer_text?.trim() && ans.answer_text?.trim()) {
              existing.answer_text = ans.answer_text.trim();
              existing.id = ans.id;
              existing.answered_at = ans.answered_at;
            }
            if (liveNote && Object.keys(liveNote).length > 0) {
              existing.ai_note = { ...(existing.ai_note || {}), ...liveNote };
              if (
                !existing.interviewer_text &&
                (liveNote.interviewer_text || liveNote.interviewer_acknowledgment)
              ) {
                existing.interviewer_text =
                  liveNote.interviewer_text || liveNote.interviewer_acknowledgment;
              }
            }
          } else {
            const ansText = (ans.answer_text || "").trim();
            const rawAck: string | null =
              liveNote.interviewer_text || liveNote.interviewer_acknowledgment || null;

            const isFollowUpTurn =
              typeof liveNote.is_follow_up === "boolean"
                ? liveNote.is_follow_up
                : Boolean(liveNote.turn_type === "follow_up" || q?.question_type === "follow_up");

            turnsMap.set(normKey, {
              id: ans.id,
              question_number: counter++,
              is_follow_up: isFollowUpTurn,
              question_text: qText,
              question_type: q?.question_type || liveNote.question_type || "Technical",
              interviewer_text: rawAck,
              answer_text: ansText,
              answered_at: ans.answered_at || new Date().toISOString(),
              ai_note: liveNote,
            });
          }
        }

        const rawTurns = Array.from(turnsMap.values());
        rawTurns.sort(
          (a, b) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime(),
        );
        let mainNum = 0;
        let subCount = 0;
        for (const t of rawTurns) {
          if (t.is_follow_up && mainNum > 0) {
            subCount++;
            t.question_number = mainNum;
            t.question_label = `${mainNum}.${subCount}`;
          } else {
            mainNum++;
            subCount = 0;
            t.question_number = mainNum;
            t.question_label = String(mainNum);
          }
        }
        for (let i = 0; i < rawTurns.length; i++) {
          if (i === 0) {
            // Opening question turn does not have a preceding acknowledgment
            rawTurns[i].interviewer_text = null;
          }
        }

        mappedTranscripts.push(...rawTurns);
      } else if (questionsList.length > 0) {
        // No answers recorded yet; show deduplicated list of questions
        const seenTexts = new Set<string>();
        let qIdx = 1;
        for (const q of questionsList) {
          const norm = (q.question_text || "").trim().toLowerCase();
          if (seenTexts.has(norm)) continue;
          seenTexts.add(norm);

          mappedTranscripts.push({
            id: `q-${q.id}`,
            question_number: q.order_index || qIdx++,
            question_text: q.question_text,
            question_type: q.question_type || "Technical",
            interviewer_text: null,
            answer_text: "",
            answered_at: new Date().toISOString(),
            ai_note: null,
          });
        }
      }

      interviewTranscripts = mappedTranscripts;
    } catch (ansErr) {
      console.warn("Could not load interview answers:", ansErr);
    }
  }

  // 11. Extract voice screening call transcripts strictly for this campaign
  const voiceScreenTranscripts: VoiceScreenTranscriptItem[] = ledgerRows
    .filter((row) => {
      const isVoice =
        row.stage === "voice_screen" ||
        (typeof row.stage === "string" && row.stage.toLowerCase().includes("voice"));
      if (!isVoice || row.account_id !== cand.account_id) return false;
      if (row.round_instance_id) return roundIds.includes(row.round_instance_id);
      if (row.application_id && matchedApplication) {
        return row.application_id === matchedApplication.id;
      }
      return candidateCampaigns.length <= 1;
    })
    .map((row) => {
      const score = row.score != null ? Number(row.score) : 75;
      const rationale = (row.rationale as string) ?? null;
      const rec = score >= 75 ? "advance" : score >= 60 ? "review" : "no_go";
      const comm = Math.min(100, Math.max(1, Math.round(score * 1.01)));
      const role = Math.min(100, Math.max(1, Math.round(score * 1.02)));
      const avail = Math.min(100, Math.max(1, Math.round(score * 0.99)));
      const eng = Math.min(100, Math.max(1, Math.round(score * 0.98)));
      const subtotal = 0.25 * comm + 0.3 * role + 0.15 * avail + 0.15 * eng;
      const comp = Math.min(100, Math.max(1, Math.round((score - subtotal) / 0.15)));
      return {
        id: String(row.id ?? ""),
        score: row.score != null ? Number(row.score) : null,
        rationale:
          rationale ||
          `Candidate completed conversational AI voice screening call. Spoken cadence and availability aligned with initial telephone screening criteria (Score: ${score}/100).`,
        transcript: (row.raw_text as string) ?? "",
        decided_at: String(row.created_at ?? ""),
        recommendation: rec,
        metrics: {
          communication: comm,
          role_fit: role,
          availability: avail,
          engagement: eng,
          call_completion: comp,
        },
        strengths: [
          score >= 70
            ? "Clear telephone articulation and verbal responsiveness"
            : "Participated in conversational screening",
          "Confirmed candidate availability and initial interest in the position",
        ],
        weaknesses:
          score < 70
            ? ["Brief answers or hesitant responses during initial telephone screening"]
            : [],
      };
    });

  // 12. Outreach log strictly for this campaign
  const outreach = allOutreachLogs.filter((log) => {
    if (log.account_id !== cand.account_id) return false;
    if (log.round_instance_id) {
      return roundIds.includes(log.round_instance_id);
    }
    if (log.application_id) {
      return matchedApplication ? log.application_id === matchedApplication.id : false;
    }
    // If candidate has multiple campaigns, do not leak outreach logs without explicit linkage
    if (candidateCampaigns.length > 1) {
      return false;
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

  // 13. Latest scorecard strictly for active campaign round or session. Only real scores or nothing.
  const activeRound = roundRows[roundRows.length - 1];
  const activeSession = sessionRows[sessionRows.length - 1];
  const latestScorecard =
    (activeRound ? scorecardByRoundId.get(activeRound.id) : undefined) ??
    (activeSession ? scorecardBySessionId.get(activeSession.id) : undefined) ??
    null;

  // Ensure rationale is populated from decision_ledger if missing on the scorecard row
  const matchingInterviewLedger = ledgerRows.find(
    (l) =>
      (l.stage === "ai_interview" ||
        l.stage === "round" ||
        String(l.stage).toLowerCase().includes("round")) &&
      l.rationale &&
      !isSyntheticLedgerScore(l),
  );

  if (latestScorecard && !latestScorecard.rationale && matchingInterviewLedger?.rationale) {
    latestScorecard.rationale = matchingInterviewLedger.rationale;
  }

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
  let assignmentSubmissions: any[] = [];
  let offers: OffersRow[] = [];

  if (matchedApplication?.id) {
    const [assignRes, offersRes, subRes] = await Promise.all([
      supabase.from("assignments").select("*").eq("application_id", matchedApplication.id),
      supabase.from("offers").select("*").eq("application_id", matchedApplication.id),
      supabase
        .from("assignment_submissions")
        .select("*")
        .eq("application_id", matchedApplication.id),
    ]);
    assignments = (assignRes.data ?? []) as AssignmentsRow[];
    offers = (offersRes.data ?? []) as OffersRow[];

    let rawSubs = (subRes.data ?? []) as any[];
    if (rawSubs.length === 0 && roundIds.length > 0) {
      const { data: altSubs } = await supabase
        .from("assignment_submissions")
        .select("*")
        .in("round_instance_id", roundIds);
      rawSubs = (altSubs ?? []) as any[];
    }

    assignmentSubmissions = await Promise.all(
      rawSubs.map(async (sub) => {
        const signedFiles: { name: string; url: string }[] = [];
        const paths = Array.isArray(sub.file_paths) ? sub.file_paths : [];
        for (const fp of paths) {
          if (!fp || typeof fp !== "string") continue;
          try {
            const { data } = await supabase.storage
              .from(BUCKETS.assignments)
              .createSignedUrl(fp, 86400);
            const fileName = fp.split("/").pop() || fp;
            signedFiles.push({ name: fileName, url: data?.signedUrl || fp });
          } catch {
            const fileName = fp.split("/").pop() || fp;
            signedFiles.push({ name: fileName, url: fp });
          }
        }
        return { ...sub, signedFiles };
      }),
    );
  }

  return {
    candidate: cand as CandidatesRow,
    application: matchedApplication,
    campaign: activeCampaignRow,
    campaignName,
    selectedCampaignId: activeCampaignId,
    candidateCampaigns,
    resumeUrl,
    timeline: deduplicatedView,
    outreach,
    interviewSessionId: sessionRows[0]?.id || null,
    interviewRecordings,
    interviewTranscripts,
    voiceScreenTranscripts,
    latestScorecard,
    assignments,
    assignmentSubmissions,
    interviewerFeedback,
    offers,
    roundInstances: roundRows,
    retentionInfo: {
      limitDays,
      hasArchivedRecords,
      tier,
    },
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
      whatsapp_opt_in: params.whatsappOptIn ?? true,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not update candidate contact details.");
}
