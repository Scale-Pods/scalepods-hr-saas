import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  Megaphone,
  Plus,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { browserClient } from "../lib/supabase";
import { callWebhook, N8nError } from "../lib/n8n";
import {
  reportsSchema,
  type Reports,
  buildFunnelRows,
  summarizeTimeToHire,
  sourceRows as collectSourceRows,
  TIER_LIMITS,
  dailySeries,
  formatDateTime,
  timeAgo,
} from "@scalepods/core";
import { ZodError } from "zod";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { UsageBar } from "../components/ui/ProgressBar";
import { FunnelChart, type FunnelRow } from "../components/FunnelChart";
import { CardGrid } from "../components/CardGrid";
import { MetricCard } from "../components/MetricCard";
import { EmptyState } from "../components/EmptyState";
import { UnavailableCard } from "../components/UpgradeStrip";
import { showErrorToast } from "../hooks/useToast";
import { cn } from "../lib/cn";

const USAGE_DEFS: { key: "ai_interview" | "ai_voice_screening" | "scheduled_round"; label: string }[] = [
  { key: "ai_interview", label: "AI interviews" },
  { key: "ai_voice_screening", label: "Voice screens" },
  { key: "scheduled_round", label: "Scheduled rounds" },
];

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function roundTypeLabel(t: string | null): string {
  if (t === "ai_interview") return "AI";
  if (t === "human_interview") return "Human";
  if (t === "assignment") return "Assignment";
  return t ?? "Round";
}

function stageMeta(stage: string) {
  const s = stage.toLowerCase();
  if (s.includes("reject") || s.includes("fail"))
    return { icon: XCircle, tone: "text-destructive" };
  if (s.includes("offer") || s.includes("pass"))
    return { icon: CheckCircle2, tone: "text-success" };
  return { icon: ArrowUpRight, tone: "text-chart-1" };
}

interface InterviewRow {
  id: string;
  candidate_id: string;
  round_type: string;
  scheduled_at: string | null;
  status: string;
}

interface LedgerRow {
  id: string;
  candidate_id: string;
  stage: string;
  score: number | null;
  source: string;
  override_of: string | null;
  decided_at: string;
}

