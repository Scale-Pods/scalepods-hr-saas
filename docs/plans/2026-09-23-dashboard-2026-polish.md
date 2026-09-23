# 2026-Style Dashboard Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the cardless recruiter dashboard to read like a 2026 SaaS product: hero metric + supporting stat row with muted mini icons, an activity table with tint-only status pills, status pills in the review queue, and a since-your-last-visit notification bell.

**Architecture:** `StatBand` grows an `icon` + `hero` variant (grid flips to `lg:grid-cols-6`, hero spans 2). Recent activity becomes a `ui/table` and `stageMeta` (page-local) returns a pill pair instead of an icon. A new self-contained `features/notifications/` module (query hook, pure `computeUnread`, localStorage `readSeenAt`/`writeSeenAt`) backs a `NotificationBell` mounted in both AppShell headers. No data logic changes; token/theme/route behavior untouched.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4, lucide-react, @tanstack/react-query, @testing-library/react + vitest.

---

### Task 1: Notification decisions feature (query + unread counter)

**Files:**
- Create: `apps/web/src/features/notifications/unread.test.ts`
- Create: `apps/web/src/features/notifications/unread.ts`
- Create: `apps/web/src/features/notifications/hooks.ts`

**Step 1: Write the failing test**

Create `apps/web/src/features/notifications/unread.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "@/features/dashboard/api";
import { computeUnread } from "./unread";

let seq = 0;
const entry = (decided_at: string): LedgerEntry => ({
  id: `entry-${++seq}`,
  candidate_id: "c-1",
  stage: "ai_interview",
  score: null,
  source: "workflow",
  override_of: null,
  decided_at,
});

describe("computeUnread", () => {
  it("counts every entry when nothing has been seen yet", () => {
    const entries = [entry("2026-09-01T10:00:00Z"), entry("2026-09-02T10:00:00Z")];
    expect(computeUnread(entries, null)).toBe(2);
  });

  it("counts only decisions decided after seenAt", () => {
    const entries = [entry("2026-09-01T10:00:00Z"), entry("2026-09-02T10:00:00Z")];
    expect(computeUnread(entries, Date.parse("2026-09-01T12:00:00Z"))).toBe(1);
  });

  it("excludes the exact seenAt boundary", () => {
    const at = Date.parse("2026-09-02T10:00:00Z");
    const entries = [entry(new Date(at).toISOString())];
    expect(computeUnread(entries, at)).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/notifications/unread.test.ts`
Expected: FAIL — module `./unread` cannot be resolved.

**Step 3: Write the implementation**

Create `apps/web/src/features/notifications/unread.ts`:

```ts
import type { LedgerEntry } from "@/features/dashboard/api";

export const SEEN_AT_KEY = "notifications:decisions-seen-at";

/** Number of decisions made after the last time the user viewed the dropdown. */
export function computeUnread(entries: LedgerEntry[], seenAt: number | null): number {
  if (seenAt == null) return entries.length;
  const at = seenAt;
  return entries.filter((e) => new Date(e.decided_at).getTime() > at).length;
}

export function readSeenAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SEEN_AT_KEY);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function writeSeenAt(t: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEEN_AT_KEY, String(t));
}
```

Create `apps/web/src/features/notifications/hooks.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchLedger } from "@/features/dashboard/api";

export const notificationsKeys = {
  decisions: ["notifications", "decisions"] as const,
};

/** Latest decision_ledger rows for the notification bell (45s stale, 60s poll). */
export function useDecisions() {
  return useQuery({
    queryKey: notificationsKeys.decisions,
    queryFn: () => fetchLedger(25),
    staleTime: 45_000,
    refetchInterval: 60_000,
  });
}
```

