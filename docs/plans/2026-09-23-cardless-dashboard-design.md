# Cardless Modern SaaS Dashboard — Design

**Date:** 2026-09-23
**Status:** Approved

## Goal

Replace the card-based recruiter dashboard with a **modern SaaS "no cards"
dashboard**: flat, whitespace-first, secrets separated by hairlines
(border-rules) instead of bordered boxes. Keep the approved Cake purple/lime
tokens, both themes, and **all functionality identical**.

## Decisions

- **Stat band:** replace the 4 gradient `MetricCard` tiles with a flat
  **hairline stat band** — 5 top stats in an `lg:grid-cols-5` grid
  (`sm:grid-cols-2`, `base:grid-cols-1`), cells split by `lg:border-l
  border-border` (first cell no border). No background, no shadow, no box.
- **Sections:** replace `SectionCard` boxes with a cardless `DashboardSection`
  — plain `<section>`, header row (title + subtitle + optional action) closed
  with a `border-b border-border` hairline, content below.
- **Layout skeleton kept:** `lg:grid-cols-3` main grid with the 2/1 col split
  and the same widgets in the same order (Usage, funnel, recent activity left;
  source effectiveness, time-to-hire, upcoming interviews, needs review right).
- **Zero logic changes:** all hooks, routing, tier/credit math, loading and
  error states, and popover explanations stay as-is.
- **Scope:** only the recruiter dashboard page and the widget components it
  owns change. `MetricCard`, `SectionCard` and `CardGrid` remain in the repo
  for `billing`, `campaigns`, `settings` and `candidates/[id]`.

## Design

### 1. Stat band — new `components/dashboard/StatBand.tsx`

Props mirror the data the page already computes (per statistic):
`label`, `value`, `sub`, `delta?: number|null`, `trend?: number[]|null`,
`progress?: { used; granted } | null` (credits bar), `description`
(popover), `onClick`, `loading`.

Cell rendering (no Card):
- Label: `text-xs font-medium text-muted-foreground`
- Value: `text-3xl font-semibold tabular-nums tracking-tight`
- Delta chip: quiet, no pill — arrow icon + `+N`, tone `text-success` /
  `text-destructive` / `text-muted-foreground`, labelled
  `aria-label="{N} vs previous period"`
- Sub: `text-xs text-muted-foreground`
- Optional thin progress line (`h-1.5 rounded-full`, `bg-muted` track,
  `bg-success` fill; `bg-destructive` past 90%) under credits
- Optional mini sparkline (existing single-series `AreaChart` with
  `--chart-1`), passed as `trend`
- Info affordance: plain `Info` icon (`text-muted-foreground`) opening the
  existing explanation `Popover`; whole cell clickable → routed page
- Loading: plain `h-4` pulse skeleton lines (no box)

The 5 metrics (computed exactly as today, plus):
1. **Active campaigns** — `activeCampaigns`, click `/campaigns`, no delta
2. **Candidates in pipeline** — `candidateCount`, `pipelineDelta` +
   `pipelineTrend` sparkline, sub `{currentTotal} added in the last 7 days`,
   click `/campaigns/candidates` (existing KPI math unchanged)
3. **Interviews this week** — `interviewsThisWeek`, `interviewsDelta`, same sub
4. **AI credits remaining** — `creditsRemaining`, thin progress bar
   `used/granted`, existing 90% warning sub (destructive), click `/billing`
5. **Offers sent (7d)** — NEW, client-side from the already-fetched
   `useLedger` data: rows whose `stage` contains `"offer"` decided within the
   last 7 days vs the prior 7 → delta; sub "offer decisions in decision
   ledger"

### 2. Cardless sections — new `components/shared/DashboardSection.tsx`

Same props surface as `SectionCard` (`title`, `subtitle`, `action`,
`children`, `className`, `contentClassName`) so call sites swap cleanly.

```tsx
<section className={cn("py-5", className)}>
  <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
    <div>{title}{subtitle}</div>
    {action}
  </header>
  <div className={cn("pt-4", contentClassName)}>{children}</div>
</section>
```

### 3. Widget restyles

- **Usage** — `UsageBars` unchanged (rows are already cardless; 90%
  destructive logic stays).
- **Candidate funnel** — `FunnelChart`: track
  `rounded-md bg-muted` → `h-5 rounded-full bg-muted/60`; bar keeps
  `bg-primary` + value label; layout/data unchanged.
- **Recent activity** — plain `ul divide-y divide-border`; drop the muted
  icon circle (`bg-muted rounded-full`); quiet tinted icon inline
  (`text-destructive` / `text-success` / `text-chart-1` from `stageMeta`).
- **Time to hire** — unchanged (already a cardless 2×2 `dl` grid).
- **Source effectiveness** — `Table` unchanged (header + `border-b` rows
  already read as hairlines).
- **Upcoming interviews** — plain `divide-y divide-border` list.
- **Needs your review** — flat rows with `hover:bg-muted` affordance retained.
- **ReportsNotice** — swap `SectionCard` → `DashboardSection`, keep thin
  skeleton lines and the workflow-11 fallback copy.

### 4. Files

| File | Change |
|------|--------|
| `components/dashboard/StatBand.tsx` | new |
| `components/dashboard/StatBand.test.tsx` | new |
| `components/shared/DashboardSection.tsx` | new |
| `app/(recruiter)/dashboard/page.tsx` | use `StatBand` + `DashboardSection`; drop `CardGrid`/`MetricCard`/`SectionCard` imports; add offers-7d computation |
| `components/dashboard/ReportsNotice.tsx` | `SectionCard` → `DashboardSection` |
| `components/dashboard/FunnelChart.tsx` | hairline bar/track styling |

`components/shared/MetricCard.tsx` keeps its file (other pages use its
siblings) — the dashboard no longer imports it. `MetricCard.test.tsx` stays.

### 5. Testing

- New `StatBand.test.tsx` reusing the `MetricCard.test.tsx` pattern
  (ResizeObserver stub): renders value/sub/positive delta; destructive tone +
  aria for negative delta; labelled sparkline; skeleton while loading; info
  popover still opens; cell has button role when clickable.
- Existing suite (17 files / 70 tests) must keep passing — nothing changed in
  data, hooks, or shared primitives used elsewhere.
- Gates: `npm test`, `npm run typecheck`, `npm run build` in `apps/web`
  (build ONLY with no dev server on :3000).

## Out of scope

- Billing/campaigns/settings/candidates pages (keep cards); candidate portal;
  dark-theme token changes; new report fields; changing any data fetch.