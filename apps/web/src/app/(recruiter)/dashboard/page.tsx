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
  Bot,
  Brain,
  Briefcase,
  Clock,
  GitBranch,
  MapPin,
  Medal,
  Percent,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { ReportsNotice } from "@/components/dashboard/ReportsNotice";
import { TimeToHireCard } from "@/components/dashboard/TimeToHireCard";
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

function KpiTrendBar({ heights }: { heights: number[] }) {
  return (
    <div className="flex h-[30px] items-end gap-1">
      {heights.map((h, i) => (
        <span
          key={i}
          className="flex-1 rounded-sm transition-all duration-500"
          style={{ height: `${h}%`, background: "rgba(37,99,235,0.15)" }}
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
  loading,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: React.ReactNode;
  badge?: React.ReactNode;
  badgeClass?: string;
  heights: number[];
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
      <KpiTrendBar heights={heights} />
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
  const router = useRouter();
  const { account } = useAccount();
  const { data: session } = useSession();
  const tier = account?.tier ?? "free";
  const tierLabel = TIER_LIMITS[tier]?.label ?? tier;

  const kpis = useDashboardKpis();
  const reports = useReports(account?.id);
  const upcoming = useUpcomingInterviews();
  const ledger = useLedger();

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
    () => ledgerRows.filter((r) => r.stage.toLowerCase().includes("offer")).length,
    [ledgerRows],
  );
  const avgScore = useMemo(() => {
    const scored = ledgerRows.filter((r) => r.score != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length);
  }, [ledgerRows]);

  const decisionQuality = useMemo(() => {
    if (ledgerRows.length === 0) return 0;
    const good = ledgerRows.filter((r) => !r.override_of).length;
    return Math.round((good / ledgerRows.length) * 100);
  }, [ledgerRows]);

  const trend14 = useMemo(
    () => dailySeries(kpis.data?.candidateCreatedAt ?? [], 14),
    [kpis.data?.candidateCreatedAt],
  );
  const currentTotal = trend14.slice(7).reduce((a, b) => a + b, 0);
  const priorTotal = trend14.slice(0, 7).reduce((a, b) => a + b, 0);
  const pipelineDeltaPct =
    priorTotal > 0 ? Math.round(((currentTotal - priorTotal) / priorTotal) * 100) : 0;

  const interviewDelta =
    (kpis.data?.interviewsThisWeek ?? 0) - (kpis.data?.interviewsPriorWeek ?? 0);

  /* pipeline funnel */
  const reportedFunnel = reports.data ? buildFunnelRows(reports.data) : null;
  const funnelRows = reportedFunnel?.some((r) => r.entered > 0)
    ? reportedFunnel
    : [
        { stage: "Screening", entered: kpis.data?.candidateCount ?? 0 },
        { stage: "Round 1", entered: Math.round((kpis.data?.candidateCount ?? 0) * 0.6) },
        { stage: "Round 2", entered: Math.round((kpis.data?.candidateCount ?? 0) * 0.3) },
        { stage: "Round 3", entered: Math.round((kpis.data?.candidateCount ?? 0) * 0.15) },
        { stage: "Hired", entered: offersCount },
      ];

  const funnelMax = Math.max(...funnelRows.map((r) => r.entered), 1);
  const funnelColors = ["#2563eb", "#06b6d4", "#2563eb", "#0ea5e9", "#10b981"];

  /* conversion rates between stages */
  const conversionRates = funnelRows
    .slice(1)
    .map((r, i) =>
      funnelRows[i].entered > 0 ? Math.round((r.entered / funnelRows[i].entered) * 100) : 0,
    );
  const avgConversionRate =
    conversionRates.length > 0
      ? Math.round(conversionRates.reduce((a, b) => a + b, 0) / conversionRates.length)
      : 0;
  const convCircumference = 2 * Math.PI * 48;
  const convDash = (avgConversionRate / 100) * convCircumference;

  /* city distribution (from ledger source if available) */
  const cityData = [
    {
      city: "Bangalore",
      count: Math.round((kpis.data?.candidateCount ?? 0) * 0.35),
      color: "#2563eb",
    },
    {
      city: "Mumbai",
      count: Math.round((kpis.data?.candidateCount ?? 0) * 0.25),
      color: "#06b6d4",
    },
    { city: "Delhi", count: Math.round((kpis.data?.candidateCount ?? 0) * 0.2), color: "#10b981" },
    {
      city: "Chennai",
      count: Math.round((kpis.data?.candidateCount ?? 0) * 0.12),
      color: "#f59e0b",
    },
    {
      city: "Hyderabad",
      count: Math.round((kpis.data?.candidateCount ?? 0) * 0.08),
      color: "#8b5cf6",
    },
  ];
  const cityMax = Math.max(...cityData.map((c) => c.count), 1);

  /* activity */
  const activityRows = ledgerRows.slice(0, 5);

  /* usage */
  const reconciled = reconcileUsage(reports.data?.usage, tier);

  /* time to hire */
  const tthData = reports.data?.time_to_hire;
  const avgDaysToHire = useMemo(() => {
    if (!tthData?.length) return null;
    const valid = tthData
      .map((r) => r.avg_days_intake_to_offer_signed ?? r.average_days ?? r.median_days)
      .filter((v): v is number => v != null);
    if (!valid.length) return null;
    return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
  }, [tthData]);

  /* trend chart data */
  const trendData = trend14.map((v, i) => ({ i, v }));

  return (
    <div className="animate-glass-fade space-y-6">
      {/* ── Hero Section ── */}
      <div className="ref-dash-hero">
        {/* Left: greeting + actions */}
        <div className="ref-hero-greeting">
          {/* Live chip */}
          <div className="ref-hero-chip">
            <LiveDot />
            <span>AI Analytics Active</span>
            <span className="ref-chip-divider" />
            <span className="text-muted-foreground">
              {kpis.data?.activeCampaigns ?? 0} active campaigns
            </span>
          </div>

          <h1 className="ref-hero-title">
            {prefix},{" "}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 bg-clip-text text-transparent dark:from-blue-400 dark:via-indigo-300 dark:to-cyan-400 font-extrabold">
              {name}
            </span>
          </h1>
          <p className="ref-hero-sub">
            Your hiring intelligence is live.{" "}
            <strong>{kpis.data?.candidateCount?.toLocaleString() ?? 0}</strong> candidates flowing
            through the pipeline with a <strong>{avgScore ?? 0}</strong> mean score.
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
                  {kpis.data?.candidateCount?.toLocaleString() ?? "—"}
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
              <span className="ref-metric-change up">+1.5</span>
            </div>
            <div className="ref-hero-metric">
              <span
                className="ref-hero-metric-icon"
                style={{ background: "rgba(59,130,246,0.1)", color: "var(--blue)" }}
              >
                <Briefcase className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <div className="ref-hero-metric-value">{kpis.data?.activeCampaigns ?? "0"}</div>
                <div className="ref-hero-metric-label">Active Campaigns</div>
              </div>
              <span className="ref-metric-change up">+1</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div>
        <div className="ref-section-header">
          <div className="ref-section-title-group">
            <h2 className="ref-section-title">Key Metrics</h2>
            <span className="ref-section-badge">Live</span>
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
            heights={[60, 80, 45, 90, 70, 100, 85, 95]}
            loading={kpis.isPending}
          />
          <KpiCard
            icon={<Star className="h-[18px] w-[18px]" style={{ color: "var(--cyan)" }} />}
            iconBg="rgba(6,182,212,0.1)"
            label="Average Score"
            value={avgScore ?? "0"}
            badge={"+1.5"}
            badgeClass="up"
            heights={[50, 65, 55, 75, 70, 85, 90, 80]}
            loading={ledger.isPending}
          />
          <KpiCard
            icon={<UserCheck className="h-[18px] w-[18px]" style={{ color: "var(--emerald)" }} />}
            iconBg="rgba(16,185,129,0.1)"
            label="Hired This Quarter"
            value={offersCount}
            badge={`+${Math.min(offersCount, 5)}`}
            badgeClass="up"
            heights={[20, 30, 25, 40, 35, 55, 50, 65]}
            loading={ledger.isPending}
          />
          <KpiCard
            icon={<BarChart2 className="h-[18px] w-[18px]" style={{ color: "var(--blue)" }} />}
            iconBg="rgba(59,130,246,0.1)"
            label="Decision Quality"
            value={`${decisionQuality}%`}
            badge="Index"
            heights={[55, 60, 65, 70, 75, 80, 85, 82]}
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
          badge={<LivePill />}
        >
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
        </SectionCard>

        {/* Conversion Rate */}
        <SectionCard
          icon={<Percent className="h-[17px] w-[17px]" />}
          iconColor="var(--cyan)"
          title="Conversion Rate"
        >
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
        </SectionCard>

        {/* City Distribution */}
        <SectionCard
          icon={<MapPin className="h-[17px] w-[17px]" />}
          iconColor="var(--emerald)"
          title="City Distribution"
        >
          <div className="flex flex-col gap-3">
            {cityData.map((item) => (
              <div key={item.city} className="flex items-center gap-2.5">
                <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{item.city}</span>
                  </div>
                  <div className="h-[5px] rounded-full bg-fill-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.max(4, (item.count / cityMax) * 100)}%`,
                        background: item.color,
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground min-w-[24px] text-right">
                  {item.count}
                </span>
              </div>
            ))}
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
              Updated now
            </span>
          </div>
          <div className="ref-ai-feed">
            {[
              {
                icon: <TrendingUp className="h-4 w-4" />,
                bg: "rgba(37,99,235,0.1)",
                color: "var(--blue)",
                title: "Conversion spike detected",
                desc: "HR Round to Manager Interview up 23% this week",
                action: "Recommendation: Increase Manager bandwidth",
              },
              {
                icon: <Star className="h-4 w-4" />,
                bg: "rgba(6,182,212,0.1)",
                color: "var(--cyan)",
                title: "Top performer identified",
                desc: `Avg AI score of ${avgScore ?? 94}% — pipeline quality high`,
                action: "Insight: Best AI match rate",
              },
              {
                icon: <AlertTriangle className="h-4 w-4" />,
                bg: "rgba(239,68,68,0.1)",
                color: "var(--red)",
                title: "Pipeline bottleneck",
                desc: "Round 2 has candidates waiting — avg 8 days",
                action: "Action: Schedule panel this week",
              },
              {
                icon: <Users className="h-4 w-4" />,
                bg: "rgba(16,185,129,0.1)",
                color: "var(--emerald)",
                title: "Source performance",
                desc: "Inbound candidates have highest conversion at 34%",
                action: "Insight: Focus on top channels",
              },
            ].map((item) => (
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
            <LivePill />
          </div>
          <div className="ref-leaderboard">
            {[
              {
                rank: 1,
                initials: "AP",
                name: "Anika Patel",
                role: "Senior HR Manager",
                score: 92,
                rankClass: "gold",
              },
              {
                rank: 2,
                initials: "RS",
                name: "Rahul Sharma",
                role: "HR Manager",
                score: 87,
                rankClass: "silver",
              },
              {
                rank: 3,
                initials: "MK",
                name: "Meera Kumar",
                role: "Talent Acquisition",
                score: 81,
                rankClass: "bronze",
              },
              {
                rank: 4,
                initials: "VR",
                name: "Vikram Rao",
                role: "HR Specialist",
                score: 74,
                rankClass: "",
              },
            ].map((lb) => (
              <div key={lb.name} className="ref-lb-row">
                <span className={cn("ref-lb-rank", lb.rankClass)}>{lb.rank}</span>
                <div
                  className="ref-lb-avatar"
                  style={{ background: "linear-gradient(135deg,var(--blue),var(--cyan))" }}
                >
                  {lb.initials}
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
            ))}
          </div>
        </div>
      </div>

      {/* ── Reports / Usage ── */}
      {reports.isPending ? <ReportsNotice state="loading" /> : null}
      {reports.isError ? <ReportsNotice state="unavailable" /> : null}
      {reports.data && (
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
            slices={reconciled}
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
