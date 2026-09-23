# Cardless Modern SaaS Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the recruiter dashboard's card containers (`MetricCard` tiles + `SectionCard` boxes) with a flat, hairline-separated modern SaaS layout while keeping every piece of data and logic identical.

**Architecture:** New cardless primitives (`DashboardSection` for sections, `StatBand` for the top metric row) are used only by `dashboard/page.tsx`; the existing `MetricCard`/`SectionCard`/`CardGrid` stay for other pages. Data flows are untouched — the page computes the same KPIs and just renders them boxlessly; one new client-side "offers sent (7d)" stat is derived from the already-fetched ledger.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4, lucide-react icons, recharts sparklines, @testing-library/react + vitest.

---

### Task 1: DashboardSection — cardless section primitive

**Files:**
- Create: `apps/web/src/components/shared/DashboardSection.tsx`

**Step 1: Create the component**

Mirror `SectionCard`'s props (`title`, `subtitle`, `action`, `children`, `className`, `contentClassName`) but render a plain `<section>` with a hairline header instead of a `Card`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DashboardSectionProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

/** Cardless section: heading row closed by a hairline rule. */
export function DashboardSection({
  title,
  subtitle,
  action,
  className,
  contentClassName,
  children,
}: DashboardSectionProps) {
  return (
    <section className={cn("py-5", className)}>
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("pt-4", contentClassName)}>{children}</div>
    </section>
  );
}
```

**Step 2: Typecheck**

Run: `npm run typecheck` (in `apps/web`)
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/shared/DashboardSection.tsx
git commit -m "feat: cardless dashboard section primitive"
```

---

### Task 2: StatBand — hairline top stat row

**Files:**
- Create: `apps/web/src/components/dashboard/StatBand.tsx`
- Test: `apps/web/src/components/dashboard/StatBand.test.tsx`

**Step 1: Write the failing test**

Follow the `MetricCard.test.tsx` pattern (ResizeObserver stub) — copy its imports/stub. Cover:

```tsx
describe("StatBand", () => {
  it("renders value, sub and a positive delta", () => {
    render(<StatBand stats={[{ id: "kw", label: "Interviews this week", value: "12", delta: 4, sub: "4 scheduled" }]} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.getByText("4 scheduled")).toBeInTheDocument();
  });

  it("marks a negative delta with the destructive tone and aria text", () => {
    render(<StatBand stats={[{ id: "p", label: "Pipeline", value: "7", delta: -2 }]} />);
    const chip = screen.getByText("-2");
    expect(chip.classList.contains("text-destructive")).toBe(true);
    expect(chip.getAttribute("aria-label")).toContain("vs previous period");
  });

  it("renders a labelled sparkline when trend is provided", () => {
    render(<StatBand stats={[{ id: "i", label: "Interviews", value: "3", trend: [1, 2, 3] }]} />);
    expect(screen.getByRole("img", { name: /Interviews trend/ })).toBeInTheDocument();
  });

  it("shows a skeleton instead of the value while loading", () => {
    render(<StatBand stats={[{ id: "i", label: "Interviews", value: "3", loading: true }]} />);
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.getByText("Interviews")).toBeInTheDocument();
  });

  it("renders a progress bar under the value when progress is given", () => {
    render(<StatBand stats={[{ id: "c", label: "AI credits remaining", value: "7", progress: { used: 18, granted: 25 } }]} />);
    expect(screen.getByRole("img", { name: /progress/i })).toBeInTheDocument();
  });

  it("exposes a button role and keyboard activation when clickable and keeps the info popover", () => {
    const onClick = vi.fn();
    render(<StatBand stats={[{ id: "a", label: "Active campaigns", value: "3", onClick, description: "Live drives" }]} />);
    expect(screen.getByRole("button", { name: /Active campaigns/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/What does Active campaigns mean/)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/StatBand.test.tsx`
Expected: FAIL — `StatBand` is not exported.

Notes for the progress element: render role="img" with aria-label "progress: used of granted" so the `getByRole("img", { name: /progress/i })` assertion matches.

**Step 3: Write the component**

```tsx
"use client";

import { Info, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface StatBandStat {
  id: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
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
        "grid gap-6 sm:grid-cols-2 lg:grid-cols-5",
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
```

`StatCell` (private, same file):

