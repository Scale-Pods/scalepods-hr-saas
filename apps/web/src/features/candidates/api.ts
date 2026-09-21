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
  return m ? Number(m[1]) : null;
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
      .select("*")
      .eq("candidate_id", id)
      .order("decided_at", { ascending: true }),
    supabase.from("round_instances").select("*").eq("candidate_id", id).order("round_number"),
    supabase
      .from("interview_sessions")
      .select(
        "id,round_instance_id,candidate_id,status,invite_link,expires_at,created_at,account_id",
      )
      .eq("candidate_id", id),
    supabase
      .from("outreach_log")
      .select("*")
      .eq("candidate_id", id)
      .order("sent_at", { ascending: true }),
  ]);

  const roundRows = (rounds.data ?? []) as RoundInstancesRow[];
  const sessionRows = (sessions.data ?? []) as InterviewSessionRow[];

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

  const scorecardBySession = new Map<string, ScorecardRow>();
  if (sessionRows.length > 0) {
    const ids = sessionRows.map((s) => s.id);
    const { data: cards } = await supabase.from("scorecards").select("*").in("session_id", ids);
    for (const sc of (cards ?? []) as ScorecardRow[]) {
      scorecardBySession.set(sc.session_id, sc);
    }
  }

  const retentionDays = TIER_LIMITS[tier as keyof typeof TIER_LIMITS]?.retentionDays ?? 7;
  const now = Date.now();

  const view: LedgerView[] = ((ledger.data ?? []) as DecisionLedgerRow[]).map((row) => {
    const roundNumber = roundNumberFromStage(row.stage);
    const forRound = roundNumber
      ? roundRows.find((r) => r.round_number === roundNumber)
      : undefined;
    const session =
      (forRound ? sessionRows.find((s) => s.round_instance_id === forRound.id) : undefined) ??
      (roundNumber === 1 ? sessionRows[0] : undefined);
    const scorecard = session ? scorecardBySession.get(session.id) : undefined;
    let recordingExpired = false;
    if (scorecard?.evaluated_at) {
      recordingExpired =
        now - new Date(scorecard.evaluated_at).getTime() > retentionDays * 86_400_000;
    }
    return { ...row, session, scorecard, forRound, recordingExpired };
  });

  let resumeUrl: string | null = null;
  if (cand.resume_url) {
    const { data } = await supabase.storage
      .from(BUCKETS.resumes)
      .createSignedUrl(cand.resume_url, 3600);
    resumeUrl = data?.signedUrl ?? cand.resume_url;
  }

  return {
    candidate: cand as CandidatesRow,
    campaignName,
    resumeUrl,
    timeline: view,
    outreach: (logs.data ?? []) as OutreachLogRow[],
  };
}
