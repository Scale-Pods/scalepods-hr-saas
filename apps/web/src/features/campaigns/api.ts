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
      .select("id,candidate_id,campaign_id,round_number,status,created_at")
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

  let candidates: ViewCandidate[] = [];
  if (candIds.length > 0) {
    const [candsRes, dlRes] = await Promise.all([
      supabase.from("candidates").select("id,name,email,phone").in("id", candIds),
      supabase
        .from("decision_ledger")
        .select("id,candidate_id,stage,score,created_at")
        .in("candidate_id", candIds)
        .order("created_at", { ascending: false }),
    ]);

    const candsList = (candsRes.data ?? []) as { id: string; name: string | null; email: string; phone: string | null }[];
    const dlList = ((dlRes.data ?? []) as unknown) as { id: string; candidate_id: string; stage: string; score: number | null; created_at: string }[];

    candidates = candsList.map((cand) => {
      const candDl = dlList.find((d) => d.candidate_id === cand.id);
      const candRi = roundInstances.find((r) => r.candidate_id === cand.id);

      let stage = candDl?.stage;
      if (!stage || stage === "round_undefined") {
        stage = candRi ? `Round ${candRi.round_number}` : "Screening";
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

export async function updateCampaignStatus(
  campaignId: string,
  currentStatus: string,
  accountId: string,
  accessToken?: string,
): Promise<void> {
  await callWorkflow("campaigns", {
    body: {
      action: "update",
      account_id: accountId,
      campaign_id: campaignId,
      status: currentStatus === "on" ? "off" : "on",
    },
    accessToken,
  });
}