```tsx
function StatCell({
  label,
  value,
  sub,
  delta,
  trend,
  progress,
  description,
  onClick,
  loading,
}: StatBandStat) {
  const gradientId = useId();
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaTone =
    delta == null || delta === 0
      ? "text-muted-foreground"
      : delta > 0
        ? "text-success"
        : "text-destructive";
  const deltaLabel = delta == null ? "" : delta > 0 ? `+${delta}` : `${delta}`;
  const over = progress ? progress.used / Math.max(1, progress.granted) > 0.9 : false;
  const pct = progress ? Math.min(100, (progress.used / Math.max(1, progress.granted)) * 100) : 0;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
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
        "min-w-0 border-border lg:border-l lg:pl-6",
        onClick && "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
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

      {loading ? (
        <div className="mt-2 space-y-2">
          <div className="h-7 w-20 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {value}
            </p>
            {delta != null && delta !== 0 ? (
              <span
                role="img"
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                  deltaTone,
                )}
                aria-label={`${deltaLabel} vs previous period`}
              >
                <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
                {deltaLabel}
              </span>
            ) : null}
          </div>
          {trend && trend.length > 1 ? (
            <div
              className="-mx-1 mt-1 h-9"
              role="img"
              aria-label={`${label} trend: ${trend.join(", ")}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
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
              <div
                className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-success")}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          ) : null}
          {sub ? <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p> : null}
        </>
      )}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/StatBand.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/StatBand.tsx apps/web/src/components/dashboard/StatBand.test.tsx
git commit -m "feat: hairline stat band for cardless dashboard"
```

---

### Task 3: ReportsNotice → DashboardSection + FunnelChart hairline restyle

**Files:**
- Modify: `apps/web/src/components/dashboard/ReportsNotice.tsx`
- Modify: `apps/web/src/components/dashboard/FunnelChart.tsx`

**Step 1: ReportsNotice**

Swap `SectionCard` for `DashboardSection` (same title/subtitle/children structure; copy stays identical):

```tsx
import { DashboardSection } from "@/components/shared/DashboardSection";
import { Skeleton } from "@/components/ui/skeleton";
```

Replace both `SectionCard` usages in this file with `DashboardSection`. No prop changes needed (`title`, `subtitle`, children) since props match.

**Step 2: FunnelChart**

Change just the bar track (layout/math unchanged). In `FunnelChart.tsx`, the track div:

```tsx
<div className="h-7 flex-1 overflow-hidden rounded-md bg-muted">
```

becomes:

```tsx
<div className="h-5 flex-1 overflow-hidden rounded-full bg-muted/60">
```

Leave the label span and `converted` text as-is.

**Step 3: Typecheck + existing tests**

Run: `npm run typecheck` and `npx vitest run`
Expected: PASS — no test asserts the old tracks/classes.

**Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/ReportsNotice.tsx apps/web/src/components/dashboard/FunnelChart.tsx
git commit -m "style: cardless reports notice and hairline funnel bars"
```

---

### Task 4: Rewrite the dashboard page

**Files:**
- Modify: `apps/web/src/app/(recruiter)/dashboard/page.tsx`

**Step 1: Update imports**

Remove: `CardGrid`, `MetricCard`, `SectionCard`, and the tile icons `FolderKanban`, `Users`, `CalendarClock`, `Megaphone`.
Add: `DashboardSection` (`@/components/shared/DashboardSection`) and `StatBand` (`@/components/dashboard/StatBand`).
Keep: `ArrowUpRight`, `CheckCircle2`, `XCircle` (activity `stageMeta`), `useRouter`, `Plus`, `Link`, all hooks, `cn`, `buildFunnelRows`, etc.

**Step 2: Add the offers-7d computation**

The page already computes `offersCount` (lifetime). Add a 7-day current/prior pair derived from `ledgerRows` (already fetched):

```tsx
const offers7d = useMemo(() => {
  const day = 86_400_000;
  const now = Date.now();
  const wkStart = now - 7 * day;
  const priorStart = now - 14 * day;
  const offers = ledgerRows.filter((r) => r.stage.toLowerCase().includes("offer"));
  const within = (t: number) => t >= wkStart && t <= now;
  const current = offers.filter((r) => within(new Date(r.decided_at).getTime())).length;
  const prior = offers.filter((r) => {
    const t = new Date(r.decided_at).getTime();
    return t >= priorStart && t < wkStart;
  }).length;
  return { current, prior };
}, [ledgerRows]);
```

**Step 3: Build the `stats` array and replace the CardGrid**

Replace the `<CardGrid ...>...</CardGrid>` block with:

