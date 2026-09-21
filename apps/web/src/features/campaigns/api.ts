import type { CampaignsRow } from "@scalepods/core";
import { supabaseBrowser } from "@/lib/supabase/client";

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
