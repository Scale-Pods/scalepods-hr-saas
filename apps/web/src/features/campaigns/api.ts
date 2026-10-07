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
  candidate_id: string;
  name: string | null;
  email: string;
  phone: string | null;
  current_stage: string | null;
  latest_score: number | null;
  decision: string | null;
  round_instance_id?: string | null;
  round_number?: number;
  reviewer_cutoff?: number | null;
}

export interface CampaignDetail {
  campaign: CampaignsRow;
  rounds: CampaignRoundsRow[];
  candidates: ViewCandidate[];
  roundStatuses: Record<number, string>;
}

export async function fetchCampaignDetail(id: string): Promise<CampaignDetail> {
  const supabase = supabaseBrowser();
  const [c, r, ris, statuses] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).maybeSingle(),
    supabase.from("campaign_rounds").select("*").eq("campaign_id", id).order("round_number"),
    supabase
      .from("round_instances")
      .select("id,candidate_id,campaign_id,round_number,status,reviewer_cutoff,created_at")
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
    round_number: number;
    status: string;
    created_at: string;
  }[];

  const candIds = Array.from(new Set(roundInstances.map((ri) => ri.candidate_id)));

  // Also query storage for candidate resumes uploaded to this specific campaign
  const campaignRow = (c.data as CampaignsRow) ?? null;
  let storageEmails: string[] = [];
  if (campaignRow?.account_id) {
    try {
      const { data: storageFiles } = await supabase.storage
        .from("resumes")
        .list(`${campaignRow.account_id}/${id}`, { limit: 1000 });
      if (storageFiles && storageFiles.length > 0) {
        storageEmails = storageFiles
          .map((f) => {
            try {
              return decodeURIComponent(f.name).toLowerCase().trim();
            } catch {
              return f.name.toLowerCase().trim();
            }
          })
          .filter((name) => name.includes("@"));
      }
    } catch {
      // Storage listing optional fallback
    }
  }

  let candidates: ViewCandidate[] = [];
  if (candIds.length > 0 || storageEmails.length > 0) {
    let candsQuery = supabase.from("candidates").select("id,name,email,phone");

    if (campaignRow?.account_id) {
      candsQuery = candsQuery.eq("account_id", campaignRow.account_id);
    }

    const candsRes = await candsQuery;
    const allAccountCands = (candsRes.data ?? []) as {
      id: string;
      name: string | null;
      email: string;
      phone: string | null;
    }[];

    const storageSet = new Set(storageEmails);
    const candIdSet = new Set(candIds);

    const candsList = allAccountCands.filter((cand) => {
      if (candIdSet.has(cand.id)) return true;
      const em = cand.email?.toLowerCase().trim();
      return em && storageSet.has(em);
    });

    const allCandIds = candsList.map((cand) => cand.id);
    let dlQuery = supabase
      .from("decision_ledger")
      .select("id,candidate_id,round_instance_id,stage,score,created_at")
      .in("candidate_id", allCandIds)
      .order("created_at", { ascending: false });

    if (campaignRow?.account_id) {
      dlQuery = dlQuery.eq("account_id", campaignRow.account_id);
    }

    const dlRes = allCandIds.length > 0 ? await dlQuery : { data: [] };

    const dlList = (dlRes.data ?? []) as unknown as {
      id: string;
      candidate_id: string;
      round_instance_id: string | null;
      stage: string;
      score: number | null;
      created_at: string;
    }[];

    const thisCampaignRiIds = new Set(roundInstances.map((ri) => ri.id));

    candidates = candsList.map((cand) => {
      const candRi = roundInstances.find((r) => r.candidate_id === cand.id);
      const candDls = dlList.filter((d) => d.candidate_id === cand.id);

      // 1. Direct round_instance match
      let candDl = candRi ? candDls.find((d) => d.round_instance_id === candRi.id) : null;

      // 2. Resume screening match (round_instance_id is null or belongs to this campaign)
      if (!candDl) {
        const resumeDls = candDls.filter(
          (d) => !d.round_instance_id || thisCampaignRiIds.has(d.round_instance_id),
        );
        if (candRi && resumeDls.length > 0) {
          const riTime = new Date(candRi.created_at).getTime();
          // Pick the resume screening closest in time to this campaign's round instance
          candDl = resumeDls.reduce((best, curr) => {
            const bestDiff = Math.abs(new Date(best.created_at).getTime() - riTime);
            const currDiff = Math.abs(new Date(curr.created_at).getTime() - riTime);
            return currDiff < bestDiff ? curr : best;
          }, resumeDls[0]);
        } else {
          candDl = resumeDls[0] || null;
        }
      }

      let stage = candDl?.stage;
      if (!stage || stage === "round_undefined") {
        stage = candRi ? `Round ${candRi.round_number}` : "Resume screening";
      } else if (stage.toLowerCase().includes("resume")) {
        stage = "Resume screening";
      } else if (stage.startsWith("round_")) {
        stage = `Round ${stage.replace("round_", "")}`;
      }

      return {
        candidate_id: cand.id,
        name: cand.name,
        email: cand.email,
        phone: cand.phone,
        current_stage: stage,
        latest_score: candDl?.score != null ? Number(candDl.score) : null,
        decision: candRi?.status ?? null,
        round_instance_id: candRi?.id ?? null,
        round_number: candRi?.round_number ?? 1,
        reviewer_cutoff:
          (candRi as unknown as { reviewer_cutoff?: number | null })?.reviewer_cutoff ?? null,
      };
    });
  }

  return {
    campaign: (c.data as CampaignsRow) ?? null,
    rounds: (r.data ?? []) as CampaignRoundsRow[],
    candidates,
    roundStatuses: byRound,
  };
}

export async function reviewCandidateRound(params: {
  roundInstanceId: string;
  reviewerCutoff: number;
  decision?: "passed" | "failed";
  campaignId: string;
  candidateId: string;
  roundNumber?: number;
  numberOfRounds?: number;
  score?: number | null;
  accountId?: string;
  accessToken?: string;
}): Promise<void> {
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
  newStatus: string,
  accountId?: string,
  accessToken?: string,
): Promise<void> {
  const normalizedStatus =
    newStatus === "off" || newStatus === "paused" || newStatus === "inactive" ? "paused" : "on";
  const supabase = supabaseBrowser();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: normalizedStatus })
    .eq("id", campaignId);
  if (error) throw error;

  if (accountId) {
    try {
      await callWorkflow("campaigns", {
        body: {
          action: "update",
          account_id: accountId,
          campaign_id: campaignId,
          status: normalizedStatus,
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
