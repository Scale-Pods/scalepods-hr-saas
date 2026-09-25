# Cake-Style Modern Dashboard Theme — Design

**Date:** 2026-09-23
**Status:** Approved

## Goal

Restyle the ScalePods recruiter app to match the Cake Equity dashboard
reference (flat, polished, purple `#6c5ce7` + lime `#c9e85c` brand, rounded
16px cards, pill buttons) while keeping **all functionality identical**.

## Decisions

- **Cards:** replace glassmorphism with **solid white cards** (subtle border +
  soft shadow, `rounded-2xl`). Remove the glass tokens, `.glass-glow` /
  `.glass-viewport` CSS, and the AppShell glow layer.
- **Brand:** **purple + lime** — primary `#6c5ce7` (hover `#4c3fc7`), accent
  `#ede9fe`, success lime `#c9e85c`, chart palette purple/lime/lavender.
- **Themes:** keep light **and** dark mode (`ThemeToggle` stays).
- **Shapes:** buttons → `rounded-full` pills; badges stay pills; nav active →
  purple-tinted pill; page titles bigger/bolder.
- **Functionality:** zero behavior changes — token swaps + class restyles on
  shared components only.

## Design

### 1. Theme tokens — `apps/web/src/app/globals.css`

**Light `:root`:**
- `--primary: #6c5ce7` · `--primary-foreground: #ffffff`
- `--accent: #ede9fe` · `--accent-foreground: #4c3fc7`
- `--success: #7a9b1e` (readable lime for light surfaces)
- `--ring: #6c5ce7`
- `--border: #e8e6ef` · `--background: #ffffff` · `--card: #ffffff`
- `--chart-1..5`: `#6c5ce7, #8b7af6, #b7aef0, #c9e85c, #4c3fc7`
- `--sidebar-primary: #6c5ce7` (light-mode active/filled items)
- Remove `--glass-*` and `--glow-opacity`.

**Dark `.dark`:**
- `--primary: #6c5ce7` · `--ring: #8b7af6`
- `--accent: #2a2440` · `--accent-foreground: #b7aef0`
- `--success: #c9e85c`
- keep existing dark `--background/--card/--border/--sidebar*`; set
  `--sidebar-primary: #8b7af6`
- Remove `--glass-*` and `--glow-opacity`.

Remove the whole glass block at the bottom of `globals.css`:
`.glass-glow`, `.glass-viewport [data-slot="card"]`, and its `:hover` rule.

(Metrics: `keka-landing` palette is page-scoped and untouched.)

### 2. Card base — `apps/web/src/components/ui/card.tsx`

`rounded-xl` → `rounded-2xl`. Keep `border bg-card` (now solid white / dark
surface) and `shadow-sm`. Glass rules no longer override it.

### 3. AppShell — `apps/web/src/components/shared/AppShell.tsx`

- Remove the `.glass-glow` div and the `glass-viewport relative z-10` wrapper.
- `<main>` back to `cn(collapsed ? "lg:pl-16" : "lg:pl-60")` (no `relative z-0`
  needed without the glow layer).
- Desktop header: `bg-card/80 backdrop-blur` → solid `bg-card`.
- Mobile header: `bg-card` already — leave.
- Banners (past_due / canceled): restyle to purple-tint (`bg-accent`) with a
  pill CTA feel; keep the exact conditional rendering + links.

### 4. Shell components (Cake shapes)

- **`Button` (`ui/button.tsx`):** base `rounded-lg` → `rounded-full`
  (including `xs`/`sm`/`lg`/`icon-*` for pill consistency). Variants unchanged.
- **`Badge`:** already `rounded-full` — no change needed.
- **`NavList` (`shared/NavList.tsx`):** active item → `bg-accent
  text-accent-foreground` (purple tint in light, lavender-tint on dark sidebar)
  replacing the solid `bg-sidebar-primary text-white shadow-sm` pill; keep the
  `rounded-lg` radius, hover behavior, and `aria-current`.
- **`PageHeader`:** title `text-2xl font-semibold` → `text-3xl font-bold`.

### 5. MetricCard tones — `shared/MetricCard.tsx`

Swap `TONE_TILES` to the Cake purple/lime family (literal arbitrary-value hex
classes so Tailwind emits them) and add a per-tone icon color:

| tone | gradient | icon color |
|------|----------|-----------|
| campaigns | `from-[#6c5ce7] to-[#4c3fc7]` | white |
| candidates | `from-[#8b7af6] to-[#5b4bd6]` | white |
| interviews | `from-[#a78bfa] to-[#7c5ce0]` | white |
| credits | `from-[#c9e85c] to-[#a7c63b]` | `#17161f` (dark, readable on lime) |
| custom | `from-[#6c5ce7] to-[#c9e85c]` | white |

Implementation: add a `TONE_ICON` lookup; the tile `span`/button uses
`TONE_ICON[tone ?? "custom"]` instead of a hardcoded `text-white`.

### 6. Auto-updating surfaces

Sparklines, funnel, usage/donut colors, progress fills (`bg-primary`), focus
rings, and success/status tones all derive from the theme tokens — updating
`--primary/--chart-*/--success/--ring` restyles them automatically.

### 7. Testing

- Existing tests (16 files / 65) assert text/roles/tone classes, not theme
  colors — expect zero changes; verify nothing asserts removed classes like
  `glass-viewport`.
- Gates: `npm test`, `npm run typecheck`, `npm run build` in `apps/web`
  (run ONLY with no dev server on :3000).

## Out of scope

- Page content/logic; auth, candidate portal, landing (`keka-landing`);
  generating pricing data; adding Cake widgets (donut/funding) to ScalePods.