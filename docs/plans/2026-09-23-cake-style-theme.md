# Cake-Style Modern Dashboard Theme — Implementation Plan

**Date:** 2026-09-23
**Depends on:** `docs/plans/2026-09-23-cake-style-theme-design.md` (approved)
**Branch:** `feat/glassmorphism-cards` (current)
**Files:** all under `apps/web` — no other workspace packages.

## Overview

Swap the app theme from green glassmorphism to the flat Cake-style look:
purple `#6c5ce7` + lime `#c9e85c` brand on solid white cards (dark mode kept
and re-tinted), pill buttons, purple-tinted active nav and banners, bigger page
titles, purple gradient KPI tiles. **No behavior changes anywhere.**

High level:
1. Replace theme tokens in `globals.css` and delete the glass CSS machinery.
2. Remove the glass/glow bits from `AppShell` and solid-body its header + banner.
3. Restyle shared leaf components (`Button`, `Card`, `NavList`, `PageHeader`).
4. Re-map `MetricCard` tone tiles to the purple/lime family.
5. Verify: typecheck, full test suite, production build.

## Preconditions (operator, once)

- No dev server running on :3000 (a live `next dev` corrupts `.next` for the
  build step).
- Working tree has unrelated uncommitted WIP + untracked docs — never stage
  with `-A`/`.`; stage only files touched by the tasks.

## Task 1 — Theme tokens + remove glass CSS

**File:** `apps/web/src/app/globals.css`

Light `:root`:
- `--background: #ffffff`
- `--primary: #6c5ce7`
- `--accent: #ede9fe`, `--accent-foreground: #4c3fc7`
- `--success: #7a9b1e` (readable lime on white; stays tone-neutral enough for
  `bg-success/10` tints)
- `--ring: #6c5ce7`
- `--border: #e8e6ef`
- `--chart-1: #6c5ce7`, `--chart-2: #8b7af6`, `--chart-3: #b7aef0`,
  `--chart-4: #c9e85c`, `--chart-5: #4c3fc7`
- `--sidebar-primary: #6c5ce7`
- Delete `--glass-bg`, `--glass-border`, `--glass-highlight`, `--glass-shadow`,
  `--glass-blur`, `--glow-opacity`.

Dark `.dark`:
- `--primary: #6c5ce7`
- `--accent: #2a2440`, `--accent-foreground: #b7aef0`
- `--success: #c9e85c`
- `--ring: #8b7af6`
- `--chart-1: #8b7af6`, `--chart-2: #6c5ce7`, `--chart-3: #b7aef0`,
  `--chart-4: #c9e85c`, `--chart-5: #4c3fc7`
- `--sidebar-primary: #8b7af6`
- Delete `--glass-bg`, `--glass-border`, `--glass-highlight`, `--glass-shadow`,
  `--glass-blur`, `--glow-opacity`.

Delete the trailing CSS block (`.glass-glow` and `.glass-viewport
[data-slot="card"]` + its `:hover` rule).

Untouched: `.keka-landing` palettes, `@theme`, `@theme inline`, `@layer base`.

**AC:** `globals.css` has no `glass` matches; light/dark values match the table
above; `keka-landing` palettes byte-identical.

## Task 2 — AppShell: drop glass, solid header + accent banner

**File:** `apps/web/src/components/shared/AppShell.tsx`

- Delete the `<div aria-hidden className="glass-glow ..." />` line.
- `<main>` classes → `cn(collapsed ? "lg:pl-16" : "lg:pl-60")` (remove
  `relative z-0`).
- Replace the `<div className="glass-viewport relative z-10 ...">` wrapper with
  a plain `<div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">`.
- Desktop header: `bg-card/80 ... backdrop-blur` → solid `bg-card` (drop the
  `/80` and `backdrop-blur`).
- Follow-up banner (`billingStatus === "past_due"`): `bg-warning/15
  text-warning` → `bg-accent text-accent-foreground`; keep conditional render,
  the copy, and the `/billing` link (link keeps its underline styling).
- `canceled` banner: unchanged (already `bg-muted text-muted-foreground`).

