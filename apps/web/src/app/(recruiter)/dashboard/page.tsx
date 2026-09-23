"use client";

import {
  buildFunnelRows,
  dailySeries,
  type FunnelRow,
  formatDateTime,
  TIER_LIMITS,
  timeAgo,
} from "@scalepods/core";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { FunnelChart } from "@/components/dashboard/FunnelChart";
import { ReportsNotice } from "@/components/dashboard/ReportsNotice";
import { SourceEffectivenessTable } from "@/components/dashboard/SourceEffectivenessTable";
import { TimeToHireCard } from "@/components/dashboard/TimeToHireCard";
import { UsageBars } from "@/components/dashboard/UsageBars";
import { CardGrid } from "@/components/shared/CardGrid";
import { EmptyState } from "@/components/shared/EmptyState";
import { MetricCard } from "@/components/shared/MetricCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/features/account/hooks";
import {
  useCandidateNames,
  useDashboardKpis,
  useLedger,
  useReports,
  useUpcomingInterviews,
} from "@/features/dashboard/hooks";
import { reconcileUsage } from "@/features/dashboard/usage";
import { cn } from "@/lib/utils";

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

export default function DashboardPage() {
  const router = useRouter();
  const { account } = useAccount();
  const tier = account?.tier ?? "free";
  const tierLabel = TIER_LIMITS[tier]?.label ?? tier;

  const kpis = useDashboardKpis();
  const reports = useReports(account?.id);
  const upcoming = useUpcomingInterviews();
  const ledger = useLedger();

  const ledgerRows = ledger.data ?? [];
  const upcomingRows = upcoming.data ?? [];

  const names = useCandidateNames([
    ...upcomingRows.map((r) => r.candidate_id),
    ...ledgerRows.map((r) => r.candidate_id),
  ]);
  const nameMap = names.data ?? {};

  const offersCount = useMemo(
    () => ledgerRows.filter((r) => r.stage.toLowerCase().includes("offer")).length,
    [ledgerRows],
  );

  const reportedFunnel = reports.data ? buildFunnelRows(reports.data) : null;
  const useReportedFunnel = Boolean(reportedFunnel?.some((r) => r.entered > 0));
  const funnelRows: FunnelRow[] = useReportedFunnel
    ? (reportedFunnel as FunnelRow[])
    : [
        { stage: "Candidates", entered: kpis.data?.candidateCount ?? 0 },
        { stage: "Offers", entered: offersCount },
      ];

  const trend14 = useMemo(
    () => dailySeries(kpis.data?.candidateCreatedAt ?? [], 14),
    [kpis.data?.candidateCreatedAt],
  );
  const pipelineTrend = trend14.slice(7);
  const priorTotal = trend14.slice(0, 7).reduce((a, b) => a + b, 0);
  const currentTotal = pipelineTrend.reduce((a, b) => a + b, 0);
  const pipelineDelta = kpis.data?.candidateCount == null ? null : currentTotal - priorTotal;
  const interviewsDelta =
    kpis.data?.interviewsThisWeek == null || kpis.data?.interviewsPriorWeek == null
      ? null
      : kpis.data.interviewsThisWeek - kpis.data.interviewsPriorWeek;

  const reconciled = reconcileUsage(reports.data?.usage, tier);
  const aiGranted = reconciled.ai_interview.granted;
  const aiUsed = reconciled.ai_interview.used;
  const creditsRemaining = aiGranted != null ? Math.max(0, aiGranted - aiUsed) : null;
  const creditsLow = aiGranted != null && aiUsed / Math.max(1, aiGranted) > 0.9;

  const needsReview = useMemo(() => {
    const seen = new Set<string>();
    const rows: typeof ledgerRows = [];
    for (const row of ledgerRows) {
      if (row.override_of || row.source !== "workflow") continue;
      if (seen.has(row.candidate_id)) continue;
      seen.add(row.candidate_id);
      rows.push(row);
      if (rows.length === 5) break;
    }
    return rows;
  }, [ledgerRows]);

  const activity = ledgerRows.slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`${tierLabel} plan · last billing window ${account?.billing_anchor_date ?? "—"}`}
        actions={
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" aria-hidden />
              New campaign
            </Link>
          </Button>
        }
      />

      <CardGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <MetricCard
          label="Active campaigns"
          value={kpis.data?.activeCampaigns ?? "—"}
          loading={kpis.isPending}
          icon={<FolderKanban className="h-4 w-4" aria-hidden />}
          description="Recruiting drives that are currently live and accepting candidates."
          onClick={() => router.push("/campaigns")}
          tone="campaigns"
        />
        <MetricCard
          label="Candidates in pipeline"
          value={kpis.data?.candidateCount ?? "—"}
          loading={kpis.isPending}
          delta={pipelineDelta}
          trend={pipelineTrend}
          icon={<Users className="h-4 w-4" aria-hidden />}
          sub={`${currentTotal} added in the last 7 days`}
          description="Total candidates enrolled across your campaigns. The sparkline shows candidates added per day over the past two weeks."
          tone="candidates"
        />
        <MetricCard
          label="Interviews this week"
          value={kpis.data?.interviewsThisWeek ?? "—"}
          loading={kpis.isPending}
          delta={interviewsDelta}
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          sub={
            kpis.data?.interviewsThisWeek == null
              ? undefined
              : `${kpis.data.interviewsThisWeek} scheduled${
                  interviewsDelta != null
                    ? ` · ${interviewsDelta > 0 ? "+" : ""}${interviewsDelta} vs last week`
                    : ""
                }`
          }
          description="Interviews scheduled in the last 7 days, compared with the prior week."
          tone="interviews"
        />
        <MetricCard
          label="AI credits remaining"
          value={creditsRemaining ?? "—"}
          loading={reports.isPending}
          icon={<Megaphone className="h-4 w-4" aria-hidden />}
          sub={
            creditsLow ? (
              <span className="text-warning">
                90% of your AI interview allowance is used — upgrade to extend it.
              </span>
            ) : aiGranted != null ? (
              `${aiUsed} of ${aiGranted} used this month`
            ) : undefined
          }
          description="AI interview credits left this billing month before hitting your tier limit."
          tone="credits"
        />
      </CardGrid>

      {reports.isPending ? <ReportsNotice state="loading" /> : null}
      {reports.isError ? <ReportsNotice state="unavailable" /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {reports.data ? (
            <SectionCard title="Usage" subtitle="Used vs. granted this month · red past 90%">
              <UsageBars
                slices={reconciled}
                tierLabel={tierLabel.toUpperCase()}
                fallback={{
                  aiInterview: TIER_LIMITS[tier].aiInterview,
                  aiVoiceScreening: TIER_LIMITS[tier].aiVoiceScreening,
                  scheduledRound: TIER_LIMITS[tier].scheduledRound,
                }}
              />
            </SectionCard>
          ) : null}

          <SectionCard
            title="Candidate funnel"
            subtitle={
              useReportedFunnel
                ? "Intake → signed offer"
                : "From your database while the funnel report is warming up"
            }
          >
            <FunnelChart rows={funnelRows} />
          </SectionCard>

          <SectionCard title="Recent activity" subtitle="Latest pipeline decisions">
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
                          meta.tone,
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/candidates/${row.candidate_id}`}
                          className="text-sm font-medium text-foreground hover:underline"
                        >
                          {nameMap[row.candidate_id] ?? "Candidate"}
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
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Source effectiveness"
            subtitle="Which channels start conversations that convert"
          >
            {reports.data ? (
              <SourceEffectivenessTable reports={reports.data} />
            ) : (
              <EmptyState
                title="No source breakdown yet"
                hint="Per-channel delivery comes from GET /webhook/reports."
              />
            )}
          </SectionCard>

          <SectionCard title="Time to hire" subtitle="Offer-accepted lag across recent hires">
            {reports.data ? (
              <TimeToHireCard reports={reports.data} />
            ) : (
              <EmptyState
                title="No time-to-hire data yet"
                hint="Intake-to-offer lag comes from GET /webhook/reports."
              />
            )}
          </SectionCard>

          <SectionCard title="Upcoming interviews" subtitle="Next scheduled rounds">
            {upcomingRows.length === 0 ? (
              <EmptyState
                title="Nothing scheduled"
                hint="Booked rounds will appear here as candidates pick interview slots."
              />
            ) : (
              <ul className="space-y-3">
                {upcomingRows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {nameMap[row.candidate_id] ?? "Candidate"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(row.scheduled_at)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                      {roundTypeLabel(row.round_type)} · {row.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Needs your review" subtitle="Latest workflow decisions">
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
                      href={`/candidates/${row.candidate_id}`}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <span className="truncate font-medium text-foreground">
                        {nameMap[row.candidate_id] ?? "Candidate"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{row.stage}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