```tsx
<StatBand
  stats={[
    {
      id: "active-campaigns",
      label: "Active campaigns",
      value: kpis.data?.activeCampaigns ?? "—",
      loading: kpis.isPending,
      sub: "Currently live and accepting candidates",
      description: "Recruiting drives that are currently live and accepting candidates.",
      onClick: () => router.push("/campaigns"),
    },
    {
      id: "pipeline",
      label: "Candidates in pipeline",
      value: kpis.data?.candidateCount ?? "—",
      loading: kpis.isPending,
      delta: pipelineDelta,
      trend: pipelineTrend,
      sub: `${currentTotal} added in the last 7 days`,
      description: "Total candidates enrolled across your campaigns. The sparkline shows candidates added per day over the past two weeks.",
    },
    {
      id: "interviews",
      label: "Interviews this week",
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
      value: creditsRemaining ?? "—",
      loading: reports.isPending,
      progress:
        aiGranted != null ? { used: aiUsed, granted: aiGranted } : undefined,
      sub:
        creditsLow ? (
          <span className="text-destructive">
            90% of your AI interview allowance is used — upgrade to extend it.
          </span>
        ) : aiGranted != null ? (
          `${aiUsed} of ${aiGranted} used this month`
        ) : undefined,
      description: "AI interview credits left this billing month before hitting your tier limit.",
      onClick: () => router.push("/billing"),
    },
    {
      id: "offers-7d",
      label: "Offers sent (7d)",
      value: offers7d.current,
      loading: ledger.isPending,
      delta: offers7d.current - offers7d.prior,
      sub: `${offers7d.prior} in the prior week`,
      description: "Offer decisions recorded in your decision ledger over the last 7 days.",
    },
  ]}
/>
```

(The empty `sub` placeholder line `{sub ? <p ...>&nbsp;</p> : null}` from MetricCard's layout is intentionally gone — use `undefined` for absent subs so nothing renders.)

**Step 4: Replace every `SectionCard` with `DashboardSection` in the JSX**

All seven usages swap component name only (props already match). Keep the `lg:grid-cols-3` grid split, widget order, `ReportsNotice` placement, and all `EmptyState`/list markup except:

- **Recent activity** — drop the muted icon circle: remove the `flex h-7 w-7 ... rounded-full bg-muted` wrapper span; render the icon directly as `<Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.tone)} aria-hidden />`.

**Step 5: Typecheck + tests**

Run: `npm run typecheck` and `npx vitest run`
Expected: PASS (17 files / 70 tests + the new StatBand suite)

**Step 6: Commit**

```bash
git add apps/web/src/app/\(recruiter\)/dashboard/page.tsx
git commit -m "feat: cardless hairline dashboard"
```

---

### Task 5: Final verification gate

**Files:** none

**Step 1: Ensure port 3000 is free**

If a dev server is running, stop it (build fails into `.next` otherwise). Run: `netstat -ano | findstr :3000` — confirm no listener.

**Step 2: Clean + build**

Run (in `apps/web`): `rmdir /s /q .next && npm run build`
Expected: `Compiled successfully` with 13/13 static pages (dashboard is server-rendered client shell — same count as before).

**Step 3: Full re-verify**

Run: `npm test` and `npm run typecheck`
Expected: all passing.

**Step 4: Report**

Summarize the diff: 5 StatBand stats, cardless sections, files touched, and remind the user to restart `npm run dev` if it was stopped.

---

## Notes for the executor

- Repo root: `B:\Scalepods Hr SaaS`; run all npm commands in `apps/web`.
- Pre-commit hook: biome formatter + lint (`lint/suspicious/noArrayIndexKey` is on — never key lists by index) + commitlint (allowed: build,chore,ci,docs,feat,fix,perf,refactor,revert,style,test). Files need LF + trailing newline; if a hook rejects a file for formatting, normalize via a `node -e` one-liner (echo/Write both add problems).
- `skill()`, `glob`, `grep` tools are broken on this box (`powershell.exe` missing) — use Bash `findstr`/`dir` and Read/Edit.
- Do NOT touch: `apps/web/src/components/ui/card.tsx`, `MetricCard`, `SectionCard`, `CardGrid`, or any other page. Recruiter routes present: `/campaigns`, `/campaigns/new`, `/campaigns/[id]`, `/candidates/[id]`, `/billing`, `/settings` — there is NO `/candidates` list route, so only the campaigns and credits cells get `onClick`.
- Commits per task; never stage unrelated WIP (user has uncommitted changes in `README.md`, `apps/legacy/src/routes/Settings.tsx`, `apps/web/package.json`, auth/candidate-conduct/campaigns-id/settings pages, resume uploader files, `package-lock.json`, and old plan docs).