KEEP: mobile header, `Sheet`, sidebar block, sign-out, collapse toggle — all byte-identical.

**AC:** no `glass`/`backdrop-blur`/`bg-card/80` in the file; both banners and
all nav still render with identical copy/links (spot-check via the existing
AppShell usage in `app/(recruiter)/layout.tsx` if present).

## Task 3 — Shared component shapes

**Files:**
- `apps/web/src/components/ui/button.tsx`
  - base string `rounded-lg` → `rounded-full`
  - `xs` and `icon-xs` sizes: `rounded-md` → `rounded-full` (only those two;
    remove now-redundant `rounded-lg` on `sm`/`lg`).
  - All variants (`default`/`outline`/`ghost`/`secondary`/`link`/`destructive`)
    untouched.
- `apps/web/src/components/ui/card.tsx`
  - base `rounded-xl` → `rounded-2xl`. Everything else unchanged.
- `apps/web/src/components/shared/NavList.tsx`
  - active classes `bg-sidebar-primary text-white shadow-sm shadow-black/20` →
    `bg-accent text-accent-foreground` (works in both themes since `--accent`
    now tints purple in light, lavender on the dark sidebar in dark).
  - Keep `rounded-lg`, the `hover:bg-sidebar-accent` inactive style,
    `aria-current`, and the Recruiter label.
- `apps/web/src/components/shared/PageHeader.tsx`
  - `<h1>`: `text-2xl font-semibold` → `text-3xl font-bold`. Keep
    `tracking-tight text-foreground`.

**AC:** buttons render as pills at every size; cards `rounded-2xl`; NavList
active = `bg-accent text-accent-foreground`; PageHeader h1 `text-3xl font-bold`.

## Task 4 — MetricCard purple/lime tiles

**File:** `apps/web/src/components/shared/MetricCard.tsx`

- Replace `TONE_TILES` with:

```ts
const TONE_TILES: Record<MetricTone, string> = {
  campaigns: "bg-gradient-to-br from-[#6c5ce7] to-[#4c3fc7]",
  candidates: "bg-gradient-to-br from-[#8b7af6] to-[#5b4bd6]",
  interviews: "bg-gradient-to-br from-[#a78bfa] to-[#7c5ce0]",
  credits: "bg-gradient-to-br from-[#c9e85c] to-[#a7c63b]",
  custom: "bg-gradient-to-br from-[#6c5ce7] to-[#c9e85c]",
};
```

- Add `TONE_ICON: Record<MetricTone, string>` with `text-white` for every tone
  except `credits: "text-[#17161f]"` (readable on lime).
- In the icon render (both the Popover-trigger branch and the plain `span`
  branch): replace the hardcoded `text-white` with
  `TONE_ICON[tone ?? "custom"]`; keep all other classes (`rounded-xl`, shadow,
  focus ring, sizes).

**AC:** `MetricCard.test.tsx` still passes (it only asserts delta tone text);
no `from-sky/emerald/amber/violet` remain in the file; lime tile has dark icon.

## Task 5 — Verification (operator + reviewer)

From `apps/web` (dev server must be stopped):
1. `npm run typecheck` — clean.
2. `npm test` — 16 files / 65 tests green.
3. `npm run build` — succeeds (expect ~70s+; clean `.next` first if previously
   corrupted).
4. Manual smoke (operator restarts `npm run dev`): dashboard cards are solid
   white with purple icons, accent nav pill, pill buttons, purple progress,
   lime success deltas, purple focus rings; dark toggle still works with purple
   accents; billing/campaigns/candidates/settings pages consistent.

## Commit strategy

- All five tasks are one logical restyle. Commit once after verification with
  a message like:
  `Cake-style theme: purple/lime tokens, solid cards, pill buttons, purple gradient KPI tiles`
- Stage ONLY the touched files: `globals.css`, `AppShell.tsx`, `button.tsx`,
  `card.tsx`, `NavList.tsx`, `PageHeader.tsx`, `MetricCard.tsx`.
- Do not commit any unrelated WIP or the `docs/plans/` files unless asked.