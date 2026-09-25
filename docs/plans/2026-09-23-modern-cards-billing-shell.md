# Modern Metric Cards, Billing Upgrade Grid & Shell Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the dashboard KPI cards to a modern gradient-tile + trend-pill layout, replace the overflow-prone upgrade table with a responsive plan-cards grid, and give the shared recruiter shell a modern-template polish.

**Architecture:** Style-forward changes in shared components only — `MetricCard.tsx` restructure (backward-compatible props), the `TierCompareModal` in `billing/page.tsx` rewritten as a responsive plan grid, and three small shared-shell tweaks (`PageHeader`, `NavList`, `Button` radius). All changes land inside `apps/web`. Existing glass/gradient foundation is untouched.

**Tech Stack:** React 19, Next.js 15, Tailwind CSS v4, shadcn/ui components (Card, Dialog, Badge, Button), recharts (sparkline), lucide-react, Vitest.

**Reference design:** `docs/plans/2026-09-23-modern-cards-billing-shell-design.md`

**Working branch:** `feat/glassmorphism-cards` (head includes commits 3f31b5a, 93d4854).

---

## Task 1: Modern KPI MetricCard (gradient tile + trend pill)

**Files:**
- Modify: `apps/web/src/components/shared/MetricCard.tsx`
- Modify: `apps/web/src/components/shared/MetricCard.test.tsx` (only if the delta-pill markup changes asserted classes)
- Modify: `apps/web/src/app/(recruiter)/dashboard/page.tsx` (pass `tone` to each MetricCard)
- Test: `apps/web/src/components/shared/MetricCard.test.tsx`

**Step 1: Update `MetricCard.tsx`**

- Add `tone?: MetricTone` prop. Define:
  ```ts
  type MetricTone = "campaigns" | "candidates" | "interviews" | "credits" | "custom";
  ```
  Map tones to gradient utilities via a lookup:
  ```ts
  const TONE_TILES: Record<MetricTone, string> = {
    campaigns: "bg-gradient-to-br from-sky-400 to-sky-600",
    candidates: "bg-gradient-to-br from-chart-1 to-emerald-600",
    interviews: "bg-gradient-to-br from-amber-400 to-amber-600",
    credits: "bg-gradient-to-br from-violet-400 to-violet-600",
    custom: "bg-gradient-to-br from-chart-2 to-chart-3",
  };
  ```
  Default the tile to `custom` when no `tone` prop given.

- Icon container: replace `bg-primary/10` / `bg-primary/10 text-primary` square with a rounded gradient tile:
  ```tsx
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-sm shadow-sky-500/20">
    <span className="text-white">{icon}</span>
  </span>
  ```
  (Tone-specific classes come from the lookup; the `shadow-.../20` may stay generic — use `shadow-md shadow-black/10` if the per-tone shadow classes get unwieldy.)

- Trend pill: replace the inline `DeltaIcon + deltaLabel` span with a pill badge:
  ```tsx
  <span
    role="img"
    aria-label={`${deltaLabel} vs previous period`}
    className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
      deltaTone, // keep text-success / text-destructive / text-muted-foreground classes
    )}
  >
    <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
    {deltaLabel}
  </span>
  ```
  IMPORTANT: keep the same tone classes (`text-success`, `text-destructive`, `text-muted-foreground`) and the same `aria-label` so existing tests keep passing. The visual change is the pill container + background-fill only.

- Keep everything else: `loading` skeleton, sparkline footer, `sub`, click affordance, popover description, layout structure.

**Step 2: Dashboard passes `tone`** in `dashboard/page.tsx`:
- Active campaigns → `tone="campaigns"`
- Candidates in pipeline → `tone="candidates"`
- Interviews this week → `tone="interviews"`
- AI credits remaining → `tone="credits"`

**Step 3: Run tests**

Run: `npm test` from `apps/web`
Expected: `MetricCard.test` still green (14 files → 16 files mature). If the test suite is now larger (the extra files from the earlier session), pass is `Test Files >= 16`, `Tests >= 68`.

**Step 4: Commit**

```bash
git add apps/web/src/components/shared/MetricCard.tsx apps/web/src/components/shared/MetricCard.test.tsx apps/web/src/app/\(recruiter\)/dashboard/page.tsx
git commit -m "feat: modern gradient-tile KPI cards with trend pills"
```
(Only these files — never stage user WIP.)

---

