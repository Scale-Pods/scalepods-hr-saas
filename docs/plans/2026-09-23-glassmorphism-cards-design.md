# Glassmorphism Cards — Design

**Date:** 2026-09-23
**Status:** Approved

## Goal

Restyle the shared dashboard cards (`Card`, `MetricCard`, `SectionCard`) with a
modern glassmorphism look, with an ambient gradient background behind them, in
both light and dark mode, across all recruiter-shell pages.

## Decisions

- Style direction: **Glassmorphism** (frosted translucent surfaces).
- Background: **Ambient gradient** — oversized blurred orbs behind content so
  the frosted cards have something to blur.
- Scope: **All pages via shared components** — anything rendered inside the
  recruiter `AppShell` gets the new look automatically.
- Theming: designed for **both light and dark mode**.
- Implementation approach: **Tokens + Card base** (Approach A).

## Design

### 1. Glass design tokens (`apps/web/src/app/globals.css`)

Add CSS variables and a Tailwind v4 `@utility` for the glass surface:

- Light theme: `bg white/55`, hairline border `white/50`, soft shadow,
  `backdrop-blur-xl`, subtle top-edge inner highlight.
- Dark theme: `bg white/[0.07]`, border `white/12`, slightly stronger shadow,
  same blur and inner highlight.

Define as CSS variables (`--glass-*`) in `:root` / `.dark`, expose via `@theme
inline`, and add a `glass-card` utility class that consumes them.

### 2. Ambient gradient background (`apps/web/src/components/shared/AppShell.tsx`)

In `AppShell`'s `<main>`, insert a fixed, `pointer-events-none` decorative layer
*behind* content with 2–3 oversized blurred orbs using existing chart colors
(`--chart-2`, `--chart-3`, `--chart-4`) at low opacity. Calmer in light mode,
more present in dark mode. No animation — respects `prefers-reduced-motion`.

### 3. Scope via wrapper class

- `AppShell` content wrapper gains a `glass-viewport` class.
- Glass styling applies only to the shared `Card` component **inside**
  `glass-viewport` (CSS scoped with `.glass-viewport [data-slot="card"]`).
- Result: all recruiter-shell pages (dashboard, campaigns, candidates,
  reporting, billing, settings) become glass automatically. Login, candidate
  portal, and `keka-landing` pages keep solid cards (no gradient behind them).

### 4. Nested surfaces stay intact

Popovers, dialogs, dropdowns, tables, and chips keep their solid
`bg-popover`/`bg-muted` surfaces. Only top-level cards go glassy; on first
render the `Card` base still needs an opaque fallback background so nothing is
unreadable before paint.

### 5. Readability & accessibility

- Keep existing foreground/text colors; delta chips, sparklines, and loading
  skeletons unchanged.
- Preserve clickable-card hover affordances; tune hover surface for glass.
- No new animations; honor `prefers-reduced-motion`.

### 6. Testing

- No existing test assertions change (`MetricCard.test`, `CardGrid.test`,
  `SectionCard`-adjacent tests assert text and existing utility classes).
- Visual smoke check in light + dark after implementation.

## Out of scope

- Non-recruiter shells (auth, candidate, landing).
- Popover/dialog/dropdown surfaces.
- Layout structure other than the new background layer.