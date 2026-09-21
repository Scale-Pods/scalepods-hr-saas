import { type Reports, reportsSchema } from "@scalepods/core";
import { supabaseBrowser } from "@/lib/supabase/client";
import { callWorkflow } from "@/lib/webhooks";

export interface DashboardKpis {
  activeCampaigns: number | null;
  candidateCount: number | null;
  candidateCreatedAt: string[];
  interviewsThisWeek: number | null;
  interviewsPriorWeek: number | null;
}

export interface UpcomingInterview {
  id: string;
  candidate_id: string;
  round_type: string;
  scheduled_at: string | null;
  status: string;
}

export interface LedgerEntry {
  id: string;
  candidate_id: string;
  stage: string;
  score: number | null;
  source: string;
  override_of: string | null;
  decided_at: string;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Report data comes from n8n workflow 11. Parsed through `reportsSchema` so a
 * drifting backend payload degrades to an "unavailable" widget instead of
 * crashing the dashboard.
 */
export async function fetchReports(accountId: string, accessToken?: string): Promise<Reports> {
  const res = await callWorkflow<unknown>("reports", {
    method: "GET",
    query: { account_id: accountId },
    accessToken,
  });
  return reportsSchema.parse(res);
}

/** Headline counts for the KPI matrix, straight from RLS-scoped tables. */
export async function fetchDashboardKpis(): Promise<DashboardKpis> {
  const supabase = supabaseBrowser();
  const now = new Date();
  const wkStart = startOfDay(new Date(now.getTime() - 6 * 86_400_000));
  const prevStart = startOfDay(new Date(wkStart.getTime() - 86_400_000));

  const [campCount, candCount, candDates, wkCount, prevCount] = await Promise.all([
    supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "on"),
    supabase.from("candidates").select("id", { count: "exact", head: true }),
    supabase.from("candidates").select("created_at").limit(1000),
    supabase
      .from("round_instances")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_at", wkStart.toISOString())
      .lte("scheduled_at", now.toISOString()),
    supabase
      .from("round_instances")
      .select("id", { count: "exact", head: true })
      .gte("scheduled_at", prevStart.toISOString())
      .lt("scheduled_at", wkStart.toISOString()),
  ]);

  return {
    activeCampaigns: campCount.error ? null : (campCount.count ?? 0),
    candidateCount: candCount.error ? null : (candCount.count ?? 0),
    candidateCreatedAt: (candDates.data ?? [])
      .map((r) => r.created_at)
      .filter((v): v is string => Boolean(v)),
    interviewsThisWeek: wkCount.error ? null : (wkCount.count ?? 0),
    interviewsPriorWeek: prevCount.error ? null : (prevCount.count ?? 0),
  };
}

export async function fetchUpcomingInterviews(): Promise<UpcomingInterview[]> {
  const { data } = await supabaseBrowser()
    .from("round_instances")
    .select("id,candidate_id,round_type,scheduled_at,status")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5);
  return (data ?? []) as UpcomingInterview[];
}

export async function fetchLedger(limit = 200): Promise<LedgerEntry[]> {
  const { data } = await supabaseBrowser()
    .from("decision_ledger")
    .select("id,candidate_id,stage,score,source,override_of,decided_at")
    .order("decided_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as LedgerEntry[];
}

export async function fetchCandidateNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await supabaseBrowser().from("candidates").select("id,name").in("id", ids);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.id] = row.name ?? row.id;
  return map;
}
