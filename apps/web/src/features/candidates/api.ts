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

export interface CandidateProfile {
  candidate: CandidatesRow;
  campaignName: string | null;
  resumeUrl: string | null;
  timeline: LedgerView[];
  outreach: OutreachLogRow[];
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

  return {
    candidate: cand as CandidatesRow,
    campaignName,
    resumeUrl,
    timeline: view,
    outreach: (logs.data ?? []) as OutreachLogRow[],
  };
}
