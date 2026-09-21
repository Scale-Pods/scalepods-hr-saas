# ScalePods — Frontend Work Log (Sept 2026)

Status of completed UI work following the Section 13a redesign, plus the quality/bug fixes applied on top. All listed items are implemented and verified at time of writing.

## 1. Modern UI & theming retrofit (Section 13a)

Design spec: `docs/plans/2026-09-18-modern-ui-theme-cardmatrix-design.md`

- **Design tokens** in `src/index.css`
  - Light palette via `:root`, dark via `.dark` (background, foreground, card, primary/tint, muted, accent, border, ring, 5 chart colors, sidebar group).
  - Exposed to Tailwind through `@theme inline` → semantic utilities like `bg-card`, `text-muted-foreground`, `bg-success`, `text-warning`, `bg-chart-1`.
  - `@custom-variant dark (&:where(.dark, .dark *));` enables `dark:` variants off a `.dark` class.
  - Global `:focus-visible` ring, `::selection` tint, `prefers-reduced-motion` guard, print-safe background.
  - `color-scheme: light` / `.dark { color-scheme: dark }` so native inputs, date pickers and scrollbars never render white in dark mode.
- **Theme runtime**
  - `src/lib/theme.tsx` — `ThemeProvider` / `useTheme()` supporting `light | dark | system`, persisted to `localStorage` key `scale-pods-theme`.
  - `index.html` FOUC-guard inline script applies the theme class before first paint.
  - `src/components/ThemeToggle.tsx` — Sun/Moon/Monitor cycling control (top-right header).
- **Token sweep**
  - Hardcoded slate/amber/red/green/rose/`bg-white` utilities replaced with semantic tokens across `src` (32 files, via `C:\Users\aqibf\AppData\Local\Temp\opencode\sweep-tokens.js`), including a follow-up pass for `text-slate-800`, `bg-slate-300`, `bg-accent0`.
- **App shell** (`src/components/AppShell.tsx`)
  - Desktop: collapsible icon rail (`scale-pods-shell-collapsed`), top action bar, active nav highlighted with `bg-accent`.
  - Mobile: top bar + slide-in drawer. `src/components/Logo.tsx` replaces the old "S" tiles everywhere (AppShell, CandidateShell, AuthPage, setup screen).
- **Card matrix components**
  - `src/components/CardGrid.tsx` — responsive grid wrapper (`base/sm/md/lg` column counts).
  - `src/components/MetricCard.tsx` — value, delta chip, Recharts sparkline (`var(--chart-1)` gradient), skeleton placeholder, `role="img"` trend label.
  - `src/components/EmptyState.tsx` — icon + title + hint + CTA.
  - `src/components/ui/Tooltip.tsx` — extended with `side` and `disabled` props.
- **Dashboard rebuild** (`src/routes/Dashboard.tsx`)
  - KPI matrix: active campaigns, candidates in pipeline (+7d sparkline + delta), interviews this week (+delta), AI credits remaining (warns past 90%).
  - Usage bars vs tier allowances; candidate funnel; recent activity; outreach; upcoming interviews; needs-your-review.
  - New helpers in `src/lib/format.ts`: `timeAgo()`, `dailySeries()`.
- **Empty states applied** to CampaignDetail (candidates list), CandidateProfile (timeline/outreach), Settings (teammates), and Book slots.

## 2. Configuration gate fix

- Root cause of blank app: missing `.env` made `browserClient()` throw during `AuthProvider` render.
- `src/App.tsx` now checks `isSupabaseConfigured()` (live `import.meta.env` reads) and renders a "ScalePods is not configured yet" setup screen instead of crashing.
- Covered by `src/App.test.tsx` (`vi.stubEnv`).

## 3. Bug fixes applied

- **Blurry sidebar logo** — the full-width sticky top bar (`bg-card/80` + `backdrop-blur`, `z-20`) overlapped the fixed sidebar (default `z-auto`) and blurred the logo through its translucent backdrop. Fix: sidebar `aside` elevated to `z-30`; desktop header offset with `lg:ml-60` / `lg:ml-16` so its box starts outside the sidebar. Logo itself is a vector SVG, so it scales crisply at any size.
- **White/"ghost" cards in dark mode**
  - AI interviewer bubble used `bg-foreground text-white` → inverted to a near-white card with white text in dark mode. Now `bg-foreground text-background` (`src/routes/candidate/InterviewConduct.tsx`).
  - Disabled buttons used leftover `bg-slate-300` (light-gray in dark). Replaced with `bg-muted text-muted-foreground` (Book, InterviewCheck, InterviewConduct, Assignment, Toggle).
  - `color-scheme` added (see §1) so native controls don't paint white in dark mode.