export function Dashboard() {
  const { user, account } = useAuth();
  const supabase = browserClient();
  const navigate = useNavigate();

  const [kpis, setKpis] = useState<{
    activeCampaigns: number | null;
    candidateCount: number | null;
    candidateCreatedAt: string[];
    interviewsThisWeek: number | null;
    interviewsPriorWeek: number | null;
  }>({ activeCampaigns: null, candidateCount: null, candidateCreatedAt: [], interviewsThisWeek: null, interviewsPriorWeek: null });
  const [upcoming, setUpcoming] = useState<InterviewRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Reports | null>(null);
  const [reportsState, setReportsState] = useState<"loading" | "ok" | "unavailable">("loading");

  useEffect(() => {
    let mounted = true;
    const now = new Date();
    const wkStart = startOfDay(new Date(now.getTime() - 6 * 86_400_000));
    const wkEnd = new Date(now);
    const prevStart = startOfDay(new Date(wkStart.getTime() - 86_400_000));
    const prevEnd = new Date(wkStart);

    (async () => {
      const [campCount, candCount, candDates, wkCount, prevCount] = await Promise.all([
        supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "on"),
        supabase.from("candidates").select("id", { count: "exact", head: true }),
        supabase.from("candidates").select("created_at").limit(1000),
        supabase
          .from("round_instances")
          .select("id", { count: "exact", head: true })
          .gte("scheduled_at", wkStart.toISOString())
          .lte("scheduled_at", wkEnd.toISOString()),
        supabase
          .from("round_instances")
          .select("id", { count: "exact", head: true })
          .gte("scheduled_at", prevStart.toISOString())
          .lt("scheduled_at", prevEnd.toISOString()),
      ]);
      if (!mounted) return;
      setKpis({
        activeCampaigns: campCount.error ? null : campCount.count ?? 0,
        candidateCount: candCount.error ? null : candCount.count ?? 0,
        candidateCreatedAt: (candDates.data ?? [])
          .map((r) => r.created_at)
          .filter(Boolean),
        interviewsThisWeek: wkCount.error ? null : wkCount.count ?? 0,
        interviewsPriorWeek: prevCount.error ? null : prevCount.count ?? 0,
      });
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [periodQuery, ledgerQuery] = await Promise.all([
        supabase
          .from("round_instances")
          .select("id,candidate_id,round_type,scheduled_at,status")
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(5),
        supabase
          .from("decision_ledger")
          .select("id,candidate_id,stage,score,source,override_of,decided_at")
          .order("decided_at", { ascending: false })
          .limit(200),
      ]);
      if (!mounted) return;
      setUpcoming((periodQuery.data ?? []) as InterviewRow[]);
      setLedger((ledgerQuery.data ?? []) as LedgerRow[]);
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    let mounted = true;
    const ids = Array.from(
      new Set([...upcoming.map((r) => r.candidate_id), ...ledger.map((r) => r.candidate_id)])
    );
    if (ids.length === 0) return;
    supabase
      .from("candidates")
      .select("id,name")
      .in("id", ids)
      .then(({ data }) => {
        if (!mounted) return;
        const map: Record<string, string> = {};
        for (const row of data ?? []) map[row.id] = row.name ?? row.id;
        setNames(map);
      });
    return () => {
      mounted = false;
    };
  }, [upcoming, ledger, supabase]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setReportsState("loading");
    const loadReports = async () => {
      try {
        const res = await callWebhook<unknown>("reports", {
          method: "GET",
          query: { account_id: user.id },
          accessToken: (await supabase.auth.getSession()).data.session?.access_token,
        });
        if (cancelled) return;
        const parsed = reportsSchema.parse(res);
        setReports(parsed);
        setReportsState("ok");
      } catch (err) {
        if (cancelled) return;
        // The reports widget degrades gracefully: a missing/broken workflow
        // (network, non-2xx) or an unexpected payload shape (Zod) shows the
        // "Usage & reporting unavailable" card instead of a generic toast.
        setReportsState("unavailable");
        if (!(err instanceof N8nError) && !(err instanceof ZodError)) showErrorToast(err);
      }
    };
    void loadReports();
    return () => {
      cancelled = true;
    };
  }, [user?.id, supabase]);

  const tierLabel = account ? TIER_LIMITS[account.tier]?.label ?? account.tier : "…";
  const usage = reports?.usage;

  const offersCount = useMemo(
    () => ledger.filter((r) => r.stage.toLowerCase().includes("offer")).length,
    [ledger]
  );

  const reportedFunnel = reportsState === "ok" && reports ? buildFunnelRows(reports) : null;
  const useReportedFunnel = !!reportedFunnel && reportedFunnel.some((r) => r.entered > 0);
  const funnelRows: FunnelRow[] = useReportedFunnel
    ? reportedFunnel!
    : [
        { stage: "Candidates", entered: kpis.candidateCount ?? 0 },
        { stage: "Offers", entered: offersCount },
      ];
  const funnelSubtitle = useReportedFunnel
    ? "Intake → signed offer"
    : "From your database while the funnel report is warming up";

  const timeToHire = reportsState === "ok" && reports ? summarizeTimeToHire(reports) : null;
  const sources = reportsState === "ok" && reports ? collectSourceRows(reports) : [];

  const trend14 = useMemo(
    () => dailySeries(kpis.candidateCreatedAt, 14),
    [kpis.candidateCreatedAt]
  );
  const pipelineTrend = trend14.slice(7);
  const priorTotal = trend14.slice(0, 7).reduce((a, b) => a + b, 0);
  const currentTotal = pipelineTrend.reduce((a, b) => a + b, 0);
  const pipelineDelta =
    kpis.candidateCount == null ? null : currentTotal - priorTotal;

  const interviewsDelta =
    kpis.interviewsThisWeek == null || kpis.interviewsPriorWeek == null
      ? null
      : kpis.interviewsThisWeek - kpis.interviewsPriorWeek;

  const aiUsage = usage?.ai_interview;
  const aiGranted =
    aiUsage && "granted" in aiUsage && aiUsage.granted != null
      ? aiUsage.granted
      : TIER_LIMITS[account?.tier ?? "free"].aiInterview;
  const aiUsed = aiUsage?.used ?? 0;
  const creditsRemaining = aiGranted != null ? Math.max(0, aiGranted - aiUsed) : null;
  const creditsLow =
    creditsRemaining != null &&
    aiGranted != null &&
    (aiGranted - creditsRemaining) / Math.max(1, aiGranted) > 0.9;
  const creditsWarning = creditsLow
    ? "90% of your AI interview allowance is used — upgrade to extend it."
    : undefined;

  const needsReview = useMemo(() => {
    const seen = new Set<string>();
    const rows: LedgerRow[] = [];
    for (const row of ledger) {
      if (row.override_of || row.source !== "workflow") continue;
      if (seen.has(row.candidate_id)) continue;
      seen.add(row.candidate_id);
      rows.push(row);
      if (rows.length === 5) break;
    }
    return rows;
  }, [ledger]);

  const activity = ledger.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tierLabel} plan · last billing window{" "}
            {account?.billing_anchor_date ?? "—"}
          </p>
        </div>
        <Link to="/campaigns/new">
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            New campaign
          </Button>
        </Link>
      </div>

      <CardGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <MetricCard
          label="Active campaigns"
          value={kpis.activeCampaigns ?? "—"}
          loading={kpis.activeCampaigns === null}
          icon={<FolderKanban className="h-4 w-4" aria-hidden />}
          description="Recruiting drives that are currently live and accepting candidates."
          onClick={() => navigate("/campaigns")}
        />
        <MetricCard
          label="Candidates in pipeline"
          value={kpis.candidateCount ?? "—"}
          loading={kpis.candidateCount === null}
          delta={pipelineDelta}
          trend={pipelineTrend}
          icon={<Users className="h-4 w-4" aria-hidden />}
          sub={`${pipelineTrend.reduce((a, b) => a + b, 0)} added in the last 7 days`}
          description="Total candidates enrolled across your campaigns. The sparkline shows how many were added per day over the past two weeks."
        />
        <MetricCard
          label="Interviews this week"
          value={kpis.interviewsThisWeek ?? "—"}
          loading={kpis.interviewsThisWeek === null}
          delta={interviewsDelta}
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          sub={
            kpis.interviewsThisWeek == null
              ? undefined
              : `${kpis.interviewsThisWeek} scheduled${interviewsDelta != null ? ` · ${interviewsDelta > 0 ? "+" : ""}${interviewsDelta} vs last week` : ""}`
          }
          description="Interviews scheduled in the last 7 days, compared with the prior week."
        />
        <MetricCard
          label="AI credits remaining"
          value={creditsRemaining ?? "—"}
          loading={creditsRemaining === null}
          icon={<Megaphone className="h-4 w-4" aria-hidden />}
          sub={
            creditsWarning ? (
              <span className="text-warning">{creditsWarning}</span>
            ) : aiGranted != null ? (
              `${aiUsed} of ${aiGranted} used this month`
            ) : undefined
          }
          description="How many AI interview credits you have left for this billing month before hitting your tier limit."
        />
      </CardGrid>

      {reportsState === "loading" && (
        <UnavailableCard title="Usage & reporting" note="Loading from the reporting workflow…" />
      )}
      {reportsState === "unavailable" && (
        <Card>
          <CardHeader
            title="Usage & reporting"
            subtitle="The reports endpoint did not respond - is workflow 11 deployed?"
          />
          <p className="text-sm text-muted-foreground">
            Campaign and candidate counts above still load from your database. Pipeline and
            usage bars will appear once{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              GET /webhook/reports
            </code>{" "}
            is live.
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {reportsState === "ok" && (
            <Card>
              <CardHeader title="Usage" subtitle="Used vs. granted this month · red past 90%" />
              <div className="space-y-4">
                {USAGE_DEFS.map((u) => {
                  const slice = usage?.[u.key];
                  const used = slice?.used ?? 0;
                  const here = account?.tier ?? "free";
                  const tierCap =
                    u.key === "ai_interview"
                      ? TIER_LIMITS[here].aiInterview
                      : u.key === "ai_voice_screening"
                        ? TIER_LIMITS[here].aiVoiceScreening
                        : TIER_LIMITS[here].scheduledRound;
                  const granted =
                    slice && "granted" in slice
                      ? (slice as { granted: number | null }).granted
                      : undefined;
                  const shownGrant = granted ?? tierCap ?? null;
                  return (
                    <UsageBar
                      key={u.key}
                      label={u.label}
                      used={used}
                      granted={shownGrant}
                      sub={
                        granted === undefined && tierCap != null
                          ? `${here.toUpperCase()} allowance`
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Candidate funnel" subtitle={funnelSubtitle} />
            <FunnelChart rows={funnelRows} />
          </Card>

          <Card>
            <CardHeader title="Recent activity" subtitle="Latest pipeline decisions" />
            {activity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                hint="Decisions from resume screenings, interviews and manual overrides will show up here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((row) => {
                  const meta = stageMeta(row.stage);
                  const Icon = meta.icon;
                  return (
                    <li key={row.id} className="flex items-start gap-3 py-2.5">
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted",
                          meta.tone
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/candidates/${row.candidate_id}`}
                          className="text-sm font-medium text-foreground hover:underline"
                        >
                          {names[row.candidate_id] ?? "Candidate"}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.stage}
                          {row.score != null ? ` · scored ${row.score}` : ""}
                          {row.source === "manual" ? " · manual override" : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {timeAgo(row.decided_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Source effectiveness"
              subtitle="Which channels start conversations that convert"
            />
            {sources.length > 0 ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {sources.map((row) => (
                    <tr key={row.source}>
                      <td className="py-2 pr-3 text-sm font-medium text-foreground">{row.source}</td>
                      <td className="py-2 pr-3 text-right text-xs tabular-nums text-muted-foreground">
                        {row.conversations} chats
                      </td>
                      <td className="py-2 pr-3 text-right text-xs tabular-nums text-muted-foreground">
                        {row.offers} offers
                      </td>
                      <td className="py-2 text-right text-xs font-medium tabular-nums text-foreground">
                        {row.rate != null ? `${Math.round(row.rate)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState
                title="No source breakdown yet"
                hint="Source effectiveness per channel comes from GET /webhook/reports."
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Time to hire" subtitle="Offer-accepted lag across recent hires" />
            {timeToHire ? (
              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-semibold tabular-nums text-foreground">
                      {timeToHire.median_days ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">median days</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>avg {timeToHire.average_days ?? "—"} days</p>
                    <p>{timeToHire.hires} hires</p>
                    {timeToHire.outlier_entries > 0 && (
                      <p>{timeToHire.outlier_entries} entries beyond ±2σ excluded</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No time-to-hire data yet"
                hint="Median and average days to offer come from GET /webhook/reports."
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Upcoming interviews" subtitle="Next scheduled rounds" />
            {upcoming.length === 0 ? (
              <EmptyState
                title="Nothing scheduled"
                hint="Booked rounds will appear here as candidates pick interview slots."
              />
            ) : (
              <ul className="space-y-3">
                {upcoming.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {names[row.candidate_id] ?? "Candidate"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(row.scheduled_at)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                      {roundTypeLabel(row.round_type)}
                      {" · "}
                      {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Needs your review" subtitle="Latest workflow decisions" />
            {needsReview.length === 0 ? (
              <EmptyState
                title="All caught up"
                hint="Recent automated decisions to review will appear here."
              />
            ) : (
              <ul className="space-y-2">
                {needsReview.map((row) => (
                  <li key={row.id}>
                    <Link
                      to={`/candidates/${row.candidate_id}`}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <span className="truncate font-medium text-foreground">
                        {names[row.candidate_id] ?? "Candidate"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {row.stage}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}