Note: `fetchLedger` already lives in `apps/web/src/features/dashboard/api.ts` — reuse it, do not duplicate a query.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/notifications/unread.test.ts`
Expected: PASS (3 tests).

Then run: `npm run typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/features/notifications/unread.test.ts apps/web/src/features/notifications/unread.ts apps/web/src/features/notifications/hooks.ts
git commit -m "feat: notification decisions with pure unread counter"
```

---

### Task 2: NotificationBell + AppShell mount

**Files:**
- Create: `apps/web/src/components/shared/NotificationBell.tsx`
- Modify: `apps/web/src/components/shared/AppShell.tsx`

**Step 1: Create the component**

Create `apps/web/src/components/shared/NotificationBell.tsx`:

```tsx
"use client";

import { timeAgo } from "@scalepods/core";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCandidateNames } from "@/features/dashboard/hooks";
import { useDecisions } from "@/features/notifications/hooks";
import { computeUnread, readSeenAt, writeSeenAt } from "@/features/notifications/unread";

export function NotificationBell() {
  const { data: decisions } = useDecisions();
  const candidateIds = useMemo(
    () => (decisions ?? []).map((d) => d.candidate_id),
    [decisions],
  );
  const names = useCandidateNames(candidateIds);
  const nameMap = names.data ?? {};

  const [seenAt, setSeenAt] = useState<number | null>(() => readSeenAt());
  const unread = computeUnread(decisions ?? [], seenAt);
  const latest = (decisions ?? []).slice(0, 8);

  const markRead = () => {
    const now = Date.now();
    writeSeenAt(now);
    setSeenAt(now);
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) markRead();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <button
            type="button"
            onClick={markRead}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Mark all read
          </button>
        </div>
        {latest.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No new decisions</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {latest.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/candidates/${row.candidate_id}`}
                  className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {nameMap[row.candidate_id] ?? "Candidate"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.stage}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {timeAgo(row.decided_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

**Step 2: Mount in AppShell**

In `apps/web/src/components/shared/AppShell.tsx`:

- Add import: `import { NotificationBell } from "./NotificationBell";` (after the `Logo` import line; keep alphabetical spacing as biome expects).
- **Desktop header** (`<div className="flex items-center gap-2">` wrapping `<ThemeToggle />`): add `<NotificationBell />` before `<ThemeToggle />`.
- **Mobile header** (`<div className="flex items-center gap-2">` wrapping `<ThemeToggle />` and the `<Sheet>`): add `<NotificationBell />` before `<ThemeToggle />`.

There are TWO `flex items-center gap-2` header groups (one in the `lg:hidden` mobile header, one in the `lg:flex` desktop header) — change both.

**Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

**Step 4: Commit**

```bash
git add apps/web/src/components/shared/NotificationBell.tsx apps/web/src/components/shared/AppShell.tsx
git commit -m "feat: notification bell in app shell"
```

---

### Task 3: StatBand hero variant + muted icon chips

**Files:**
- Modify: `apps/web/src/components/dashboard/StatBand.tsx`
- Modify: `apps/web/src/components/dashboard/StatBand.test.tsx`

**Step 1: Add the failing tests**

Append to `apps/web/src/components/dashboard/StatBand.test.tsx` (keep existing tests unchanged). Add the `Users` import to the lucide import (add a new import line `import { Users } from "lucide-react";`).

```tsx
it("renders a muted icon chip when an icon is provided", () => {
  render(
    <StatBand
      stats={[
        { id: "a", label: "Active campaigns", value: "3", icon: <Users data-testid="stat-icon" /> },
      ]}
    />,
  );
  expect(screen.getByTestId("stat-icon")).toBeInTheDocument();
});

it("widens the hero cell across two columns", () => {
  render(
    <StatBand stats={[{ id: "p", label: "Candidates in pipeline", value: "12", hero: true }]} />,
  );
  const cell = screen.getByText("12").closest(".min-w-0");
  expect(cell?.className ?? "").toContain("lg:col-span-2");
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/dashboard/StatBand.test.tsx`
Expected: FAIL — `icon: <Users .../>` is not assignable (no `icon` prop) and "12" renders without `lg:col-span-2`.

**Step 3: Update the component**

Rewrite `apps/web/src/components/dashboard/StatBand.tsx` to exactly this:

```tsx
"use client";

import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface StatBandStat {
  id: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  hero?: boolean;
  delta?: number | null;
  trend?: number[] | null;
  progress?: { used: number; granted: number } | null;
  description?: ReactNode;
  onClick?: () => void;
  loading?: boolean;
}

export interface StatBandProps {
  stats: StatBandStat[];
  className?: string;
}

/** Flat, hairline-separated KPI row. No cards, no boxes. */
export function StatBand({ stats, className }: StatBandProps) {
  return (
    <div
      className={cn(
        "grid gap-6 sm:grid-cols-2 lg:grid-cols-6",
        "lg:[&>*:first-child]:border-0 lg:[&>*:first-child]:pl-0",
        className,
      )}
    >
      {stats.map((s) => (
        <StatCell key={s.id} {...s} />
      ))}
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
  icon,
  hero,
  delta,
  trend,
  progress,
  description,
  onClick,
  loading,
}: StatBandStat) {
  const gradientId = useId();
  const subId = useId();
  const over = progress ? progress.used / Math.max(1, progress.granted) > 0.9 : false;
  const pct = progress ? Math.min(100, (progress.used / Math.max(1, progress.granted)) * 100) : 0;

  return (
    <div className={cn("min-w-0 border-border lg:border-l lg:pl-6", hero && "lg:col-span-2")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
              {icon}
            </span>
          ) : null}
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        </div>
        {description ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`What does ${label} mean`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 text-xs">
              {description}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: content block is a valid interactive region when onClick is provided */}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role resolves to "button" when aria-label is used */}
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? `${label}: ${String(value)}` : undefined}
        aria-describedby={onClick && sub ? subId : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        className={cn(
          onClick &&
            "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        {loading ? (
          <div className="mt-2 space-y-2">
            <div className="h-7 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <p
                className={cn(
                  "font-semibold tabular-nums tracking-tight text-foreground",
                  hero ? "text-4xl xl:text-5xl" : "text-2xl",
                )}
              >
                {value}
              </p>
              {delta != null && delta !== 0 ? (
                <span
                  role="img"
                  className={cn(
                    "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                    delta > 0 ? "text-success" : "text-destructive",
                  )}
                  aria-label={`${delta > 0 ? `+${delta}` : `${delta}`} vs previous period`}
                >
                  {delta > 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {delta > 0 ? `+${delta}` : `${delta}`}
                </span>
              ) : null}
            </div>
            {trend && trend.length > 1 ? (
              <div
                className={cn("-mx-1 mt-1", hero ? "h-14" : "h-9")}
                role="img"
                aria-label={`${label} trend: ${trend.join(", ")}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={trend.map((v, i) => ({ i, v }))}
                    margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="var(--chart-1)"
                      strokeWidth={1.5}
                      fill={`url(#${gradientId})`}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : null}
            {progress ? (
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${label} progress: ${progress.used} of ${progress.granted}`}
              >
                {pct > 0 ? (
                  <div
                    className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-success")}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                ) : null}
              </div>
            ) : null}
            {sub ? (
              <p id={sub ? subId : undefined} className="mt-1.5 text-xs text-muted-foreground">
                {sub}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Run tests + typecheck**

Run: `npx vitest run src/components/dashboard/StatBand.test.tsx`
Expected: PASS (9 tests — 7 existing + 2 new).

Then run: `npm run typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/StatBand.tsx apps/web/src/components/dashboard/StatBand.test.tsx
git commit -m "feat: hero stat band variant with muted icon chips"
```

---

### Task 4: Dashboard page — hero stats, activity table, status pills

**Files:**
- Modify: `apps/web/src/app/(recruiter)/dashboard/page.tsx`

**Step 1: Update imports**

Replace the lucide import:

```tsx
import { ArrowUpRight, CheckCircle2, Plus, XCircle } from "lucide-react";
```

with:

```tsx
import {
  BadgeCheck,
  CalendarClock,
  Coins,
  FolderKanban,
  Plus,
  Users,
} from "lucide-react";
```

Add a table import (keep alphabetical ordering in the import list — place it among the `@/components/ui/...` imports):

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
```

**Step 2: Replace stageMeta**

Replace the whole `stageMeta` function (currently returns `{ icon, tone }`) with a pill/label pair:

```tsx
function stageMeta(stage: string) {
  const s = stage.toLowerCase();
  if (s.includes("reject") || s.includes("fail"))
    return { pill: "bg-destructive/10 text-destructive", label: "Rejected" };
  if (s.includes("offer") || s.includes("pass"))
    return { pill: "bg-success/10 text-success", label: s.includes("offer") ? "Offer" : "Passed" };
  return { pill: "bg-chart-1/10 text-chart-1", label: "In progress" };
}
```

**Step 3: Hero + icons in the StatBand**

The `<StatBand ...>` `stats` array becomes **pipeline first with `hero` + all five stats get an icon**. Replace the whole array with:

```tsx
      <StatBand
        stats={[
          {
            id: "pipeline",
            label: "Candidates in pipeline",
            icon: <Users className="h-4 w-4" aria-hidden />,
            hero: true,
            value: kpis.data?.candidateCount ?? "—",
            loading: kpis.isPending,
            delta: pipelineDelta,
            trend: pipelineTrend,
            sub: `${currentTotal} added in the last 7 days`,
            description:
              "Total candidates enrolled across your campaigns. The sparkline shows candidates added per day over the past two weeks.",
          },
          {
            id: "active-campaigns",
            label: "Active campaigns",
            icon: <FolderKanban className="h-4 w-4" aria-hidden />,
            value: kpis.data?.activeCampaigns ?? "—",
            loading: kpis.isPending,
            sub: "Currently live and accepting candidates",
            description: "Recruiting drives that are currently live and accepting candidates.",
            onClick: () => router.push("/campaigns"),
          },
          {
            id: "interviews",
            label: "Interviews this week",
            icon: <CalendarClock className="h-4 w-4" aria-hidden />,
            value: kpis.data?.interviewsThisWeek ?? "—",
            loading: kpis.isPending,
            delta: interviewsDelta,
            sub:
              kpis.data?.interviewsThisWeek == null
                ? undefined
                : `${kpis.data.interviewsThisWeek} scheduled${
                    interviewsDelta != null
                      ? ` · ${interviewsDelta > 0 ? "+" : ""}${interviewsDelta} vs last week`
                      : ""
                  }`,
            description: "Interviews scheduled in the last 7 days, compared with the prior week.",
          },
          {
            id: "credits",
            label: "AI credits remaining",
            icon: <Coins className="h-4 w-4" aria-hidden />,
            value: creditsRemaining ?? "—",
            loading: reports.isPending,
            progress: aiGranted != null ? { used: aiUsed, granted: aiGranted } : undefined,
            sub: creditsLow ? (
              <span className="text-destructive">
                90% of your AI interview allowance is used — upgrade to extend it.
              </span>
            ) : aiGranted != null ? (
              `${aiUsed} of ${aiGranted} used this month`
            ) : undefined,
            description:
              "AI interview credits left this billing month before hitting your tier limit.",
            onClick: () => router.push("/billing"),
          },
          {
            id: "offers-7d",
            label: "Offers sent (7d)",
            icon: <BadgeCheck className="h-4 w-4" aria-hidden />,
            value: offers7d.current,
            loading: ledger.isPending,
            delta: offers7d.current - offers7d.prior,
            sub: `${offers7d.prior} in the prior week`,
            description: "Offer decisions recorded in your decision ledger over the last 7 days.",
          },
        ]}
      />
```

**Step 4: Recent activity → table**

Replace the current `<ul className="divide-y divide-border">...</ul>` "Recent activity" body with:

```tsx
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((row) => {
                    const meta = stageMeta(row.stage);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Link
                            href={`/candidates/${row.candidate_id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {nameMap[row.candidate_id] ?? "Candidate"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.stage}
                          {row.source === "manual" ? " · manual" : ""}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.score != null ? row.score : "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              meta.pill,
                            )}
                          >
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                          {timeAgo(row.decided_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
```

Keep the surrounding `<DashboardSection title="Recent activity" ...>` wrapper and its `activity.length === 0`/`EmptyState` branch as-is.

**Step 5: Review queue pills**

In the "Needs your review" section replace the trailing `<span ...>{row.stage}</span>` with a pill from the same helper:

```tsx
                {needsReview.map((row) => {
                  const meta = stageMeta(row.stage);
                  return (
                    <li key={row.id}>
                      <Link
                        href={`/candidates/${row.candidate_id}`}
                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <span className="truncate font-medium text-foreground">
                          {nameMap[row.candidate_id] ?? "Candidate"}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                            meta.pill,
                          )}
                        >
                          {meta.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
```

Keep the `needsReview.length === 0` / `EmptyState` branch. `needsReview`, `activity`, `nameMap`, `timeAgo`, `cn` and all other computed values stay exactly as they already are.

**Step 6: Typecheck + tests**

Run: `npm run typecheck`
Expected: PASS.

Then run: `npm test`
Expected: PASS (18 files / 80 tests).

**Step 7: Commit**

```bash
git add apps/web/src/app/\(recruiter\)/dashboard/page.tsx
git commit -m "feat: 2026 dashboard polish - hero stats, activity table, status pills"
git status
```

`git status` shows a clean tree aside from the user's unrelated pre-existing WIP.

---

### Task 5: Final verification gate (run by orchestrator, not subagent)

**Files:** none

**Step 1: Ensure port 3000 is free**

If a dev server is running, stop it. Run: `netstat -ano | findstr :3000` — confirm no listener.

**Step 2: Clean + build**

Run (in `apps/web`): `rmdir /s /q .next && npm run build`
Expected: `Compiled successfully`, 13/13 static pages (same count as before).

**Step 3: Full re-verify**

Run: `npm test` and `npm run typecheck`
Expected: all passing (18 files / 80 tests).

**Step 4: Report**

Summarize the diff: hero + 4 supporting stats with muted icons, activity table with status pills, review-queue pills, notification bell in both headers. Remind the user to restart `npm run dev` if it was stopped.

---

## Notes for the executor

- Repo root: `B:\Scalepods Hr SaaS`; run all npm commands in `apps/web`.
- Pre-commit hook: biome formatter + lint (`lint/suspicious/noArrayIndexKey` is on — never key lists by index) + commitlint (allowed: build,chore,ci,docs,feat,fix,perf,refactor,revert,style,test). Files need LF + trailing newline; if a hook rejects a file for formatting, normalize via a `node -e` one-liner (echo/Write both add problems).
- `skill()`, `glob`, `grep` tools are broken on this box (`powershell.exe` missing) — use Bash `findstr`/`dir` and Read/Edit.
- Do NOT touch: `components/ui/card.tsx`, `MetricCard`, `SectionCard`, `CardGrid`, or any other page. Do NOT modify `features/dashboard/api.ts`, `features/dashboard/hooks.ts`, `components/ui/*` — they are dependencies, read-only here.
- Commits per task; never stage unrelated WIP (user has uncommitted changes in `README.md`, `apps/legacy/src/routes/Settings.tsx`, `apps/web/package.json`, auth/candidate-conduct/campaigns-id/settings pages, resume uploader files, `package-lock.json`, and old plan docs) and never `git add .` / `git add -A`.