- **Sidebar "Recruiter" label visibility / collapsed ghosts** — heading raised to `text-sidebar-foreground/70`; when the rail is collapsed it is replaced by a clean divider, and nav/wordmark labels use `hidden` instead of faint `opacity-0` ghosts.

## 4. Verification

- `npm run typecheck` — pass
- `npm run lint` — 0 errors, 8 benign warnings
- `npm run test` — 39/39 passing (8 files: App config gate, theme, CardGrid/MetricCard, format helpers, plus existing route/component tests)
- `npm run build` — pass (`✓ built in ~19s`)

## 5. Open items / notes

- **Official logo asset**: LinkedIn is login-walled, so the bundled `Logo.tsx` mark is a designed placeholder (indigo tile + status-bar glyph). To use the real logo, drop an image into the repo and pass its path to `<Logo src="...">` — the component will render it instead. Provide 1x/2x/3x or SVG for crispness.
- `.env` is still not created — the app shows the setup screen until `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_N8N_BASE_URL` and `VITE_APP_ORIGIN` are supplied.
- Dashboard reflow at 375/414/768px was verified structurally (fluid grids, no nowrap on content) — recommended to confirm once visually in a live browser.

## 6. Backend "third pass" alignment — Section 13b patches (PATCH 1–9)

Applied on top of the 13a work. Backend source: the build prompt's **Section 13b: backend's third pass**. Scope: **PATCH 1–9 only**; the two flagged spec mismatches below are logged here as follow-ups, not fixed.

- **PATCH 2 — Tier-limit error mapping** (`src/lib/n8n.ts`)
  - `TierLimitError` now also covers HTTP **403** side-by-side with 402 (default status 403; actual status preserved). Centralised set in `callWebhook`. `src/lib/n8n.test.ts` extended (402, 403, 403-with-reason/detail).
- **PATCH 3 — Overage behavior + authoritative tier limits**
  - `TierLimits.overageBehavior` (`'hard_stop' | 'metered'`); **Growth = `'metered'`**, everything else hard-stop; Growth `activeCampaigns` 25. Helpers `overageAllowed()` / `overageNotice()` in `src/lib/tier.ts`.
  - `src/hooks/useTierLimits.ts` reads the public anon-readable `tier_limits` table (new migration **0005**) and merges it over the static mirror.
  - Campaign builder round select: hard-stop tiers can't exceed `maxRounds`; Growth shows "billed over cap" + notice.
- **PATCH 4 — Assignment brief + deadline**
  - `RoundDraft.brief_text` + `assignment_deadline_hours` (default 72h), brief required for assignment rounds, both sent in the create-campaign payload and kept through `campaignRoundSchema` (zod no longer strips them).
  - **No `campaign_rounds.brief_text` column added** — the backend currently ignores it (uses a placeholder brief server-side); the field is payload-only for now.

    > Follow-up: migrate `campaign_rounds` (and assignment submit payload) to real `brief_text` when workflow 9 supports it.
- **PATCH 1 — Reports rework** (`src/lib/schemas.ts`, `src/lib/reports.ts`, `Dashboard.tsx`, `FunnelChart.tsx`)
  - Deployed reports contract is now the source of truth: `funnel_conversion[]` is **per-campaign stage counts** (`account_id | campaign_id | campaign_name | entered_stage_1 | passed_any_round | reached_human_interview | offers_made | offers_signed | intake_to_signed_pct`), and `time_to_hire` is an **array** (of `median_days | average_days | hires | outlier_entries | stage`). `source_effectiveness[]` keeps `source | conversations | offers | rate`. Old `funnel`/`outreach`/`pipeline` keys removed.
  - The schema mirrors that shape leniently (all fields optional/safe-defaulted) so a partial payload degrades to empty widgets instead of a parse throw. `src/lib/reports.ts` aggregates `funnel_conversion` into a 5-stage Intake→Signed funnel (`buildFunnelRows`), collapses the `time_to_hire` array (`summarizeTimeToHire`), and filters labelled source rows (`sourceRows`). Dashboard uses report-driven funnel only when a stage has any entrants, else its DB fallback. Reports failures (network, 5xx, or Zod) now render the "Usage & reporting unavailable" card with no generic toast.
