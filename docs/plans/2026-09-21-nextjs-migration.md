# Next.js Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the ScalePods recruiting SaaS from a Vite 6 + React 19 SPA to the mandated Next.js 15 App Router stack (TanStack Query v5, Zustand, RHF+Zod, shadcn/ui, next-themes, Biome, Playwright, MSW) with zero broken intermediate states.

**Architecture:** Monorepo via npm workspaces. The existing Vite app is moved to `apps/legacy/` and keeps running (and passing its 64 tests) untouched. The new Next.js app lives in `apps/web/`. Domain logic that must not drift (Zod schemas, tier limits, cadence, formatting, webhook contract) moves to `packages/core/` and is consumed by **both** apps, so parity is provable. Route groups are ported one at a time; when `apps/web` reaches parity, `apps/legacy` is deleted and `apps/web` is promoted to the root.

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript (strict), Tailwind CSS v4, shadcn/ui (Radix), TanStack Query v5, Zustand, React Hook Form + Zod, next-themes, Recharts, Supabase JS v2, Vitest + RTL, MSW, Playwright, Biome.

---

## Open Decisions & Spec Contradictions (resolve before Phase 1)

These are blockers that must be answered by the human owner. Recommended defaults are stated so execution can proceed if no objection is raised.

| # | Issue | Recommended default |
|---|-------|---------------------|
| D1 | Spec mandates Next.js but references `VITE_N8N_BASE_URL`. Next uses `NEXT_PUBLIC_*` (client) / unprefixed (server). | Rename to `NEXT_PUBLIC_N8N_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only). |
| D2 | Referenced **Section 13 / 13a / 13c / 4.1 / 3.2** are not in the repo or the prompt. | Do not guess. Phase 1 uses the contracts already encoded in `apps/legacy/src/lib/*` as the source of truth until 13 is provided. |
| D3 | Tooling: repo uses ESLint 9; spec allows "Biome or ESLint+Prettier". | Adopt **Biome** for new `apps/web`; leave legacy ESLint in place until cutover. |
| D4 | shadcn/ui (Radix) vs existing custom primitives + `@headlessui/react`. | shadcn/ui in `apps/web`; delete custom primitives only at cutover. |
| D5 | Chart library: spec says pick one. | **Recharts** (already used; keep one lib everywhere). |
| D6 | Tier-limit status codes (402 vs 403) — spec says verify against workflow 7. Legacy code treats **402** as the tier-limit block (`TierLimitError`). | Phase 1 encodes a single `WorkflowError` that maps 402/403 → tier state; reconcile when Section 13 lands. |
| D7 | Not a git repository (`NO_GIT_DIR`). Conventional Commits, commitlint, CI all require git. | `git init` in Phase 0. |
| D8 | Auth: legacy is Supabase session in React context via `react-router`. Next needs server-cookie sessions + middleware. | Use `@supabase/ssr` with cookie storage; middleware guards `(recruiter)`; `(candidate)` stays public token-gated. |

---

## Phase Overview

- **Phase 0 — Repo & tooling foundation** (git init, workspaces, move legacy, CI skeleton)
- **Phase 1 — Next.js scaffold + shared core** (Next app, Tailwind v4, env validation, TanStack Query, Zustand, net/theme, webhook client, `packages/core`)
- **Phase 2 — Auth + AppShell + shared components** (Supabase SSR auth, middleware, shadcn shell, MetricCard/CardGrid/PageHeader/TierLimitToast)
- **Phase 3 — Recruiter features** (dashboard, campaigns list/new/detail, candidate profile, billing, settings, auth pages)
- **Phase 4 — Candidate flows** (book, interview check/conduct/thanks, assignment, shared shell)
- **Phase 5 — Testing & CI** (MSW integration, Playwright critical paths, CI pipeline)
- **Phase 6 — Perf, a11y, cutover** (Lighthouse CI, axe-core, delete `apps/legacy`, promote `apps/web`)

Each phase ends green: `biome ci`, `tsc --noEmit`, `vitest run`, `next build`.

---

## Phase 0 — Repo & Tooling Foundation

### Task 0.1: Initialize git and vendor baseline

**Files:**
- Create: `.gitignore`
- Create: `.gitattributes`

**Step 1:** Initialize the repository.

Run: `git init` (workdir `B:\Scalepods Hr SaaS`)
Expected: `Initialized empty Git repository in .../.git/`

**Step 2:** Create `.gitignore`.

```gitignore
node_modules/
.next/
dist/
coverage/
playwright-report/
test-results/
.env
.env.local
.env.*.local
!.env.example
*.log
.DS_Store
```

**Step 3:** Commit the current working app as the "before" snapshot so every migration diff is reviewable.

```bash
git add -A
git commit -m "chore: baseline Vite SPA before Next.js migration"
```

Expected: commit created; `git log --oneline` shows one commit.

### Task 0.2: Move legacy app into `apps/legacy` and add npm workspaces

**Files:**
- Modify: `package.json` (root becomes workspace root)
- Create: `apps/legacy/package.json` (moved from root)
- Create: `packages/core/package.json`

**Step 1:** Create directories.

Run: `mkdir apps packages\core`

**Step 2:** `git mv` the legacy Vite app files into `apps/legacy`.

```bash
git mv src apps/legacy/src
git mv public apps/legacy/public
git mv index.html apps/legacy/index.html
git mv vite.config.ts apps/legacy/vite.config.ts
git mv vitest.config.ts apps/legacy/vitest.config.ts
git mv eslint.config.js apps/legacy/eslint.config.js
git mv tsconfig.json apps/legacy/tsconfig.json
git mv tsconfig.app.json apps/legacy/tsconfig.app.json
git mv tsconfig.node.json apps/legacy/tsconfig.node.json
git mv package.json apps/legacy/package.json
git mv package-lock.json apps/legacy/package-lock.json
```

**Step 3:** Create the root workspace `package.json`.

```json
{
  "name": "scalepods",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:legacy": "npm run dev --workspace apps/legacy",
    "dev": "npm run dev --workspace apps/web",
    "build": "npm run build --workspace apps/web",
    "lint": "biome ci .",
    "format": "biome format --write .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  }
}
```

**Step 4:** Verify legacy still runs.

Run: `npm install` then `npm run dev:legacy`
Expected: Vite dev server starts on `:5173` with no errors. Stop it.

**Step 5:** Commit.

```bash
git add -A
git commit -m "chore: extract legacy Vite app into apps/legacy workspace"
```

### Task 0.3: Create the shared `packages/core` skeleton

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Move: `apps/legacy/src/lib/{cadence,tier,format,reports,parse-resume}.ts` → `packages/core/src/`

**Step 1:** Create `packages/core/package.json`.

```json
{
  "name": "@scalepods/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.24.1" }
}
```

**Step 2:** Create `packages/core/tsconfig.json` with `strict: true`, `moduleResolution: "bundler"`, `noEmit: true`.

**Step 3:** Move the pure-domain modules (no React, no Supabase) into core and re-export from `index.ts`.

```ts
export * from "./cadence";
export * from "./tier";
export * from "./format";
export * from "./reports";
export * from "./parse-resume";
```

**Step 4:** Add `"@scalepods/core": "*"` to `apps/legacy/package.json` dependencies and update legacy imports from `../lib/tier` to `@scalepods/core`.

**Step 5:** Run legacy tests.

Run: `npm run test --workspace apps/legacy`
Expected: `Tests 64 passed (64)` — proves the move is behavior-preserving.

**Step 6:** Commit.

```bash
git add -A
git commit -m "refactor: extract pure domain logic to @scalepods/core"
```

### Task 0.4: Add Biome and a CI skeleton

**Files:**
- Create: `biome.json`
- Create: `.github/workflows/ci.yml`

**Step 1:** Install Biome at the root: `npm i -D -w . @biomejs/biome`.

**Step 2:** Create `biome.json` (recommended: `linter.enabled`, `formatter.indentStyle: "space"`, `indentWidth: 2`, `organizeImports.enabled`, `vcs.useIgnoreFile: true`).

**Step 3:** Create `.github/workflows/ci.yml` running on PR: checkout → setup-node 22 → `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test`.

**Step 4:** Verify: `npx biome ci .`
Expected: no errors (legacy files may be excluded via `biome.json` `files.ignore: ["apps/legacy/**"]` for now).

**Step 5:** Commit.

```bash
git add -A
git commit -m "chore: add Biome and CI workflow"
```

---

## Phase 1 — Next.js Scaffold + Shared Core Runtime

### Task 1.1: Scaffold `apps/web` (Next.js 15, App Router, TS, Tailwind v4)

**Files:**
- Create: `apps/web/**` (via create-next-app), then customised

**Step 1:** Scaffold.

Run (workdir `B:\Scalepods Hr SaaS`):
`npx create-next-app@latest apps/web --ts --app --tailwind --eslint=false --src-dir --import-alias "@/*" --use-npm`

Expected: `apps/web` created; `npm run dev --workspace apps/web` serves on `:3000`.

**Step 2:** Replace root layout metadata with ScalePods metadata and remove the default page.

**Step 3:** Verify `npm run build --workspace apps/web` succeeds.

**Step 4:** Commit: `feat(web): scaffold Next.js 15 app`.

### Task 1.2: Wire Tailwind v4 theme tokens (reuse the HR-kit palette)

**Files:**
- Create: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`

**Step 1:** Copy the `:root` / `.dark` token blocks and the `@theme inline` mapping from `apps/legacy/src/index.css` verbatim (minus the `.keka-landing` block, which is landing-only and handled separately).

**Step 2:** Verify the tokens render: a temporary page using `bg-background text-foreground` shows the kit colors in both themes.

**Step 3:** Commit: `feat(web): port HR-kit design tokens to Tailwind v4`.

### Task 1.3: Typed, build-time-validated env

**Files:**
- Create: `apps/web/src/env.ts`
- Create: `apps/web/.env.example`

**Step 1: Write the failing test.**

```ts
// apps/web/src/env.test.ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("throws listing every missing key", () => {
    expect(() => parseEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
  it("accepts a complete env", () => {
    const env = parseEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "k",
      NEXT_PUBLIC_N8N_BASE_URL: "https://n8n.test",
      NEXT_PUBLIC_APP_ORIGIN: "http://localhost:3000",
    });
    expect(env.NEXT_PUBLIC_N8N_BASE_URL).toBe("https://n8n.test");
  });
});
```

**Step 2:** Run `npm run test --workspace apps/web`.
Expected: FAIL — `parseEnv` not defined.

**Step 3: Implement.**

```ts
// apps/web/src/env.ts
import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_N8N_BASE_URL: z.string().url(),
  NEXT_PUBLIC_APP_ORIGIN: z.string().url(),
});

export type Env = z.infer<typeof schema>;
export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      "Invalid environment: " +
        parsed.error.issues.map((i) => i.path.join(".")).join(", ")
    );
  }
  return parsed.data;
}
export const env = parseEnv(process.env);
```

**Step 4:** Run tests → PASS. Import `env` in `next.config.ts` so a missing var fails the build.

**Step 5:** Commit: `feat(web): add Zod-validated env`.

### Task 1.4: Single Supabase client (browser + server) and QueryClient

**Files:**
- Create: `apps/web/src/lib/supabase/client.ts`
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/query-client.ts`
- Create: `apps/web/src/app/providers.tsx`

**Step 1:** Install `@supabase/ssr @tanstack/react-query @tanstack/react-query-devtools zustand next-themes`.

**Step 2:** `client.ts` exports `createBrowserClient()` (memoised); `server.ts` exports `createServerClient()` bound to `next/headers` cookies.

**Step 3:** `query-client.ts` exports one `QueryClient` factory with defaults `{ staleTime: 30_000, retry: 2, refetchOnWindowFocus: false }`.

**Step 4:** `providers.tsx` (`"use client"`) wraps `QueryClientProvider` + `next-themes ThemeProvider` (`attribute="class"`).

**Step 5:** Wrap `{children}` in `providers.tsx` inside `app/layout.tsx`. Verify dev server boots and a TanStack Query devtools panel mounts.

**Step 6:** Commit: `feat(web): supabase ssr client, query client, theme provider`.

### Task 1.5: `callWorkflow()` + typed workflow error + `TierLimitToast` contract

**Files:**
- Create: `apps/web/src/lib/webhooks.ts`
- Create: `apps/web/src/lib/errors.ts`
- Test: `apps/web/src/lib/webhooks.test.ts`

**Step 1: Write failing tests** (port the assertions from `apps/legacy/src/lib/n8n.test.ts`): 402/403 → `WorkflowError` with `reason`; non-JSON body surfaced; payload merge; auth header injection.

**Step 2:** Run and confirm FAIL.

**Step 3:** Implement `callWorkflow<T>(path, { body, query, method, schema })` using `env.NEXT_PUBLIC_N8N_BASE_URL`; for recruiter calls inject the Supabase access token from `createBrowserClient().auth.getSession()`. Parse responses with the caller's Zod `schema`.

**Step 4:** Run tests → PASS.

**Step 5:** Commit: `feat(web): typed callWorkflow with tier-error mapping`.

### Task 1.6: Zustand stores for surviving UI state

**Files:**
- Create: `apps/web/src/stores/sidebar.ts`
- Create: `apps/web/src/stores/wizard.ts`
- Test: `apps/web/src/stores/sidebar.test.ts`

**Step 1: Write failing test** — `setCollapsed(true)` persists to `localStorage` and `hydrate()` restores it.

**Step 2:** Implement with `zustand` + `persist` middleware. Wizard store holds `{ step, draft, next, back, reset }` (ported from the legacy `CampaignNew` component state).

**Step 3:** Tests → PASS. Commit: `feat(web): add sidebar and wizard zustand stores`.

---

## Phase 2 — Auth, AppShell, Shared Components

### Task 2.1: Supabase SSR auth + middleware route guards

**Files:**
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/features/auth/hooks.ts`
- Create: `apps/web/src/features/auth/api.ts`

**Step 1: Write failing test** for `isProtectedPath()` (pure helper extracted from middleware): `/dashboard` → true; `/book/x` → false; `/auth` → false.

**Step 2:** Implement middleware that refreshes the Supabase session cookie and redirects unauthenticated users hitting `(recruiter)` paths to `/auth?next=<path>`. `(candidate)` and `/auth` stay public.

**Step 3:** Add `useSession()` (TanStack Query, `staleTime: Infinity`, revalidate on auth state change via `onAuthStateChange`).

**Step 4:** Commit: `feat(web): supabase ssr auth and middleware guards`.

### Task 2.2: shadcn/ui base install

**Files:**
- Create: `apps/web/components.json`, `apps/web/src/components/ui/*`

**Step 1:** `npx shadcn@latest init` with the existing globals.css; then add `button card badge input select textarea dialog dropdown-menu tabs sheet skeleton toast tooltip progress switch slider avatar`.

**Step 2:** Confirm each renders in both themes on a scratch page; verify focus-visible rings are not overridden.

**Step 3:** Commit: `feat(web): install shadcn/ui primitives`.

### Task 2.3: `PageHeader`, `AppShell`, `ThemeToggle`

**Files:**
- Create: `apps/web/src/components/shared/PageHeader.tsx`
- Create: `apps/web/src/components/shared/AppShell.tsx`
- Create: `apps/web/src/components/shared/ThemeToggle.tsx`
- Test: `apps/web/src/components/shared/PageHeader.test.tsx`

**Step 1: Write failing tests** — PageHeader renders title, optional subtitle, and an action slot; AppShell renders nav links and marks the active route with `aria-current="page"`.

**Step 2:** Port the legacy `AppShell` structure (sidebar + header + mobile sheet) onto shadcn `Sheet`, using the sidebar Zustand store and the kit tokens. Use `next/link` + `usePathname()` for active state.

**Step 3:** Tests → PASS; visual check in light/dark. Commit: `feat(web): app shell, page header, theme toggle`.

### Task 2.4: `MetricCard`, `CardGrid`, `TierLimitToast` (shared, of record)

**Files:**
- Create: `apps/web/src/components/shared/MetricCard.tsx`
- Create: `apps/web/src/components/shared/CardGrid.tsx`
- Create: `apps/web/src/components/shared/TierLimitToast.tsx`
- Test: co-located `*.test.tsx` for each

**Step 1: Port the failing legacy tests** for `CardGrid.test.tsx` into `apps/web` and run → FAIL (component missing).

**Step 2:** Implement `CardGrid` (grid-cols helper), `MetricCard` (Recharts sparkline, delta, icon chip, info popover via shadcn `Popover`), `TierLimitToast` (maps `reason` → CTA vs informational, no red styling for held states).

**Step 3:** Tests → PASS. Add co-located `*.stories.tsx` for each (Storybook lightweight or `@storybook/react` per D3).

**Step 4:** Commit: `feat(web): shared MetricCard, CardGrid, TierLimitToast`.

---

## Phase 3 — Recruiter Features

For every task here: create `features/<name>/{api.ts,hooks.ts,schema.ts,components/}` first, then the `app/(recruiter)/<route>/page.tsx` that consumes them. No `useEffect` fetching. Each task ends with a component test (mocked `callWorkflow`/Supabase via MSW) and a commit.

- **3.1 Dashboard** — port KPIs, usage bars, funnel, recent activity, upcoming interviews, review list. Server Component fetches initial data; client components hydrate via `initialData` + polling only where legacy polled. Tests for empty/loading/error states.
- **3.2 Campaigns list** — table with TanStack Query `['campaigns','list']`; row click → `next/link`. Port `Campaigns.test.tsx`.
- **3.3 Campaign new (wizard)** — RHF + Zod, Zustand wizard step store, JD text extraction (dynamic-import `pdfjs-dist`/`mammoth`), cadence preview from `@scalepods/core`. `useMutation` on success invalidates `['campaigns','list']`.
- **3.4 Campaign detail** — toggle status, candidates table, resume intake dropzone (dynamic import), 5s `refetchInterval` on the decision ledger until scored (or Realtime if wired). Tests for the tier-limit path rendering `TierLimitToast`.
- **3.5 Candidate profile** — timeline scorecards, retention-gated recordings, manual override mutation → invalidates `['candidates','detail',id]` and `['campaigns','detail',campaignId]`.
- **3.6 Billing** — tier compare + Stripe checkout/portal via edge functions; `TierGate` shared component.
- **3.7 Settings** — company/calendar OAuth chain, team round assignment, profile/password.
- **3.8 Auth pages** — `(auth)` route group: sign in/up/forgot/reset/OTP using RHF+Zod and shadcn form primitives; server actions where appropriate.

---

## Phase 4 — Candidate Flows (`(candidate)` route group, public, token-gated)

- **4.1 Candidate shell** — `features/candidate/shared` `CandidateShell`, `ErrorCard`, `useCandidateToken` reading `?tok=`; all reads via token-gated RPCs through the same TanStack Query hooks.
- **4.2 Book** — slot picker (weekday tabs), `get_available_slots` blocking, book/reschedule mutations. Playwright covers happy path.
- **4.3 Interview check** — camera/mic preview, consent checklist (plain-language consequences, per A11y section), window note.
- **4.4 Interview conduct** — lazy-loaded engine loop, MCQ/rating/typed answers, MediaRecorder chunked upload via `sign-upload`, speech recognition with transcript visible (A11y requirement), proctoring events, score → thanks.
- **4.5 Assignment** — deadline countdown, file uploads via signed PUTs, `insert_assignment_submission` → `score-assignment`.
- **4.6 Thanks** — confirmation screen.

---

## Phase 5 — Testing & CI

- **5.1** MSW handlers for n8n + Supabase; integration tests for each feature's `hooks.ts` asserting exact query-key invalidation and 402/403 → `TierLimitToast`.
- **5.2** Playwright config + critical-path specs: sign-up→first campaign, resume upload→scored candidate, booking flow, AI interview conduct. Run on merge to main + nightly against staging.
- **5.3** CI: PR runs Biome + typecheck + unit + integration; merge-to-main adds build + Playwright. Vercel preview per PR wired to staging Supabase.
- **5.4** Three env files (`.env.local`, staging, production) documented in `.env.example`; never share Supabase projects across environments.

---

## Phase 6 — Perf, A11y, Cutover

- **6.1** Lighthouse CI budgets: LCP < 2.5s, INP < 200ms, CLS < 0.1 on `/dashboard` and `/campaigns/[id]`; fix regressions.
- **6.2** axe-core in CI across all pages; fix violations; verify candidate pages specifically.
- **6.3** `next/image` for logos/avatars/resume thumbnails; confirm no bare `<img>`.
- **6.4** Cutover: delete `apps/legacy`, move `apps/web` to repo root (or keep workspace and add root `dev`/`build` scripts), update README, final `git tag v2.0.0`.

---

## Verification (run at the end of every phase)

```bash
npx biome ci .
npm run typecheck
npm run test
npm run build --workspace apps/web
```

Expected: Biome 0 errors · typecheck 0 errors · all tests pass · Next build succeeds. Do not proceed to the next phase until all four are green.
