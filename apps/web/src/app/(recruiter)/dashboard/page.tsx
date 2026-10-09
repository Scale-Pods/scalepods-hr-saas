"use client";

import {
  buildFunnelRows,
  dailySeries,
  formatDateTime,
  TIER_LIMITS,
  timeAgo,
} from "@scalepods/core";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Brain,
  Briefcase,
  Clock,
  GitBranch,
  MapPin,
  Medal,
  Percent,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ReportsNotice } from "@/components/dashboard/ReportsNotice";
import { UsageBars } from "@/components/dashboard/UsageBars";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/features/account/hooks";
import { useSession } from "@/features/auth/hooks";
import {
  useCandidateNames,
  useDashboardKpis,
  useLedger,
  useReports,
  useUpcomingInterviews,
} from "@/features/dashboard/hooks";
import { reconcileUsage } from "@/features/dashboard/usage";
import { cn } from "@/lib/utils";

/* ── helpers ── */
function greeting(email?: string | null) {
  const h = new Date().getHours();
  const prefix = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const name = email?.split("@")[0] ?? "there";
  return { prefix, name: name.charAt(0).toUpperCase() + name.slice(1) };
}

function stageMeta(stage: string) {
  const s = stage.toLowerCase();
  if (s.includes("reject") || s.includes("fail")) return { color: "#ef4444", label: "Rejected" };
  if (s.includes("offer")) return { color: "#10b981", label: "Offer" };
  if (s.includes("pass")) return { color: "#2563eb", label: "Passed" };
  return { color: "#f59e0b", label: "In progress" };
}

/* ── sub-components ── */
function LiveDot({ color = "#10b981" }: { color?: string }) {
  return (
    <span
      className="inline-block h-[5px] w-[5px] animate-pulse rounded-full"
      style={{ background: color }}
    />
  );
}

function KpiTrendBar({ heights, color }: { heights: number[]; color?: string }) {
  return (
    <div className="flex h-[32px] items-end gap-1.5 mt-3 pt-1">
      {heights.map((h, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: positional trend bars
          key={i}
          className="flex-1 rounded-sm transition-all duration-500 hover:opacity-80"
          style={{
            height: `${Math.max(12, Math.min(100, h))}%`,
            background: color || "rgba(37,99,235,0.18)",
          }}
        />
      ))}
    </div>
  );
}

function KpiCard({
  icon,
  iconBg,
  label,
  value,
  badge,
  badgeClass,
  heights,
  barColor,
  loading,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: React.ReactNode;
  badge?: React.ReactNode;
  badgeClass?: string;
  heights: number[];
  barColor?: string;
  loading?: boolean;
}) {
  return (
    <div className="ref-kpi-card group">
      <div className="ref-kpi-top">
        <div className="ref-kpi-icon" style={{ background: iconBg }}>
          {icon}
        </div>
        {badge && <span className={cn("ref-kpi-badge", badgeClass)}>{badge}</span>}
      </div>
      {loading ? (
        <div className="mt-2 space-y-2">
          <div className="h-8 w-20 animate-pulse rounded-lg bg-fill-tertiary" />
          <div className="h-3 w-24 animate-pulse rounded bg-fill-tertiary" />
        </div>
      ) : (
        <>
          <div className="ref-kpi-value">{value}</div>
          <div className="ref-kpi-label">{label}</div>
        </>
      )}
      <KpiTrendBar heights={heights} color={barColor} />
    </div>
  );
}

