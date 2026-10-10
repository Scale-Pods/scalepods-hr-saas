import type { CampaignRoundsRow, CampaignsRow } from "@scalepods/core";
import { supabaseBrowser } from "@/lib/supabase/client";
import { callWorkflow } from "@/lib/webhooks";

export interface CampaignListItem extends CampaignsRow {
  candidates: number;
}

/** Tally `campaign_candidates` rows per campaign id (pure, unit-tested). */
export function aggregateCandidateCounts(links: { campaign_id: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const link of links) {
    counts[link.campaign_id] = (counts[link.campaign_id] ?? 0) + 1;
  }
  return counts;
}

export async function fetchCampaigns(): Promise<CampaignListItem[]> {
  const supabase = supabaseBrowser();
  const [campaigns, links] = await Promise.all([
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("round_instances").select("campaign_id,candidate_id"),
  ]);
  if (campaigns.error) throw campaigns.error;

  const counts: Record<string, number> = {};
  const seenByCampaign: Record<string, Set<string>> = {};
  for (const link of (links.data ?? []) as { campaign_id: string; candidate_id: string }[]) {
    if (!seenByCampaign[link.campaign_id]) {
      seenByCampaign[link.campaign_id] = new Set();
    }
    if (!seenByCampaign[link.campaign_id].has(link.candidate_id)) {
      seenByCampaign[link.campaign_id].add(link.candidate_id);
      counts[link.campaign_id] = (counts[link.campaign_id] ?? 0) + 1;
    }
  }

  return ((campaigns.data as CampaignsRow[] | null) ?? []).map((row) => ({
    ...row,
    candidates: counts[row.id] ?? 0,
  }));
}

export interface ViewCandidate {
  application_id?: string;
  candidate_id: string;
  name: string | null;
  email: string;
  phone: string | null;
  resume_url?: string | null;
  current_stage: string | null;
  current_round_number?: number | null;
  status?: string;
  status_before_hold?: string | null;
  rejection_reason?: string | null;
  latest_score: number | null;
  score_rationale?: string | null;
  decision: string | null;
  round_instance_id?: string | null;
  round_number?: number;
  reviewer_cutoff?: number | null;
  created_at?: string;
}

export interface CampaignDetail {
  campaign: CampaignsRow;
  rounds: CampaignRoundsRow[];
  candidates: ViewCandidate[];
  roundStatuses: Record<number, string>;
}

