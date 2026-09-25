# Modern Metric Cards, Billing Upgrade Grid & Shell Polish — Design

**Date:** 2026-09-23
**Status:** Approved

## Goal

Three coordinated UI upgrades on top of the glassmorphism foundation:
modern SaaS-style KPI metric cards, a screen-fitting plan-cards upgrade dialog,
and a "modern template" polish pass across the shared recruiter shell.

## Decisions

- KPI cards: **gradient icon tile + trend pill** (like Supabase/PostHog).
- Upgrade dialog: replace the 5-column compare table with a **responsive plan
  cards grid**.
- Template polish: **entire shell**, via shared components (PageHeader, NavList,
  Button radius).
- No invented pricing data — plan cards use real `TIER_LIMITS`/`TierLimits`.

## Design

### 1. Modern KPI cards — `apps/web/src/components/shared/MetricCard.tsx`

- Add a `tone` prop selecting a gradient color pair; default cycles `chart-1..5`.
  Icon renders in a rounded gradient tile (subtle shadow) instead of the flat
  `bg-primary/10` square.
- Replace the inline arrow delta with a **trend pill** badge beside the value:
  green (up), red (down), neutral (flat), with arrow icon + signed number.
- Keep: big `value`, `sub`, sparkline footer, `loading`, click affordance,
  description popover, and existing prop API (fully backward compatible).
- Existing tests remain valid (`text-destructive` on negative delta keeps or is
  migrated deliberately — confirm class stays for the red pill).

### 2. Upgrade modal → plan cards grid — `apps/web/src/app/(recruiter)/billing/page.tsx`

- Replace the `TierCompareModal` table with a responsive tier grid
  (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, `max-w-5xl`, `overflow-y-auto`
  friendly so it always fits the viewport).
- Each card (from `TIER_ORDER_COMPARE`): plan label; "Current plan" badge +
  ring when `t === currentTier`; key limits (compacted subset of
  `COMPARE_METRICS`); feature checkmarks; Upgrade CTA — for `free/basic/growth`
  render an Upgrade button (keeps current behavior/no-op → comparison), for
  Enterprise show "Contact sales" placeholder button (no price/Stripe mapping
  exists in code — no purchased flow invented).
- The `zap` Upgrade trigger on the page header stays as the landing point for
  new usage.

### 3. Shell polish (modern template) — shared components

- **`PageHeader`**: title `text-xl` → `text-2xl`, tightened spacing.
- **`NavList`**: inactive rows `rounded-xl` → softer `rounded-lg`; keep active
  pill (solid `bg-sidebar-primary`) for contrast on the dark sidebar.
- **`Button`** (`ui/button.tsx`): `rounded-md` → `rounded-lg` for the default
  radius — modern, matches cards.
- All three are shared → change lands on every recruiter page automatically.

### 4. Layering context (from glassmorphism work)

Cards inside `.glass-viewport` already get translucent glass + blur. The new
gradient tiles/pills are inside cards, so their colors render normally; add
nothing glass-specific.

### 5. Testing

- `MetricCard.test.tsx`: update expectations to the trend-pill markup if the
  delta chip class changes; keep behavior assertions.
- `NavList.test.tsx` / `PageHeader.test.tsx`: class-based assertions adjusted
  only if they target the changed radius/size.
- Automated gates: `npm test`, `npm run typecheck`, `npm run build` in
  `apps/web`.

## Out of scope

- Pricing/Billing amounts & Stripe product mapping (no data exists).
- Rewriting the billing usage/top-up sections.
- Non-recruiter shells (auth, candidate, landing).