- **Campaign navigation** (`src/routes/Campaigns.tsx`, `src/routes/index.tsx`, `Dashboard.tsx`, `AppShell.tsx`, `CampaignDetail.tsx`)
  - New `/campaigns` list page (name → detail, status badge, rounds, candidate count, created date, empty state → create CTA). "Active campaigns" metric card is now clickable → `/campaigns`; the sidebar gains a Campaigns item; CampaignDetail gets "← All campaigns". The whole list row is clickable (role="link", Enter/Space) so a click anywhere opens the campaign; CampaignDetail's loader is hardened (try/finally) so an auxiliary query error can never strand the page on "Loading …".
- **Resume contact auto-extraction** (`src/lib/parse-resume.ts`, `src/lib/parse-resume.test.ts`, `src/routes/CampaignDetail.tsx`)
  - Dropping resumes in the "Upload resumes" card now read each file client-side and prefill **Name / Email / Phone** — no more hand-typing per candidate (matters for bulk intakes of 50+ files). Inputs stay editable; the picked values are sent to `/webhook/candidate-intake` as before (n8n workflow 1 still re-extracts server-side).
  - `parseResumeText` heuristics: email + phone regexes, and a best-guess name from the first clean capitalized line while skipping header/section lines, job-title words (engineer, intern, analyst…) and company words (corp, inc, llc, university…). `.txt`/`.md` read via `file.text()`, PDF/DOCX reuse the existing lazy `extract-text.ts` loaders. Per-file "Extracting contact…" note shown until prefilled.
- **PATCH 5 — Calendar plain-GET reconnect flow**
  - Connect is a plain GET redirect to `/webhook/calendar/connect?account_id=`. Backend drives the OAuth exchange and returns to `/settings?calendar=connected` (info toast) or `?calendar=error`.
  - **Deleted** `src/routes/OauthCallback.tsx`, its route, and the dead `connectCalendarStartSchema` / `oauthCallbackSchema`. `webhookUrl()` helper added to `n8n.ts`.
- **PATCH 6 — Notification preferences** (`src/routes/Settings.tsx`)
  - Quiet hours start/end + daily messages-per-candidate cap persisted on `accounts` (RLS); `refreshAccount()` re-reads row. Shows what the quiet-hours hold mechanism does.
- **PATCH 7 — Billing status surfacing**
  - `useAuth` now selects `billing_status` + new prefs. Billing page adds a status badge (active/trialing/past_due/canceled/incomplete).
  - `AppShell` shows a **non-dismissible** `past_due` banner (links to Billing) and a read-only `canceled` banner; campaign builder gates the Continue/Create buttons when canceled.
- **PATCH 8 — No-show / platform-fault retakes**
  - **Migration 0005**: `round_instances.status` gains `'no_show'`; new `fault_reason` + `retake_of_round_instance_id`; `get_session_context` / `get_booking_context` return them; `src/lib/supabase-db.ts` + `sessionContextSchema`/`bookingContextSchema` mirror it.
  - `RoundStepper` accepts per-round `statuses` (passed/failed/no_show chips); CampaignDetail loads latest statuses per round + `no_show` in the decision badge.
  - CandidateProfile timeline shows "Platform-fault retake" / "No-show" badges and the fault reason; InterviewCheck + InterviewConduct add retake copy.
- **PATCH 9 — Outreach held states** (`src/routes/CandidateProfile.tsx`)
  - `held_for_window` / `held_for_cap` render as neutral `"Held — will retry"` badges with quiet-hours / daily-cap hints instead of raw enum text.

### Follow-ups (out of scope, flagged)
1. **`score-interview` payload mismatch**: the frontend sends `{ account_id, session_id, candidate_id }`; Section 9 wants `round_instance_id`, `campaign_id`, `round_number`, `number_of_rounds`, `cutoff_score`. Backend derives these from `session_id`, but once `/webhook/score-interview` learns to carry them the candidate page should pass them. (`src/routes/candidate/InterviewConduct.tsx`→`finishInterview()`.)
2. **Recording/transcript link**: the candidate profile surfaces only a retention-expiry note; the prompt's Section 10 wants a short-lived signed URL to the recording + transcript download when the session has them. Needs a new edge/RPC to mint signed URLs.

### Verification
- `npm run typecheck` — pass
- `npm run lint` — 0 errors, 8 benign warnings (react-refresh + one exhaustive-deps, all pre-existing)
- `npm run test` — 64/64 passing (incl. `lib/reports.test.ts`, `lib/parse-resume.test.ts`, `routes/Campaigns.test.tsx`, `routes/Home.test.tsx`, n8n double-`/webhook` regression)
- `npm run build` — pass