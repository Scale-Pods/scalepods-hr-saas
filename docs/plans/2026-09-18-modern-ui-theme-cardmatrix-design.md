# Design: 13a Modern-UI Retrofit (theming, card matrix, shell)

Date: 2026-09-18
Status: Approved ("build")

## Scope
Retrofit Section 13a of the build prompt onto the existing Vite SPA. Core pages,
webhooks, SQL migrations and edge functions are unchanged. Lean retrofit:
hand-rolled components stay; the only new dependency is `recharts` (sparklines).
`lucide-react` is already installed.

## Decisions
- Tailwind v4 class-based dark mode: `@custom-variant dark (&:where(.dark, .dark *));`
- CSS-variable tokens in `:root` / `.dark`, exposed as Tailwind utilities via `@theme inline`
  (bg-card, text-foreground, border-border, text-muted-foreground, bg-muted, bg-background, ring, charts).
- No next-themes (Vite, not Next). Custom `ThemeProvider` + `useTheme()`:
  light | dark | system, persisted as `scale-pods-theme` in localStorage, `.dark`
  on `<html>`, listens to `prefers-color-scheme`. FOUC guard = inline pre-paint
  script in `index.html`.
- Token sweep: map slate/* classes to semantic utilities across `src` via a script,
  then hand-fix stragglers and accent-50/700 active states with `dark:` variants.

## Components
- `CardGrid` — responsive grid wrapper `cols={{ base, sm, lg }}` / gap.
- `MetricCard` — label, tabular-nums value, optional delta chip (▲/▼ + %, green/red),
  optional 40px Recharts `<AreaChart>` sparkline (accent fill 10% opacity,
  `role="img"` + aria-label), optional icon + click-through, skeleton shimmer loading.
- `ThemeToggle` — Sun/Moon/Monitor cycle, mounted in the new top bar.
- `EmptyState` — icon + one-line message + primary CTA; applied to candidate tables,
  timeline, team members, slot picker, weekly lists.
- Shell: desktop top bar (theme toggle), sidebar collapse-to-icon-rail (persisted),
  "Recruiter" nav group label.

## Dashboard KPI matrix
Data sources are existing `/webhook/reports` (workflow 11) + RLS-scoped Supabase reads.
No new backend endpoints.

| KPI card | source |
|---|---|
| Active campaigns | campaigns (status=on) count |
| Candidates in pipeline | candidates count + 7d sparkline + delta from created_at buckets |
| Interviews this week | round_instances.scheduled_at count + delta vs prior week |
| AI credits remaining | reports.usage.ai_interview + TIER_LIMITS; warning chip <10% / <14d to billing_anchor_date |

Layout: 4-card KPI matrix; then `lg:grid-cols-3` — main (`lg:col-span-2`): funnel +
recent-activity feed (latest decision_ledger + audit_log); sidebar: interviews-today +
needs-your-review list cards. Existing usage bars / outreach cards retained.

## A11y
- Global `:focus-visible` ring from `--ring`.
- `prefers-reduced-motion` disables non-essential transitions.
- Charts carry `role="img"` + sr-only summary; status colors always paired with icons/labels.
- WCAG AA in both themes; `.dark` palette chosen for contrast.

## Cuts (explicit)
No cmdk palette, notifications bell, account switcher, admin/hiring-manager dashboards,
Framer Motion, Radix refactor. Bundle grows by recharts; chunk-size warning persists.

## Verification
typecheck, lint (0 errors), full test suite (existing 27 + new theme/card tests), production build.