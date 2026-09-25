# Glassmorphism Cards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the shared `Card` components with a frosted-glass look plus an ambient gradient background, across all recruiter-shell pages, in light and dark mode.

**Architecture:** Pure CSS approach — add `--glass-*` design tokens to `globals.css`, style cards via a scoped `.glass-viewport [data-slot="card"]` selector (so only surfaces inside the recruiter shell go glassy), and render a fixed, pointer-events-none gradient orb layer in `AppShell` behind the content. No component logic changes, so existing tests stay green.

**Tech Stack:** Tailwind CSS v4 (PostCSS), React 19, Next.js 15, shadcn/ui `Card`, Vitest.

**Reference design:** `docs/plans/2026-09-23-glassmorphism-cards-design.md`

---

## Task 1: Add glass tokens + card + glow styles to globals.css

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Step 1: Add the glass design tokens**

In the existing `:root { ... }` block add a `--glass-*` token group and to the `.dark { ... }` block add its dark equivalents:

```css
:root {
  /* ...existing tokens... */
  --glass-bg: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(255, 255, 255, 0.55);
  --glass-highlight: rgba(255, 255, 255, 0.75);
  --glass-shadow: 0 10px 30px -12px rgb(18 26 38 / 0.25);
  --glass-blur: 24px;
  --glow-opacity: 0.25;
}

.dark {
  /* ...existing tokens... */
  --glass-bg: rgba(255, 255, 255, 0.07);
  --glass-border: rgba(255, 255, 255, 0.12);
  --glass-highlight: rgba(255, 255, 255, 0.18);
  --glass-shadow: 0 12px 32px -16px rgb(0 0 0 / 0.55);
  --glass-blur: 24px;
  --glow-opacity: 0.45;
}
```

**Step 2: Add the scoped card styling + glow utility**

Append a NEW block at the END of `globals.css`, **un-layered** (no `@layer` wrapper).
> Why un-layered: the shadcn `Card` applies utilities `bg-card`, `shadow-sm`, and
> `border-*`. Tailwind v4 orders CSS layers `theme, base, components, utilities`,
> so rules in `@layer components` would LOSE to those utilities and the glass
> background/shadow would never render. Un-layered author styles beat every
> `@layer`, so the glass surface reliably wins inside `.glass-viewport`.

```css
  .glass-glow {
    background:
      radial-gradient(
        closest-side at 15% 25%,
        color-mix(in srgb, var(--chart-2) 45%, transparent),
        transparent
      ),
      radial-gradient(
        closest-side at 85% 15%,
        color-mix(in srgb, var(--chart-3) 35%, transparent),
        transparent
      ),
      radial-gradient(
        closest-side at 70% 80%,
        color-mix(in srgb, var(--chart-4) 30%, transparent),
        transparent
      );
    opacity: var(--glow-opacity);
  }

  .glass-viewport [data-slot="card"] {
    background: var(--glass-bg);
    border-color: var(--glass-border);
    box-shadow:
      var(--glass-shadow),
      inset 0 1px 0 0 var(--glass-highlight);
    -webkit-backdrop-filter: blur(var(--glass-blur));
    backdrop-filter: blur(var(--glass-blur));
  }

  .glass-viewport [data-slot="card"]:hover {
    background: color-mix(in srgb, var(--glass-bg) 92%, var(--card));
  }
```

**Step 3: Verify existing styles compile**

Run: `npm run test` from `apps/web`
Expected: All existing tests pass (no component markup changed).

**Step 4: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "style: add glassmorphism design tokens and glass card styling"
```

---

## Task 2: Add ambient gradient layer + glass-viewport wrapper to AppShell

**Files:**
- Modify: `apps/web/src/components/shared/AppShell.tsx:149-173`

**Step 1: Update the main content region**

Replace the existing `<main>` block (the `collapsed ? "lg:pl-16" : "lg:pl-60"` wrapper) with one that sets up a relative stacking context, the glow layer, and the scoped content wrapper:

```tsx
<main className={cn("relative z-0", collapsed ? "lg:pl-16" : "lg:pl-60")}>
  <div
    aria-hidden
    className="glass-glow pointer-events-none absolute inset-0 -z-10"
  />
  {billingStatus === "past_due" ? ( /* keep existing banner */ ) : null}
  {billingStatus === "canceled" ? ( /* keep existing banner */ ) : null}
  <div className="glass-viewport relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    {children}
  </div>
</main>
```

Notes:
- Keep the two billing banner blocks exactly as they are now.
- `relative z-0` on `<main>` is REQUIRED: `position: relative` with `z-index: auto` does NOT create a stacking context, so the `-z-10` glow would escape beneath AppShell's opaque `bg-background` wrapper div and be invisible. `z-0` traps the glow above the root background but below the `z-10` content wrapper.

**Step 2: Verify**

Run: `cd apps/web && npm run typecheck`
Expected: No TypeScript errors.

Run: `npm run test`
Expected: All existing tests pass.

**Step 3: Manual smoke check**

Run: `npm run dev` (from `apps/web`), open `/dashboard`.
- Light mode: cards look translucent (frosted) over soft chart-colored orbs; text and chips fully readable.
- Toggle dark via the ThemeToggle: cards appear dark-frosted, orbs slightly brighter.
- Click a MetricCard to confirm hover affordance still works.
- Navigate to `/campaigns` and a candidate page inside the recruiter shell — cards are glass there too.
- Open `/auth` and a candidate page (e.g. `/candidates/...` via browser) — cards stay solid (no glass), confirming the wrapper scoping works.

**Step 4: Commit**

```bash
git add apps/web/src/components/shared/AppShell.tsx
git commit -m "feat: add ambient gradient background behind glass cards in app shell"
```

---

## Task 3: Tone values (visual tuning)

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Step 1: Adjust opacities if needed**

After the smoke check, tune readability: if text sits on glass that is too transparent in light mode, raise `--glass-bg` alpha (e.g. `0.55` → `0.68`) and/or lower `--glow-opacity`. If dark-mode text feels hazy, raise `--glass-bg` alpha in `.dark` slightly.

**Step 2: Verify**

Re-run `npm run test` and repeat the manual smoke check in both themes.

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "style: tune glass opacity for readability"
```

---

## Task 4: Final verification

**Step 1: Full check**

From `apps/web`:
- `npm run test` → all pass
- `npm run typecheck` → clean
- `npm run build` → production build succeeds (Next.js 15)

**Step 2: Report**

Summarize changed files, the token values, and any tuning made in Task 3.

---

## Out of scope
- Auth, candidate portal, and `keka-landing` card styling (intentionally excluded via `glass-viewport` scoping).
- Popover, dialog, dropdown, table, and chip surfaces (they never carry `data-slot="card"`).