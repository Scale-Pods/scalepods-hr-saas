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
    supabase.from("campaign_candidates").select("campaign_id"),
  ]);
  if (campaigns.error) throw campaigns.error;

  const counts = aggregateCandidateCounts((links.data ?? []) as { campaign_id: string }[]);
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
  const [c, r, v, statuses] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).maybeSingle(),
    supabase.from("campaign_rounds").select("*").eq("campaign_id", id).order("round_number"),
    supabase
      .from("campaign_candidates")
      .select("*")
      .eq("campaign_id", id)
      .order("name", { ascending: true }),
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
  return {
    campaign: (c.data as CampaignsRow) ?? null,
    rounds: (r.data ?? []) as CampaignRoundsRow[],
    candidates: (v.data ?? []) as unknown as ViewCandidate[],
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