## Task 2: Upgrade dialog → responsive plan cards grid

**Files:**
- Modify: `apps/web/src/app/(recruiter)/billing/page.tsx`

**Step 1: Rewrite `TierCompareModal`**

Replace the `<table>` inside `DialogContent` (currently `max-w-4xl` + `overflow-x-auto` table) with:

- Keep the trigger button and `Dialog`/`DialogHeader`/`DialogTitle` as-is (dialog controlled by `compareOpen`).
- `DialogContent` → `max-w-5xl`.
- Body: a plan-card grid:
  ```tsx
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {TIER_ORDER_COMPARE.map((t) => {
      const limits = TIER_LIMITS[t];
      const isCurrent = t === currentTier;
      return (
        <div
          key={t}
          className={cn(
            "flex flex-col gap-3 rounded-xl border p-4",
            isCurrent
              ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground">{limits.label}</p>
            {isCurrent ? (
              <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
                Current
              </Badge>
            ) : null}
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {COMPARE_METRICS.slice(0, 4).map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-2">
                <span>{m.label}</span>
                <span className="font-medium text-foreground tabular-nums">
                  {m.format(limits)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-1">
            {t === "enterprise" ? (
              <Button variant="outline" className="w-full" size="sm">
                Contact sales
              </Button>
            ) : (
              <Button variant={isCurrent ? "outline" : "default"} className="w-full" size="sm">
                {isCurrent ? "Current plan" : "Upgrade"}
              </Button>
            )}
          </div>
        </div>
      );
    })}
  </div>
  ```
- Keep the footnote paragraph and its conditional text at the bottom (adjust `overflow` so it scrolls inside the dialog on short screens: wrap grid in a `max-h-[70vh] overflow-y-auto pr-1` container if needed).
- Remove the now-unused `FEATURE_ROWS` table rendering; keep `COMPARE_METRICS` (used for the 4-row limit list). Remove `tierAtLeast` import if it becomes unused.

**Step 2: Typecheck + tests**

Run: `cd apps/web && npm run typecheck`
Expected: clean.

Run: `npm test`
Expected: all pass.

**Step 3: Commit**

```bash
git add apps/web/src/app/\(recruiter\)/billing/page.tsx
git commit -m "feat: replace upgrade compare table with responsive plan cards"
```

---

## Task 3: Shell polish (PageHeader, NavList, Button)

**Files:**
- Modify: `apps/web/src/components/shared/PageHeader.tsx`
- Modify: `apps/web/src/components/shared/NavList.tsx`
- Modify: `apps/web/src/components/ui/button.tsx`

**Step 1: PageHeader**

Change the `<h1>` from `text-xl` to `text-2xl`, keep `font-semibold tracking-tight`.

**Step 2: NavList**

- Inactive link: `rounded-xl` → `rounded-lg` (both normal and collapsed variants), keep `px-3 py-2.5` and hover styles.
- Active item: keep the `bg-sidebar-primary text-white shadow-sm shadow-black/20` pill — only radius changes to `rounded-lg`.

**Step 3: Button base radius**

In `buttonVariants` base string, `rounded-md` → `rounded-lg`. Leave variant/size classes untouched.

**Step 4: Tests**

Run: `npm test` and `npm run typecheck` from `apps/web`
Expected: all pass (NavList/PageHeader tests assert roles/text, not radius classes — verified in advance).

**Step 5: Commit**

```bash
git add apps/web/src/components/shared/PageHeader.tsx apps/web/src/components/shared/NavList.tsx apps/web/src/components/ui/button.tsx
git commit -m "style: polish shared shell for modern template feel"
```

---

## Task 4: Final verification

**Step 1: Full check** from `apps/web`:
- `npm test` → all pass
- `npm run typecheck` → clean
- `npm run build` → production build succeeds (do NOT run while a dev server is live — kills port conflicts; restart dev afterwards)

**Step 2: Visual smoke (human)**
- `/dashboard`: gradient icon tiles on all 4 KPI cards, trend pills, glass still visible.
- `/billing` → Upgrade: plan cards grid fits the viewport at desktop and mobile widths; Current plan highlighted.
- Sidebar nav + page headers look polished; buttons have softer corners throughout.

**Step 3: Report**

Summarize changed files, commits, and any deviations.

---

## Out of scope
- Pricing data / Stripe product mapping (none exists in code).
- Billing usage & top-up sections.
- Auth / candidate / landing shells.