export async function fetchCampaignDetail(id: string): Promise<CampaignDetail> {
  const supabase = supabaseBrowser();
  const [c, r, appsRes, ris, statuses] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).maybeSingle(),
    supabase.from("campaign_rounds").select("*").eq("campaign_id", id).order("round_number"),
    supabase
      .from("applications")
      .select("*")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("round_instances")
      .select(
        "id,candidate_id,campaign_id,application_id,round_number,status,reviewer_cutoff,created_at",
      )
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("round_instances")
      .select("round_number,status")
      .eq("campaign_id", id)
      .in("status", ["passed", "failed", "no_show"]),
  ]);
  if (c.error) throw c.error;

  const byRound: Record<number, string> = {};
  for (const s of (statuses.data ?? []) as { round_number: number; status: string }[]) {
    byRound[s.round_number] = s.status;
  }

  const roundInstances = (ris.data ?? []) as {
    id: string;
    candidate_id: string;
    campaign_id: string;
    application_id?: string | null;
    round_number: number;
    status: string;
    created_at: string;
    reviewer_cutoff?: number | null;
  }[];

  const applicationsList = (appsRes.data ?? []) as any[];

  let candidates: ViewCandidate[] = [];

  if (applicationsList.length > 0) {
    const appIds = applicationsList.map((a) => a.id);
    const { data: dlData } = await supabase
      .from("decision_ledger")
      .select("application_id,candidate_id,score,score_type,rationale,decided_at,created_at")
      .in("application_id", appIds)
      .order("created_at", { ascending: false });

    const dlList = (dlData ?? []) as any[];

    candidates = applicationsList.map((app) => {
      const appScoreRow = dlList.find(
        (d) => d.application_id === app.id && d.score_type === "resume" && d.score != null,
      );
      const appRi = roundInstances.find(
        (r) =>
          r.application_id === app.id ||
          (r.candidate_id === app.candidate_id && r.round_number === app.current_round_number),
      );

      let stageLabel = "Resume Screening";
      if (app.current_stage === "round") {
        stageLabel = `Round ${app.current_round_number ?? 1}`;
      } else if (app.current_stage === "offer") {
        stageLabel = app.status === "offer_sent" ? "Offer Sent" : "Offer Ready";
      }

      return {
        application_id: app.id,
        candidate_id: app.candidate_id,
        name: app.candidate_name,
        email: app.candidate_email,
        phone: app.candidate_phone,
        resume_url: app.resume_path,
        current_stage: stageLabel,
        current_round_number: app.current_round_number,
        status: app.status,
        status_before_hold: app.status_before_hold,
        rejection_reason: app.rejection_reason,
        latest_score: appScoreRow?.score != null ? Number(appScoreRow.score) : null,
        score_rationale: appScoreRow?.rationale ?? null,
        decision: app.status === "rejected" ? "rejected" : (appRi?.status ?? app.status),
        round_instance_id: appRi?.id ?? null,
        round_number: app.current_round_number ?? appRi?.round_number ?? 1,
        reviewer_cutoff: appRi?.reviewer_cutoff ?? null,
        created_at: app.created_at,
      };
    });
  } else {
    // Legacy fallback for pre-application campaigns
    const candIds = Array.from(new Set(roundInstances.map((ri) => ri.candidate_id)));
    if (candIds.length > 0) {
      const { data: candsData } = await supabase
        .from("candidates")
        .select("id,name,email,phone,resume_url")
        .in("id", candIds);

      const allCands = (candsData ?? []) as any[];
      candidates = allCands.map((cand) => {
        const candRi = roundInstances.find((r) => r.candidate_id === cand.id);
        return {
          candidate_id: cand.id,
          name: cand.name,
          email: cand.email,
          phone: cand.phone,
          resume_url: cand.resume_url,
          current_stage: candRi ? `Round ${candRi.round_number}` : "Resume Screening",
          latest_score: null,
          decision: candRi?.status ?? "active",
          round_instance_id: candRi?.id ?? null,
          round_number: candRi?.round_number ?? 1,
          reviewer_cutoff: candRi?.reviewer_cutoff ?? null,
        };
      });
    }
  }

  return {
    campaign: (c.data as CampaignsRow) ?? null,
    rounds: (r.data ?? []) as CampaignRoundsRow[],
    candidates,
    roundStatuses: byRound,
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

export async function reviewCandidateRound(params: {
  roundInstanceId: string;
  reviewerCutoff: number;
  decision?: "passed" | "failed";
  campaignId: string;
  candidateId: string;
  applicationId?: string;
  roundNumber?: number;
  numberOfRounds?: number;
  score?: number | null;
  accountId?: string;
  accessToken?: string;
}): Promise<void> {
  if (params.applicationId) {
    await decideApplication({
      applicationId: params.applicationId,
      action: params.decision === "failed" ? "reject" : "advance",
    });
    return;
  }
  const supabase = supabaseBrowser();
  const decision =
    params.decision ??
    (params.score != null && params.score >= params.reviewerCutoff ? "passed" : "failed");

  const { error } = await supabase
    .from("round_instances")
    .update({
      status: decision,
      reviewer_cutoff: params.reviewerCutoff,
    })
    .eq("id", params.roundInstanceId);

  if (error) throw error;

  if (params.accountId) {
    try {
      await callWorkflow("round-review", {
        body: {
          round_instance_id: params.roundInstanceId,
          reviewer_cutoff: params.reviewerCutoff,
          decision,
          campaign_id: params.campaignId,
          candidate_id: params.candidateId,
          round_number: params.roundNumber,
          number_of_rounds: params.numberOfRounds,
          score: params.score,
          account_id: params.accountId,
        },
        accessToken: params.accessToken,
      });
    } catch (wfErr) {
      console.warn("n8n round-review notification skipped or failed:", wfErr);
    }
  }
}

export async function updateCampaignStatus(
  campaignId: string,
  newStatus: "open" | "closed",
  accountId?: string,
  accessToken?: string,
): Promise<void> {
  const supabase = supabaseBrowser();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: newStatus })
    .eq("id", campaignId);
  if (error) throw error;

  if (accountId) {
    try {
      await callWorkflow("campaigns", {
        body: {
          action: "update",
          account_id: accountId,
          campaign_id: campaignId,
          status: newStatus,
        },
        accessToken,
      });
    } catch (wfErr) {
      console.warn("n8n campaign status update notification skipped or failed:", wfErr);
    }
  }
}

export async function deleteCampaign(
  campaignId: string,
  accountId?: string,
  accessToken?: string,
): Promise<void> {
  const token =
    accessToken ??
    (supabaseBrowser()
      ? (await supabaseBrowser().auth.getSession()).data.session?.access_token
      : undefined);

  const res = await fetch(`/api/campaigns/${campaignId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ accountId }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || `Failed to delete campaign (${res.status})`);
  }
}