function SectionCard({
  icon,
  iconColor,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="ref-card">
      <div className="ref-card-header">
        <div className="ref-card-header-left">
          <span style={{ color: iconColor }}>{icon}</span>
          <span>{title}</span>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

function LivePill() {
  return (
    <span className="ref-live-pill">
      <LiveDot />
      Live
    </span>
  );
}

export default function DashboardPage() {
  const { account } = useAccount();
  const { data: session } = useSession();
  const tier = account?.tier ?? "free";
  const tierLabel = TIER_LIMITS[tier]?.label ?? tier;

  const kpis = useDashboardKpis();
  const reports = useReports(account?.id);
  const upcoming = useUpcomingInterviews();
  const ledger = useLedger();

  const hasCampaigns = (kpis.data?.totalCampaigns ?? 0) > 0;

  const { prefix, name } = greeting(session?.user?.email);
  const ledgerRows = useMemo(() => ledger.data ?? [], [ledger.data]);
  const upcomingRows = upcoming.data ?? [];

  const names = useCandidateNames([
    ...upcomingRows.map((r) => r.candidate_id),
    ...ledgerRows.map((r) => r.candidate_id),
  ]);
  const nameMap = names.data ?? {};

  /* derived stats */
  const offersCount = useMemo(
    () =>
      ledgerRows.filter(
        (r) => r.stage.toLowerCase().includes("offer") || r.stage.toLowerCase().includes("hired"),
      ).length,
    [ledgerRows],
  );

  const avgScore = useMemo(() => {
    if (!hasCampaigns) return null;
    const scored = ledgerRows.filter((r) => r.score != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length);
  }, [hasCampaigns, ledgerRows]);

  const scoreDelta = useMemo(() => {
    if (!hasCampaigns) return 0;
    const scored = ledgerRows.filter((r) => r.score != null).map((r) => Number(r.score));
    if (scored.length < 2) return 0;
    const mid = Math.floor(scored.length / 2);
    const recent = scored.slice(0, mid);
    const older = scored.slice(mid);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    return Math.round((recentAvg - olderAvg) * 10) / 10;
  }, [hasCampaigns, ledgerRows]);

  const decisionQuality = useMemo(() => {
    if (!hasCampaigns || ledgerRows.length === 0) return 0;
    const withSignal = ledgerRows.filter((r) => r.score != null && Number(r.score) > 0).length;
    return Math.round((withSignal / ledgerRows.length) * 100);
  }, [hasCampaigns, ledgerRows]);

  const trend14 = useMemo(
    () => dailySeries(kpis.data?.candidateCreatedAt ?? [], 14),
    [kpis.data?.candidateCreatedAt],
  );
  const currentTotal = trend14.slice(7).reduce((a, b) => a + b, 0);
  const priorTotal = trend14.slice(0, 7).reduce((a, b) => a + b, 0);
  const pipelineDeltaPct =
    priorTotal > 0
      ? Math.round(((currentTotal - priorTotal) / priorTotal) * 100)
      : currentTotal > 0
        ? 100
        : 0;

  /* dynamic KPI background bar graph heights (8 bars each, synchronized from API) */
  const candidateHeights = kpis.data?.kpiHeights?.candidates ?? [20, 25, 30, 45, 55, 70, 85, 95];
  const scoreHeights = kpis.data?.kpiHeights?.score ?? [50, 52, 60, 75, 80, 70, 85, 90];
  const progressionHeights = kpis.data?.kpiHeights?.hired ?? [20, 25, 30, 40, 45, 60, 75, 90];
  const qualityHeights = kpis.data?.kpiHeights?.quality ?? [70, 75, 80, 85, 90, 85, 95, 90];

  /* pipeline funnel — 100% real database counts */
  const reportedFunnel = reports.data ? buildFunnelRows(reports.data) : null;
  const pipelineStages = kpis.data?.pipelineStages;
  const funnelRows = useMemo(() => {
    if (!hasCampaigns) {
      return [
        { stage: "Screening", entered: 0 },
        { stage: "Round 1 Interview", entered: 0 },
        { stage: "Round 2 Interview", entered: 0 },
        { stage: "Round 3 / Assignment", entered: 0 },
        { stage: "Hired / Offer", entered: 0 },
      ];
    }
    if (reportedFunnel?.some((r) => r.entered > 0)) return reportedFunnel;
    const totalCand = kpis.data?.candidateCount ?? 0;
    return [
      { stage: "Screening", entered: totalCand },
      { stage: "Round 1 Interview", entered: pipelineStages?.round1 ?? 0 },
      { stage: "Round 2 Interview", entered: pipelineStages?.round2 ?? 0 },
      { stage: "Round 3 / Assignment", entered: pipelineStages?.round3 ?? 0 },
      { stage: "Hired / Offer", entered: pipelineStages?.hired ?? offersCount },
    ];
  }, [hasCampaigns, reportedFunnel, kpis.data?.candidateCount, pipelineStages, offersCount]);

  const funnelMax = Math.max(...funnelRows.map((r) => r.entered), 1);
  const funnelColors = ["#2563eb", "#06b6d4", "#2563eb", "#0ea5e9", "#10b981"];

  /* conversion rates between stages */
  const conversionRates = funnelRows
    .slice(1)
    .map((r, i) =>
      funnelRows[i].entered > 0 ? Math.round((r.entered / funnelRows[i].entered) * 100) : 0,
    );
  const overallConvRate =
    funnelRows[0]?.entered > 0
      ? Math.round(((pipelineStages?.hired ?? offersCount) / funnelRows[0].entered) * 100)
      : 0;
  const avgConversionRate =
    conversionRates.filter((r) => r > 0).length > 0
      ? Math.round(
          conversionRates.filter((r) => r > 0).reduce((a, b) => a + b, 0) /
            conversionRates.filter((r) => r > 0).length,
        )
      : overallConvRate;

  const convCircumference = 2 * Math.PI * 48;
  const convDash = (avgConversionRate / 100) * convCircumference;

  /* real candidate location distribution */
  const locationRows = useMemo(() => {
    return kpis.data?.cityDistribution ?? [];
  }, [kpis.data?.cityDistribution]);

  const distMax = Math.max(...locationRows.map((c) => c.count), 1);

  /* dynamic AI intelligence feed from real pipeline data */
  const topCandidate = useMemo(() => {
    const scored = [...ledgerRows]
      .filter((r) => r.score != null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return scored[0] ?? null;
  }, [ledgerRows]);

  const topCandidateName = topCandidate
    ? (nameMap[topCandidate.candidate_id] ?? "Top Candidate")
    : null;

  const aiInsights = useMemo(() => {
    if (!hasCampaigns) {
      return [
        {
          icon: <Brain className="h-4 w-4" />,
          bg: "rgba(37,99,235,0.1)",
          color: "var(--blue)",
          title: "No active campaigns",
          desc: "Create a campaign and upload candidate resumes to activate AI screening, scoring, and automated pipeline intelligence.",
          action: "Action: Create a campaign",
        },
      ];
    }
    return [
      {
        icon: <Star className="h-4 w-4" />,
        bg: "rgba(6,182,212,0.1)",
        color: "var(--cyan)",
        title: topCandidate ? `Top performer: ${topCandidateName}` : "Top talent evaluation",
        desc: topCandidate
          ? `Achieved ${topCandidate.score}% in ${topCandidate.stage} — high role alignment`
          : `Pipeline mean score of ${avgScore ?? 0}% across active rounds`,
        action: topCandidate
          ? "Action: Fast-track to interview panel"
          : "Status: Evaluation active",
      },
      {
        icon: <TrendingUp className="h-4 w-4" />,
        bg: "rgba(37,99,235,0.1)",
        color: "var(--blue)",
        title: `Pipeline growth: ${pipelineDeltaPct >= 0 ? "+" : ""}${pipelineDeltaPct}% this cycle`,
        desc: `${currentTotal} candidate${currentTotal === 1 ? "" : "s"} added in past 7 days across ${kpis.data?.activeCampaigns ?? 0} active campaigns`,
        action: "Insight: Ingestion velocity steady",
      },
      {
        icon: <AlertTriangle className="h-4 w-4" />,
        bg:
          (kpis.data?.pendingRoundsCount ?? 0) > 0
            ? "rgba(245,158,11,0.1)"
            : "rgba(16,185,129,0.1)",
        color:
          (kpis.data?.pendingRoundsCount ?? 0) > 0 ? "var(--amber, #f59e0b)" : "var(--emerald)",
        title:
          (kpis.data?.pendingRoundsCount ?? 0) > 0
            ? `Action on ${kpis.data?.pendingRoundsCount} pending round${(kpis.data?.pendingRoundsCount ?? 0) === 1 ? "" : "s"}`
            : "Interview rounds on schedule",
        desc:
          (kpis.data?.pendingRoundsCount ?? 0) > 0
            ? `${kpis.data?.pendingRoundsCount} round instances awaiting scheduling or review`
            : "No candidate bottlenecks detected in active stages",
        action:
          (kpis.data?.pendingRoundsCount ?? 0) > 0
            ? "Action: Review candidate scheduling"
            : "Status: Pipeline healthy",
      },
      {
        icon: <Users className="h-4 w-4" />,
        bg: "rgba(16,185,129,0.1)",
        color: "var(--emerald)",
        title: `Evaluation signal at ${decisionQuality}%`,
        desc: `${ledgerRows.length} total evaluations recorded with ${decisionQuality}% actionable signal rate`,
        action: "Insight: AI scoring models calibrated",
      },
    ];
  }, [
    hasCampaigns,
    topCandidate,
    topCandidateName,
    avgScore,
    pipelineDeltaPct,
    currentTotal,
    kpis.data?.activeCampaigns,
    kpis.data?.pendingRoundsCount,
    decisionQuality,
    ledgerRows.length,
  ]);

  /* activity */
  const activityRows = ledgerRows.slice(0, 5);

  /* usage */
  const reconciled = reconcileUsage(reports.data?.usage, tier);

  /* trend chart data */
  const trendData = trend14.map((v, i) => ({ i, v }));

  return (
    <div className="animate-glass-fade space-y-6">
      {/* ── Hero Section ── */}
      <div className="ref-dash-hero">
        {/* Left: greeting + actions */}
        <div className="ref-hero-greeting">
          {/* Live chip */}
          {hasCampaigns ? (
            <div className="ref-hero-chip">
              <LiveDot />
              <span>AI Analytics Active</span>
              <span className="ref-chip-divider" />
              <span className="text-muted-foreground">
                {kpis.data?.activeCampaigns ?? 0} active campaigns
              </span>
            </div>
          ) : (
            <div className="ref-hero-chip">
              <span className="inline-block h-[5px] w-[5px] rounded-full bg-muted-foreground/60" />
              <span>No Active Campaigns</span>
              <span className="ref-chip-divider" />
              <span className="text-muted-foreground">0 campaigns</span>
            </div>
          )}

          <h1 className="ref-hero-title">
            {prefix},{" "}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 bg-clip-text text-transparent dark:from-blue-400 dark:via-indigo-300 dark:to-cyan-400 font-extrabold">
              {name}
            </span>
          </h1>
          <p className="ref-hero-sub">
            {hasCampaigns ? (
              <>
                Your hiring intelligence is live.{" "}
                <strong>{kpis.data?.candidateCount?.toLocaleString() ?? 0}</strong> candidates
                flowing through the pipeline with a <strong>{avgScore ?? 0}</strong> mean score.
              </>
            ) : (
              <>
                You have no active campaigns. Create a campaign to start screening candidates and
                track live hiring metrics.
              </>
            )}
          </p>

          <div className="flex items-center gap-3">
            <Button
              asChild
              className="rounded-full gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-md shadow-blue-500/20 transition-all hover:shadow-lg hover:shadow-blue-500/30"
            >
              <Link href="/campaigns?tab=new">
                <Sparkles className="h-4 w-4" />
                Create Campaign
              </Link>
            </Button>
            <Button
              variant="outline"
              className="rounded-full gap-2 px-5 py-2.5 font-medium border-border/80 hover:bg-accent transition-all"
              onClick={() => {
                document
                  .querySelector(".ref-analytics-grid")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <BarChart2 className="h-4 w-4" />
              View Report
            </Button>
            <Link
              href="/guide/resume-scoring"
              className="inline-flex items-center gap-2 rounded-full border border-[#2f6bff]/40 bg-[#2f6bff]/10 px-5 py-2.5 text-sm font-semibold text-[#60a5fa] hover:bg-[#2f6bff]/20 hover:border-[#2f6bff]/60 hover:text-white transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]/50"
            >
              <Brain className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>How we score</span>
            </Link>
          </div>
        </div>

        {/* Right: chart + mini metrics */}
        <div className="ref-hero-visual">
          {/* Trend chart card */}
          <div className="ref-hero-chart-bg">
            <ResponsiveContainer width="100%" height={85}>
              <AreaChart data={trendData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="hero-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#hero-grad)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="ref-hero-chart-label">
              <span className="ref-chart-label-value">
                {pipelineDeltaPct >= 0 ? "+" : ""}
                {pipelineDeltaPct}%
              </span>
              <span className="ref-chart-label-text">pipeline growth</span>
            </div>
          </div>

          {/* Mini metric cards */}
          <div className="ref-hero-metrics">
            <div className="ref-hero-metric">
              <span
                className="ref-hero-metric-icon"
                style={{ background: "rgba(37,99,235,0.1)", color: "var(--blue)" }}
              >
                <Users className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <div className="ref-hero-metric-value">
                  {kpis.data?.candidateCount?.toLocaleString() ?? "0"}
                </div>
                <div className="ref-hero-metric-label">Total Candidates</div>
              </div>
              <span className="ref-metric-change up">
                {pipelineDeltaPct >= 0 ? "+" : ""}
                {pipelineDeltaPct}%
              </span>
            </div>
            <div className="ref-hero-metric">
              <span
                className="ref-hero-metric-icon"
                style={{ background: "rgba(6,182,212,0.1)", color: "var(--cyan)" }}
              >
                <Star className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <div className="ref-hero-metric-value">{avgScore ?? "—"}</div>
                <div className="ref-hero-metric-label">Avg Score</div>
              </div>
              <span className={cn("ref-metric-change", scoreDelta >= 0 ? "up" : "down")}>
                {scoreDelta >= 0 ? "+" : ""}
                {scoreDelta}
              </span>
            </div>
            <div className="ref-hero-metric">
              <span
                className="ref-hero-metric-icon"
                style={{ background: "rgba(59,130,246,0.1)", color: "var(--blue)" }}
              >
                <Briefcase className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <div className="ref-hero-metric-value">{kpis.data?.activeCampaigns ?? 0}</div>
                <div className="ref-hero-metric-label">Active Campaigns</div>
              </div>
              <span className="ref-metric-change up">
                {hasCampaigns
                  ? `${kpis.data?.activeCampaigns}/${kpis.data?.totalCampaigns}`
                  : "0/0"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div>
        <div className="ref-section-header">
          <div className="ref-section-title-group">
            <h2 className="ref-section-title">Key Metrics</h2>
            <span className="ref-section-badge">{hasCampaigns ? "Live" : "Inactive"}</span>
          </div>
          <button type="button" className="ref-btn-ghost-sm" onClick={() => kpis.refetch()}>
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>

        <div className="ref-kpi-grid">
          <KpiCard
            icon={<Users className="h-[18px] w-[18px]" />}
            iconBg="rgba(37,99,235,0.1)"
            label="Active Candidates"
            value={kpis.data?.candidateCount?.toLocaleString() ?? "0"}
            badge={`${pipelineDeltaPct >= 0 ? "+" : ""}${pipelineDeltaPct}%`}
            badgeClass="up"
            heights={candidateHeights}
            barColor="rgba(37,99,235,0.22)"
            loading={kpis.isPending}
          />
          <KpiCard
            icon={<Star className="h-[18px] w-[18px]" style={{ color: "var(--cyan)" }} />}
            iconBg="rgba(6,182,212,0.1)"
            label="Average Score"
            value={avgScore != null ? avgScore : "—"}
            badge={avgScore != null ? `${scoreDelta >= 0 ? "+" : ""}${scoreDelta}` : undefined}
            badgeClass={scoreDelta >= 0 ? "up" : ""}
            heights={scoreHeights}
            barColor="rgba(6,182,212,0.22)"
            loading={ledger.isPending}
          />
          <KpiCard
            icon={<UserCheck className="h-[18px] w-[18px]" style={{ color: "var(--emerald)" }} />}
            iconBg="rgba(16,185,129,0.1)"
            label="Hired This Quarter"
            value={offersCount}
            badge={offersCount > 0 ? `+${offersCount}` : "0% conv"}
            badgeClass={offersCount > 0 ? "up" : ""}
            heights={progressionHeights}
            barColor="rgba(16,185,129,0.22)"
            loading={ledger.isPending}
          />
          <KpiCard
            icon={<BarChart2 className="h-[18px] w-[18px]" style={{ color: "var(--blue)" }} />}
            iconBg="rgba(59,130,246,0.1)"
            label="Decision Quality"
            value={hasCampaigns && decisionQuality > 0 ? `${decisionQuality}%` : "—"}
            badge={hasCampaigns && decisionQuality > 0 ? `${decisionQuality}% Signal` : undefined}
            badgeClass="up"
            heights={qualityHeights}
            barColor="rgba(99,102,241,0.22)"
            loading={ledger.isPending}
          />
        </div>
      </div>

      {/* ── Analytics Grid ── */}
      <div className="ref-analytics-grid">
        {/* Pipeline Overview */}
        <SectionCard
          icon={<GitBranch className="h-[17px] w-[17px]" />}
          iconColor="var(--blue)"
          title="Pipeline Overview"
          badge={hasCampaigns ? <LivePill /> : undefined}
        >
          {!hasCampaigns ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No candidate pipeline data. Create a campaign to start screening candidates.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {funnelRows.map((row, i) => {
                const pct = funnelMax > 0 ? (row.entered / funnelMax) * 100 : 0;
                const color = funnelColors[i % funnelColors.length];
                const colorLight =
                  color === "#2563eb" ? "#3b82f6" : color === "#06b6d4" ? "#22d3ee" : color;
                return (
                  <div key={row.stage} className="ref-pipeline-node">
                    <div className="ref-pipeline-dot" style={{ background: color }} />
                    <div className="ref-pipeline-content">
                      <div className="ref-pipeline-label">
                        <span>{row.stage}</span>
                        <span className="font-semibold text-foreground">
                          {row.entered.toLocaleString()}
                        </span>
                      </div>
                      <div className="ref-pipeline-bar">
                        <div
                          className="ref-pipeline-fill"
                          style={{
                            width: `${Math.max(2, pct)}%`,
                            background: `linear-gradient(90deg,${color},${colorLight})`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Conversion Rate */}
        <SectionCard
          icon={<Percent className="h-[17px] w-[17px]" />}
          iconColor="var(--cyan)"
          title="Conversion Rate"
        >
          {!hasCampaigns ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No conversion data available yet.
            </div>
          ) : (
            <div className="ref-conversion-visual">
              <div className="ref-conversion-ring">
                <svg
                  width="120"
                  height="120"
                  viewBox="0 0 120 120"
                  aria-label={`Conversion rate: ${avgConversionRate}%`}
                >
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    fill="none"
                    stroke="var(--fill-tertiary)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    fill="none"
                    stroke="url(#conv-grad)"
                    strokeWidth="8"
                    strokeDasharray={`${convDash} ${convCircumference}`}
                    strokeDashoffset="0"
                    transform="rotate(-90 60 60)"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="conv-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                  <text
                    x="60"
                    y="56"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="22"
                    fontWeight="700"
                    fontFamily="Inter"
                  >
                    {avgConversionRate}
                  </text>
                  <text
                    x="60"
                    y="72"
                    textAnchor="middle"
                    fill="var(--label-tertiary)"
                    fontSize="10"
                    fontWeight="500"
                    fontFamily="Inter"
                  >
                    percent
                  </text>
                </svg>
              </div>
              <div className="ref-conversion-stats">
                {funnelRows.slice(1).map((row, i) => {
                  const rate = conversionRates[i] ?? 0;
                  const color = funnelColors[i % funnelColors.length];
                  return (
                    <div key={row.stage} className="ref-conv-stat">
                      <span className="ref-conv-dot" style={{ background: color }} />
                      <span className="flex-1 text-xs text-muted-foreground">
                        {funnelRows[i].stage} → {row.stage}
                      </span>
                      <span className="font-semibold text-xs text-foreground">{rate}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Candidate Location Distribution Card */}
        <SectionCard
          icon={<MapPin className="h-[17px] w-[17px]" />}
          iconColor="var(--emerald)"
          title="Candidate Locations"
          badge={
            <span className="ref-widget-badge">
              <LiveDot color="var(--emerald)" />
              {locationRows.length} {locationRows.length === 1 ? "City" : "Cities"}
            </span>
          }
        >
          <div className="flex flex-col gap-3">
            {locationRows.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No candidate location data available.
              </div>
            ) : (
              locationRows.map((item) => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: item.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span
                        className="text-xs text-muted-foreground truncate max-w-[200px]"
                        title={item.label}
                      >
                        {item.label}
                      </span>
                    </div>
                    <div className="h-[5px] rounded-full bg-fill-tertiary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.max(4, (item.count / distMax) * 100)}%`,
                          background: item.color,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-foreground min-w-[24px] text-right">
                    {item.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Bottom Grid ── */}
      <div className="ref-bottom-grid">
        {/* AI Intelligence */}
        <div className="ref-widget-card">
          <div className="ref-card-header">
            <div className="ref-card-header-left">
              <Brain className="h-[17px] w-[17px]" style={{ color: "var(--cyan)" }} />
              <span>AI Intelligence</span>
            </div>
            <span className="ref-widget-badge">
              <LiveDot color="var(--cyan)" />
              Live Pipeline
            </span>
          </div>
          <div className="ref-ai-feed">
            {aiInsights.map((item) => (
              <div key={item.title} className="ref-ai-item">
                <div className="ref-ai-icon" style={{ background: item.bg, color: item.color }}>
                  {item.icon}
                </div>
                <div className="ref-ai-content">
                  <div className="ref-ai-title">{item.title}</div>
                  <div className="ref-ai-desc">{item.desc}</div>
                  <div className="ref-ai-action">{item.action}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="ref-widget-card">
          <div className="ref-card-header">
            <div className="ref-card-header-left">
              <Zap className="h-[17px] w-[17px]" style={{ color: "var(--blue)" }} />
              <span>Recent Activity</span>
            </div>
            <Link href="/campaigns" className="ref-btn-icon">
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="ref-activity-feed">
            {activityRows.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No activity yet</p>
            ) : (
              activityRows.map((row) => {
                const meta = stageMeta(row.stage);
                return (
                  <div key={row.id} className="ref-activity-item">
                    <div className="ref-activity-dot" style={{ background: meta.color }} />
                    <div className="ref-activity-info">
                      <div className="ref-activity-text">
                        <strong>{nameMap[row.candidate_id] ?? "Candidate"}</strong> moved to{" "}
                        <strong>{row.stage}</strong>
                      </div>
                      <div className="ref-activity-time">{timeAgo(row.decided_at)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Upcoming Interviews */}
        <div className="ref-widget-card">
          <div className="ref-card-header">
            <div className="ref-card-header-left">
              <Clock className="h-[17px] w-[17px]" style={{ color: "var(--blue)" }} />
              <span>Upcoming Interviews</span>
            </div>
          </div>
          <div className="ref-activity-feed">
            {upcomingRows.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Nothing scheduled</p>
            ) : (
              upcomingRows.map((row) => (
                <div key={row.id} className="ref-activity-item">
                  <div className="ref-activity-dot" style={{ background: "var(--blue)" }} />
                  <div className="ref-activity-info">
                    <div className="ref-activity-text">
                      <strong>{nameMap[row.candidate_id] ?? "Candidate"}</strong>
                      {" — "}
                      <span className="text-muted-foreground capitalize">
                        {row.round_type?.replace("_", " ")}
                      </span>
                    </div>
                    <div className="ref-activity-time">{formatDateTime(row.scheduled_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recruiter Leaderboard */}
        <div className="ref-widget-card">
          <div className="ref-card-header">
            <div className="ref-card-header-left">
              <Medal className="h-[17px] w-[17px]" style={{ color: "var(--blue)" }} />
              <span>Recruiter Leaderboard</span>
            </div>
            {hasCampaigns ? <LivePill /> : undefined}
          </div>
          <div className="ref-leaderboard">
            {(kpis.data?.recruiters ?? []).length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No recruiter activity yet
              </p>
            ) : (
              (kpis.data?.recruiters ?? []).map((lb, index) => {
                const rankClass =
                  index === 0 ? "gold" : index === 1 ? "silver" : index === 2 ? "bronze" : "";
                const initials = lb.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <div key={lb.email || lb.name} className="ref-lb-row">
                    <span className={cn("ref-lb-rank", rankClass)}>{index + 1}</span>
                    <div
                      className="ref-lb-avatar"
                      style={{ background: "linear-gradient(135deg,var(--blue),var(--cyan))" }}
                    >
                      {initials}
                    </div>
                    <div className="ref-lb-info">
                      <div className="ref-lb-name">{lb.name}</div>
                      <div className="ref-lb-role">{lb.role}</div>
                    </div>
                    <div className="text-right">
                      <div className="ref-lb-score-value">{lb.score}</div>
                      <div className="ref-lb-score-label">pts</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Reports / Usage ── */}
      {reports.isPending && !kpis.data?.usageFallback ? <ReportsNotice state="loading" /> : null}
      {reports.isError && !kpis.data?.usageFallback ? <ReportsNotice state="unavailable" /> : null}
      {(reports.data || kpis.data?.usageFallback) && (
        <div className="ref-card p-5">
          <div className="ref-card-header mb-4">
            <div className="ref-card-header-left">
              <BarChart2 className="h-[17px] w-[17px]" style={{ color: "var(--blue)" }} />
              <span>Usage & Billing</span>
            </div>
            <Button variant="outline" size="sm" className="rounded-full h-7 text-xs" asChild>
              <Link href="/billing">Manage</Link>
            </Button>
          </div>
          <UsageBars
            slices={
              reports.data?.usage
                ? reconciled
                : {
                    ai_interview: {
                      used: kpis.data?.usageFallback?.aiInterviewsUsed ?? 0,
                      granted: TIER_LIMITS[tier]?.aiInterview ?? null,
                    },
                    ai_voice_screening: {
                      used: kpis.data?.usageFallback?.voiceScreensUsed ?? 0,
                      granted: TIER_LIMITS[tier]?.aiVoiceScreening ?? null,
                    },
                    scheduled_round: {
                      used: kpis.data?.usageFallback?.scheduledRoundsUsed ?? 0,
                      granted: TIER_LIMITS[tier]?.scheduledRound ?? null,
                    },
                  }
            }
            tierLabel={tierLabel.toUpperCase()}
            fallback={{
              aiInterview: TIER_LIMITS[tier].aiInterview,
              aiVoiceScreening: TIER_LIMITS[tier].aiVoiceScreening,
              scheduledRound: TIER_LIMITS[tier].scheduledRound,
            }}
          />
        </div>
      )}
    </div>
  );
}
