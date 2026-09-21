# ScalePods Frontend Spec — Sections 13–17 (authoritative)

> Persisted verbatim from the owner's build prompt so every implementation subagent builds against the same contract. Section 13 (+13a/13b/13c) is the functional contract (what each page calls). Section 16 is the engineering standard (how the code is written). Section 17 supersedes Section 13 item 5 for the Billing & Payments module. Section 15 lists required external integrations.

---

## 13. Frontend build prompt (functional contract)

Copy this into a frontend generation tool (v0, bolt, lovable) or hand it to an engineer as a spec. It is now wired to the actual backend: every action below calls one of the 13 n8n webhook endpoints delivered separately, against the Section 12 schema.

Build a recruiting SaaS web app called ScalePods. React + TypeScript + Tailwind frontend,
Supabase for auth/database/storage, calling an n8n backend (base URL: N8N_BASE_URL env var)
for every workflow action listed below. Do not implement business logic client-side beyond
form validation - every state change goes through a webhook call.

=====================================================================
AUTH & ACCOUNT BOOTSTRAP
=====================================================================
- Supabase Auth: email/password + Google OAuth sign-up and sign-in.
- On first sign-up (Supabase Auth trigger or client-side post-signup call), create the
  `accounts` row: id = auth.users.id, tier = 'free', billing_anchor_date = today.
- Store the Supabase session JWT; every API call below sends it so RLS scopes reads/writes
  to the signed-in account_id automatically - never pass account_id as a client-trusted field
  for anything that writes data; derive it server-side from the JWT via Supabase RLS, and only
  pass it explicitly in webhook bodies where the n8n workflow needs it directly (all POSTs below).

=====================================================================
RECRUITER-FACING PAGES
=====================================================================

1. DASHBOARD (/)
   - Cards: active campaigns count, candidates in pipeline by stage (bar or funnel chart).
   - Usage section: call `GET {N8N_BASE_URL}/webhook/reports?account_id={id}` (workflow 11).
     Render its `usage.ai_interview`, `usage.ai_voice_screening`, `usage.scheduled_round` as
     progress bars (used/granted), red past 90%. Render `funnel_conversion` (array, one row per campaign: entered_stage_1, passed_any_round, reached_human_interview, offers_made, offers_signed) as a 5-stage funnel chart. Add a "Time to hire" card from `time_to_hire` (avg_days_intake_to_offer_signed, avg_hours_per_round, no_show_count, platform_fault_count).
     Render `source_effectiveness` (array, one row per channel+stage: messages_sent, delivered, fell_back, delivery_rate_pct) as a small table.
   - "New Campaign" primary button -> page 2.

2. CAMPAIGN BUILDER (/campaigns/new) - 3-step wizard
   Step 1 - Basics:
     - name, jd_text (paste or upload a .pdf/.docx and extract client-side or via a small
       text-extract step before submit), number_of_rounds (1-6). Read both the numeric cap AND `overage_behavior` from `tier_limits`
       (public, anon-readable) for the account's tier: only disable/upgrade-gate options above
       the cap when `overage_behavior = 'hard_stop'`. Growth's `overage_behavior = 'metered'`
       means over-cap is allowed - show an inline "over your included limit, extra usage is
       billed" notice instead of disabling. start/end dates.
   Step 2 - Per round (repeat for number_of_rounds):
     - round_type select: Live AI Interview / Live Human Interview / Assignment.
       Assignment option is disabled with an upgrade tooltip ("Available on Growth+") for
       Free/Basic accounts. When Assignment is selected: show a required brief_text textarea
       and an assignment_deadline_hours input. Note for the builder: campaign_rounds has no
       column to store brief_text yet server-side (schema gap) - send it in the create-campaign
       payload anyway so the UI is ready, but the backend currently ignores it (a placeholder
       brief is used server-side) rather than losing what the recruiter typed.
     - interviewer_email: dropdown populated from `team_members` (fetch via Supabase client
       with RLS) for Human rounds; hidden/irrelevant for AI and Assignment rounds.
     - cutoff_score (0-100 slider or number input).
     - daily_start_time / daily_end_time (for Live rounds only).
   Step 3 - Reach-out:
     - Channel toggles: Email (always on, disabled), WhatsApp (disabled below Basic tier with
       upgrade tooltip), Voice Screening call (disabled below Basic).
     - A read-only cadence preview table rendering the Day 0/1/3/5 + interview-day + result
       stages from doc Section 3.2, filtered to what the account's tier actually sends.
   On submit: POST {N8N_BASE_URL}/webhook/campaigns
     body: { action: "create", account_id, name, jd_text, number_of_rounds,
             rounds: [{round_number, round_type, interviewer_email, cutoff_score}, ...] }
   (workflow 9). On 200, redirect to /campaigns/:id.

3. CAMPAIGN DETAIL (/campaigns/:id)
   - Header: campaign name, status toggle (on/off), round pipeline shown as a horizontal
     stepper (Round 1 -> Round 2 -> ... -> Offer), each step's type icon (AI/Human/Assignment).
     Render round_instances.status = 'no_show' distinctly from 'failed' (neutral, not a
     rejection - tooltip "candidate did not join - credit refunded").
   - Candidate table: columns = name, current stage, latest score, decision. Row click ->
     page 4. Data: Supabase client read of `candidates` joined to `round_instances` and
     `decision_ledger` filtered by campaign_id (RLS-scoped, no webhook needed for reads).
   - "Upload Resumes" button opens a multi-file drop zone; each file triggers:
     POST {N8N_BASE_URL}/webhook/candidate-intake
       multipart body: resume_file (binary), account_id, campaign_id, jd_text,
                        candidate_email, candidate_name, candidate_phone, resume_cutoff
     (workflow 1). Show a per-file progress row (uploading -> screening -> scored X or
     rejected), polling the candidate's decision_ledger row via Supabase realtime subscription
     or a 5s poll until a score appears.

4. CANDIDATE PROFILE (/candidates/:id)
   - Resume viewer (signed Supabase Storage URL, short-lived).
   - Timeline component: one entry per decision_ledger row for this candidate, oldest first -
     resume score -> voice_screen score (if run) -> round_1 score -> round_2 score -> etc.
     Each entry expandable to show rationale, and for AI-interview rounds, a link to the
     scorecard (strengths/weaknesses/red_flags/recommendation from `scorecards` table) and
     recording/transcript (Supabase Storage signed URL, subject to the tier's retention
     window - hide the link and show "expired" past that window). When a round_instance has
     fault_reason set, show "Technical issue on our end - free retake issued" instead of a
     failed round, linking forward to the retake via retake_of_round_instance_id.
   - Manual override control: a small form (new score + reason) that recruiters use to
     override a cutoff decision - writes directly to `decision_ledger` via Supabase client
     (RLS-scoped) and additionally POSTs an audit_log entry: not yet a dedicated endpoint,
     write to Supabase `audit_log` table directly with actor_type='account_holder'.
   - Outreach history panel: reads `outreach_log` filtered by candidate_id, chronological,
     showing stage/channel/delivery_state/fallback_used. Render delivery_state
     'held_for_window'/'held_for_cap' distinctly from a failure ("Held - outside candidate's
     active hours, will retry" / "Held - daily message limit reached, will retry") - both are
     automatic holds workflow 5 clears on its own, not errors.

5. USAGE & BILLING (/billing)
   - Current tier badge + "Upgrade" button opening a tier comparison modal (static content
     from doc Section 4.1's table).
   - billing_status badge (active/trialing/past_due/canceled/incomplete) next to the tier
     badge. past_due shows a persistent, non-dismissible banner across the whole app, not just
     this page. canceled makes the UI read-only (banner + disable actions that consume
     credits) until resubscribed, same degrade pattern as a hard tier-limit block.
   - Usage bars per credit type (same data source as Dashboard's GET /reports call).
   - Top-up purchase flow: a quantity selector + Stripe Checkout redirect (create a Checkout
     Session via a thin serverless function or an n8n webhook you add - not built in the
     13 workflows delivered; wire this to Stripe directly if no dedicated endpoint exists yet).
   - Invoice history: Stripe Customer Portal embed or a simple list from Stripe's API.

6. SETTINGS (/settings)
   - Calendar connection card: shows connection status (not_connected/pending/active/
     degraded/revoked) from `calendar_connections` (Supabase read). "Connect Google Calendar"
     button is a plain link (or `window.location.href =`) to
       GET {N8N_BASE_URL}/webhook/calendar/oauth/start?account_id={id}
     (workflow 10) - the backend redirects straight to Google, no JSON response to handle.
     Google redirects back to the backend's own GET /webhook/calendar/oauth/callback directly
     (NOT a frontend route - there is no /settings/oauth-callback page); the backend completes
     the connection and redirects the browser back to {FRONTEND_URL}/settings?calendar=connected.
     Have this page check for that query param on mount, show a success toast, and strip it
     from the URL.
   - Team members table + "Add teammate" form -> POST /webhook/interviewers with
     { action: "assign_round", account_id, name, email, role } for adding, and a separate
     simple insert for listing (Supabase client read of `team_members`).
   - Sending identity: read-only display of platform-managed vs custom domain/WhatsApp number
     (Growth+/Enterprise only) - editable only when tier allows; otherwise show an upgrade CTA.
   - Notification preferences: quiet_hours_start / quiet_hours_end (time pickers, default
     21:00/09:00, labelled "Don't message candidates between...", candidate-local-time framing)
     and max_messages_per_candidate_per_day (number input, default 3). Read/write directly
     against the `accounts` table via the Supabase client (RLS-scoped, no webhook needed).

=====================================================================
CANDIDATE-FACING PAGES (no login - accessed via the signed session/round link)
=====================================================================

7. BOOKING PAGE (/book/:round_instance_id)
   - Fetch the round_instance + campaign_round via a public, rate-limited read (a Supabase
     RLS policy allowing anon read of round_instances by id only, or a small read-only n8n
     webhook you add for this - not one of the 13 delivered workflows).
   - Calendar/slot picker showing available times in the candidate's browser-detected
     timezone. On slot selection:
       POST {N8N_BASE_URL}/webhook/book-slot
         body: { round_instance_id, slot_start, slot_end }
     (workflow 3). On 200, show a confirmation screen with the Google Meet link (Human
     rounds) or a "link will be emailed 9 AM on interview day" notice (AI rounds).
   - "Need to reschedule?" link (shown after booking, via a follow-up email/WhatsApp link)
     opens the same picker and POSTs to /webhook/reschedule instead
       body: { round_instance_id, event_id, interviewer_email, new_slot_start, new_slot_end }.

8. PRE-INTERVIEW CHECK (/interview/:session_id/check)
   - Camera/mic permission request + live preview, a proctoring-consent checkbox (required
     to continue), a countdown to the scheduled window (button disabled outside it).
   - "Start Interview" -> /interview/:session_id/conduct.

9. AI INTERVIEW CONDUCT PAGE (/interview/:session_id/conduct)
   - On mount: POST {N8N_BASE_URL}/webhook/create-session was already called by the backend
     when the interview link was dispatched (workflow 6 via workflow 2); this page instead
     fetches the session's first question by calling:
       POST {N8N_BASE_URL}/webhook/interview-engine
         body: { session_id, question_id: null, answer_text: null }  // first call, no answer yet
     then for every subsequent turn, after the candidate answers (voice-to-text or typed):
       POST {N8N_BASE_URL}/webhook/interview-engine
         body: { session_id, question_id, answer_text }
     (workflow 6). Render `next_message`; if `is_final_question` is true, show a "finishing up"
     state and call:
       POST {N8N_BASE_URL}/webhook/score-interview
         body: { session_id, round_instance_id, account_id, candidate_id, campaign_id,
                 round_number, number_of_rounds, cutoff_score }
     then redirect to a "thanks, we'll be in touch" page. No back button, no visible question
     list ahead of time. If this session is a retake (reissued after a platform fault), the
     invite copy should say "we had a technical issue last time - let's try again", not look
     like a fresh first attempt. Continuously capture audio/video to Supabase Storage in chunks;
     detect tab-switch/fullscreen-exit via the Page Visibility API and write a
     `proctoring_events` row (Supabase client insert) for each occurrence.

10. ASSIGNMENT SUBMISSION PAGE (/assignment/:round_instance_id)
   - Brief text (from campaign_rounds/round_instances) + deadline countdown (red under 24h,
     matching the assignment_deadline_24h cadence stage from workflow 5).
   - File upload (drag-drop, multi-file) + free-text submission field.
   - On submit: upload files to Supabase Storage at
     assignments/{account}/{campaign}/{round}/{submission}, then insert a row recording the
     submission (Supabase client) and call the same /webhook/round-evaluate endpoint workflow
     6 calls after AI scoring, once an evaluator/LLM step has produced a score (build this as
     a thin extension of workflow 8's pattern - not one of the 13 delivered workflows;
     the evaluate-and-cutoff-check endpoint itself, /webhook/round-evaluate, IS built in
     workflow 2 and can be called directly once a score exists).
   - Confirmation screen with submission timestamp.

11. VOICE SCREENING (candidate side is a phone call, not a page)
   - No frontend page - Vapi places an outbound call per workflow 13. Optionally add a small
     status indicator on the candidate's booking confirmation page ("We may call you at
     {phone} for a quick 5-minute screening call") sourced from whether the account's tier
     includes ai_voice_screening.

=====================================================================
DESIGN
=====================================================================
- Clean, minimal, recruiter-tool aesthetic (Ashby/Greenhouse-like), not playful. Card-based
  dashboard, generous whitespace, single accent color.
- Every screen touching a tier limit shows the limit and the upgrade path inline (never a
  silent block) - read tier from the accounts row and gate UI elements client-side, but treat
  every gate as advisory: the real enforcement is server-side in workflows 1/2/6/8/9 via the
  Credit & Usage Guard (workflow 7), which can return a 402 the UI must handle gracefully
  (toast + upgrade CTA, not a raw error).
- Fully responsive; pages 7-10 (candidate-facing) must work well on mobile, since candidates
  frequently join from a phone.
- Handle every webhook's error shape consistently: a 402 body is always
  { error: string, detail?: string } (or reason on some). Tier-limit blocks (campaign
  creation, round scheduling) come back as 403, not 402 - confirm Credit & Usage Guard's own
  status code before assuming 402 everywhere. Render a single reusable <TierLimitToast>
  component that catches both 402 and 403 rather than bespoke error handling per page.

Every page above calls a specific webhook path from the 13 n8n workflows delivered separately (Section 11a has the full trigger table), so a frontend built from this prompt and a backend built from those workflow files should connect without translation. Three thin endpoints aren't in the 13 delivered workflows and need adding: a public read-only round_instance lookup for the booking page, a Stripe Checkout session creator for top-ups, and an assignment-scoring trigger (the cutoff-check step itself, /round-evaluate, already exists in workflow 2 - only the "score this submission" step ahead of it is missing).

---

## 13a. Modern UI addendum — theming, metrics & card-matrix system

This extends Section 13 with the modern-UI, light/dark theme, and metrics-dashboard requirements.

### Stack additions
- Tailwind CSS + shadcn/ui (Radix primitives) for the component layer — gives accessible, themeable components out of the box (Card, Dialog, Tabs, Dropdown, Sheet, Toast, Skeleton).
- next-themes for light/dark/system theme switching with no flash-of-wrong-theme on load.
- Recharts or Tremor for charts (line, area, bar, donut) — both theme-aware via CSS variables.
- lucide-react for icons, Inter or Geist as the UI typeface.
- Framer Motion for card entrance/hover micro-interactions (optional but recommended for the dashboard feel).

### DESIGN SYSTEM & THEMING
Build the UI on Tailwind + shadcn/ui, with full light and dark theme support:

1. Theme mechanism
   - Use next-themes with attribute="class", defaultTheme="system", enableSystem=true.
   - Add a theme toggle (sun/moon/monitor icon cycling light → dark → system) in the top nav, visible on every authenticated page.
   - Every color must be a CSS variable defined in :root (light) and .dark (dark) — never a hardcoded hex in a component. Define at minimum:
     --background, --foreground, --card, --card-foreground, --popover, --primary,
     --primary-foreground, --secondary, --muted, --muted-foreground, --accent,
     --destructive, --success, --warning, --border, --input, --ring,
     --chart-1 … --chart-5 (distinct, colorblind-safe chart palette, themed separately for dark mode).
   - Persist the user's choice in localStorage (next-themes handles this) and respect prefers-color-scheme on first visit.

2. Visual language
   - Rounded-xl (12px) cards, subtle 1px border in --border, soft shadow in light mode (shadow-sm), a faint inner border/glow instead of shadow in dark mode (shadows read as muddy on dark backgrounds — use border-white/10 instead).
   - Consistent 4/8/12/16/24/32px spacing scale (Tailwind default scale is fine — don't invent a new one).
   - One accent color for primary actions and active states; neutral grays for everything else. Status colors (success/warning/destructive) used ONLY for status, never decoratively.
   - Motion: 150–200ms ease-out on hover/focus transitions, 250–300ms on panel/dialog enter. Respect prefers-reduced-motion (disable non-essential transitions when set).

3. Layout shell
   - Persistent left sidebar (collapsible to icon-only rail) for primary nav, grouped by role (Recruiter / Hiring Manager / Admin / Candidate).
   - Top bar: search (Cmd+K command palette via cmdk), notifications bell with unread badge, account switcher, theme toggle, avatar menu.
   - Content area: max-width container on desktop, full-bleed on mobile, consistent page header pattern (title + breadcrumb + primary action button, right-aligned).

### METRICS & DASHBOARD LAYER
Every role's home page is a metrics dashboard, not a table. Build it as a "card matrix":

1. KPI card matrix (top of every dashboard)
   - Responsive grid: grid-cols-1 sm:grid-cols-2 lg:grid-cols-4, gap-4.
   - Each KPI card: label (muted, text-sm), big number (text-3xl font-semibold, tabular-nums so digits don't jitter), a delta chip (▲/▼ + %, green/red, vs. previous period) and a 7/30-day inline sparkline (Recharts <AreaChart> at ~40px height, no axes, single accent-colored fill at 10% opacity).
   - Card itself: hover:shadow-md hover:-translate-y-0.5 transition, click-through to the relevant detail page.
   - Loading state: skeleton shimmer (shadcn Skeleton), never a blank card or spinner-only card.

2. Recruiter dashboard KPIs (source: GET /dashboard/recruiter or equivalent Supabase RPC)
   - Open requisitions, candidates in pipeline (stacked by stage), avg. time-to-screen, interviews scheduled this week, offer acceptance rate (rolling 90d), credits remaining (ai_interview / voice_screening, with expiry countdown chip if <14 days).

3. Hiring manager dashboard KPIs
   - Candidates awaiting my review, scorecards pending, upcoming interviews (next 5, list card not a KPI), time-to-decision average.

4. Admin / billing dashboard KPIs
   - MRR, active seats vs. plan limit, credit consumption this cycle (progress bar + line chart), tier distribution (donut), churn risk accounts (table card), Enterprise vs. self-serve billing split.

5. Below the KPI matrix: a two-column layout on desktop (lg:grid-cols-3, main content lg:col-span-2, sidebar lg:col-span-1) — main column holds the pipeline funnel chart (candidates by stage, horizontal bar or funnel) and a recent-activity feed card (timeline style, icon + actor + action + relative timestamp); sidebar column holds compact list cards ("Interviews today", "Needs your review", "Expiring credits").

6. Empty states: every card and every table has a designed empty state (icon + one-line message + primary CTA), never a bare "No data."

### CARD-MATRIX COMPONENT SPEC (reusable across the app)
Build one shared <MetricCard /> and one shared <CardGrid /> component:

- <CardGrid cols={{base:1, sm:2, lg:4}} gap="4"> — a thin wrapper around a responsive Tailwind grid, used for the KPI matrix, the pricing/tier comparison cards, the integration-status cards (Section 15), and the candidate-pipeline stage cards. One layout primitive, reused everywhere.
- <MetricCard label value delta? deltaDirection? sparklineData? icon? onClick?> — the KPI card described above; delta/sparkline/icon are all optional so the same component covers a plain stat card and a trend card.
- Both components take no hardcoded colors — everything themes automatically because it only ever references the CSS variables above.

### ACCESSIBILITY
- All interactive elements keyboard-reachable and focus-visible (ring-2 ring-ring ring-offset-2).
- Color is never the only signal (pair status colors with an icon or label).
- Charts include a visually-hidden data table fallback or aria-label summarizing the trend, for screen readers.
- Maintain WCAG AA contrast in both themes — check the dark-mode palette specifically, since muted-on-muted is the most common dark-theme failure.

---

## 13b. Frontend prompt updates — required by the backend's third pass

Merged directly into Section 13's prompt above (no longer a separate patch list) — the DASHBOARD, CAMPAIGN BUILDER, SETTINGS, USAGE & BILLING, CAMPAIGN DETAIL, CANDIDATE PROFILE, AI INTERVIEW CONDUCT, and DESIGN subsections were all updated in place to reflect the 9 changes below.

- PATCH 1 — Dashboard usage/funnel section (page 1) response shape changed: `GET /webhook/reports` no longer returns `funnel` / `outreach` objects. It now returns three arrays from new SQL views: `funnel_conversion`, `time_to_hire`, `source_effectiveness`. Map `funnel_conversion` rows onto the 5 funnel stages; add a "Time to hire" card (`avg_days_intake_to_offer_signed`, `avg_hours_per_round`, `no_show_count`, `platform_fault_count`); replace the outreach stat row with `source_effectiveness` (small table or grouped bars). `usage.*` unchanged.
- PATCH 2 — Tier-limit errors are 403, not 402. Hard-stopped tier limits (campaign creation, round scheduling) return 403 with `{ error: string }`. `<TierLimitToast>` must catch 403 and keep 402 handling too (credit exhaustion). Verify workflow 7's actual status code; don't assume.
- PATCH 3 — Growth tier's metered overage is NOT a block. Read `overage_behavior` from `tier_limits` alongside the numeric cap; only disable/upgrade-gate when `overage_behavior = 'hard_stop'`. For `metered`, allow past the cap and show an inline "over your included N active campaigns — extra usage is billed" notice.
- PATCH 4 — Assignment round type needs a `brief_text` textarea (required when round_type = assignment) alongside cutoff_score and assignment deadline. Backend gap: `campaign_rounds` has no column yet — send it in the create-campaign payload anyway; backend currently ignores it (placeholder brief used server-side).
- PATCH 5 — Settings calendar connect flow changed completely: `GET {N8N_BASE_URL}/webhook/calendar/oauth/start?account_id={id}` (plain link/window.location), backend redirects to Google, Google → backend's own `GET /webhook/calendar/oauth/callback`, backend → `{FRONTEND_URL}/settings?calendar=connected`. Remove any `/settings/oauth-callback` frontend route (dead). Settings checks `?calendar=connected` on mount, toasts, strips the param. `assign_round`/add-teammate POST to /webhook/interviewers unchanged.
- PATCH 6 — Settings: add "Notification preferences": `quiet_hours_start` / `quiet_hours_end` (time pickers, defaults 21:00/09:00, "Don't message candidates between…", candidate-local-time framing) and `max_messages_per_candidate_per_day` (number, default 3). Read/write directly to `accounts` via Supabase client (RLS-scoped).
- PATCH 7 — Billing: `accounts.billing_status` (active/trialing/past_due/canceled/incomplete) badge near tier badge. `past_due` → persistent non-dismissible banner across the whole app. `canceled` → read-only UI (banner + disable credit-consuming actions) until resubscribed.
- PATCH 8 — Candidate/round status: `round_instances.status` can be `no_show` (neutral, not `failed`; tooltip "candidate did not join — credit refunded"). Platform-fault retake creates a NEW round_instance linked via `retake_of_round_instance_id` with `fault_reason` on the original → Candidate Profile shows "Technical issue on our end — free retake issued" and links forward. AI Conduct retake copy: "we had a technical issue last time — let's try again".
- PATCH 9 — Outreach history: `outreach_log.delivery_state` can be `held_for_window` / `held_for_cap` — render distinctly from failure ("Held — outside candidate's active hours, will retry" / "Held — daily message limit reached, will retry"), non-red, automatic holds workflow 5 clears.

---

## 13c. Frontend .env

Every variable Section 13's prompt actually references, end to end — nothing extra, nothing missing. Full file with comments delivered as .env.example alongside the workflows.

```
# Public (safe in the client bundle) - prefix with VITE_ (Vite) or NEXT_PUBLIC_ (Next.js)
SUPABASE_URL=https://inkfjgmnxkfitnegpiej.supabase.co     # from Supabase dashboard
SUPABASE_ANON_KEY=                                         # the anon/public key - NOT service_role
N8N_BASE_URL=https://<your-n8n-host>/webhook               # every /webhook/* call in Section 13
FRONTEND_URL=https://app.scalepods.co                      # must match workflow 10's redirect_uri
STRIPE_PUBLISHABLE_KEY=                                     # pk_... - only if Checkout/Elements runs client-side
APP_ENV=production                                          # optional, for error reporting later
```

Never put in the frontend .env: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, `VAPI_WEBHOOK_SECRET`, or any Twilio/Meta secret — those are n8n Variables/Credentials only (README_SETUP.md), never shipped to the browser. The anon key and publishable Stripe key above are the only ones designed to be public; RLS and n8n's own auth do the real enforcement.

**Next.js mapping (this repo):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_N8N_BASE_URL`, `NEXT_PUBLIC_FRONTEND_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_ENV`. Server-only: `SUPABASE_SERVICE_ROLE_KEY`.

---

## 15. Integrations required

Every external service the workflows in Section 11 call. Set up credentials for all of these in n8n before Day 1.

| Integration | Used by (workflow #) | Purpose | Needed Week 1? |
|---|---|---|---|
| Supabase (Postgres + Auth + Storage) | All | Database, login, resume/file storage | Yes - day 1 |
| Google OAuth + Calendar API | 3, 10 | Availability check, create/update events, Google Meet links | Yes - day 3 |
| OpenAI API (gpt-4.1-mini) | 1, 6 | Resume scoring, question generation, live interview turns, scorecard | Yes - day 2 |
| Transactional email (Amazon SES or Gmail API) | 4 | Booking confirmations, results, links | Yes - day 5 |
| OCR service (OCR.space or equivalent) | 1 | Text extraction from scanned/image resumes | Yes - day 2 |
| Google Gemini (vision) | 1 | Fallback resume text extraction when OCR misses | Optional |
| Meta WhatsApp Business API | 4 | Candidate WhatsApp messages | No - cut in Section 14 |
| SMS provider (e.g. Twilio) | 4 | Enterprise-tier fallback channel | No |
| Stripe | 12 | Billing, top-ups, tier upgrades | No - cut in Section 14 |
| n8n (self-hosted or cloud) | All | Workflow orchestration | Yes - day 1 |

Credentials to have ready before Day 1: a Supabase project, an OpenAI API key, a Google Cloud OAuth client (Calendar scope), an OCR.space or equivalent key, and an email-sending domain verified in SES or Gmail.

---

## 16. Principal Frontend Engineer build prompt (2026 standard)

Section 13 (+13a/13b/13c) is the functional contract — every page, every webhook, every payload. This is the engineering standard to build it to: stack, architecture, and conventions a principal frontend engineer would insist on in 2026.

### STACK
- Next.js 15+ (App Router, React Server Components by default; "use client" only where interactivity genuinely requires it).
- TypeScript, strict mode, no `any` without a `// TODO(reason)` comment and a linked issue.
- Tailwind CSS v4 (CSS-first config) + shadcn/ui (Radix primitives) as the component layer — never hand-roll a primitive shadcn/ui already ships (Dialog, Popover, Select, Tabs, Toast, Sheet, Command, Skeleton).
- TanStack Query v5 for every server-state read/mutation (n8n webhooks AND Supabase client reads alike) — no useEffect-based fetching anywhere. Wrap Supabase's client so its reads go through the same useQuery/useMutation pattern.
- Zustand for client-only UI state that must survive route changes (wizard step state, sidebar collapsed/expanded, active filters) — not for server data. Local `useState` for everything else.
- React Hook Form + Zod for every form, schema-first — the same Zod schema validates client-side and is reused to type the webhook payload.
- next-themes for light/dark/system theming.
- Recharts (or Tremor — pick one, no mixing) for every chart.
- `next-safe-action` or a thin typed fetch wrapper for every n8n webhook call — one `callWorkflow(path, body)` helper, typed per-call via Zod, used everywhere.
- Vitest + React Testing Library (unit/component), Playwright (e2e).
- Biome for lint + format, enforced in CI and as a pre-commit hook.

### ARCHITECTURE & PROJECT STRUCTURE
Feature-based, not type-based — group by domain (campaigns, candidates, billing).

```
src/
  app/                          - Next.js App Router routes only (thin)
    (recruiter)/                - route group: authenticated recruiter-facing pages
      dashboard/page.tsx
      campaigns/[id]/page.tsx
    (candidate)/                - route group: public candidate-facing pages, no auth
      book/[roundInstanceId]/page.tsx
      interview/[sessionId]/conduct/page.tsx
    api/                        - route handlers ONLY for what the browser can't do directly
  features/
    campaigns/{api.ts,hooks.ts,components/,schema.ts}
    candidates/ ...
    billing/ ...
    notifications/ ...
  components/
    ui/                         - shadcn/ui primitives, unmodified from the CLI
    shared/                     - cross-feature composites (TierLimitToast, MetricCard, CardGrid, AppShell, PageHeader)
  lib/
    supabase/client.ts          - one Supabase client instance, RLS-scoped
    webhooks.ts                 - callWorkflow(), base URL from env
    query-client.ts             - one QueryClient instance + defaults
  stores/                       - Zustand stores, one file per store
  types/                        - generated Supabase types + webhook response types
```

Rule: a component never imports directly from another feature's folder. Cross-feature reuse goes through `components/shared/` or `lib/`.

### DATA LAYER
- Every RLS-scoped Supabase read goes through a useQuery hook in that feature's `hooks.ts`. Query keys follow `['feature','resource',params]` (e.g. `['campaigns','detail',campaignId]`).
- Every n8n webhook call goes through `callWorkflow()` wrapped in a `useMutation`; on success invalidate the exact keys affected.
- Server Components fetch initial data directly (no client waterfall); client components hydrate via TanStack Query `initialData`.
- Prefer Supabase Realtime over polling where the table is RLS-scoped; else `refetchInterval` 5–30s.

### ERROR HANDLING STANDARD
- One typed error shape: `{ error: string, detail?: string, reason?: string }` (403 tier-limit, 402 credit-exhaustion — verify workflow 7).
- `<TierLimitToast />` is the ONLY way a 402/403 reaches the user. `reason` copy: `'hard_stop'` → upgrade CTA; `'held_for_window'|'held_for_cap'` → informational, no red.
- Every `useMutation.onError` reports to error tracking with workflow path + `account_id` before showing the toast.
- Network/5xx → generic "something went wrong, retry" toast with a real Retry button wired to the same mutation.

### PERFORMANCE
- Route-level code splitting automatic; dynamic-import genuinely heavy rare pieces (assignment uploader, recording/transcript player, non-dashboard charts).
- `next/image` everywhere for resume/logo/avatar; no bare `<img>`.
- Core Web Vitals targets: LCP < 2.5s, INP < 200ms, CLS < 0.1 on Dashboard and Campaign Detail; Lighthouse CI in the pipeline.
- `staleTime` 30s default; `Infinity` for `tier_limits` and notification templates.

### ACCESSIBILITY
WCAG 2.1 AA: keyboard-reachable, visible focus ring (never override focus-visible away); real `<label>`s; errors via `aria-describedby`; AI Interview Conduct page needs visible transcript/captions + plain-language proctoring consent; axe-core in CI on every page.

### TESTING
- Unit/component (Vitest + RTL): every shared component + every Zod schema edge case.
- Integration: every feature's `hooks.ts` against mocked n8n/Supabase (MSW) — verify query-key invalidation and 403/402 → TierLimitToast.
- E2E (Playwright): critical paths only — sign-up→first campaign, resume upload→scored candidate, booking flow, AI interview conduct. Run on merge to main + nightly against staging, not every PR.
- CI: lint + typecheck + unit + integration on every PR.

### CI/CD & ENVIRONMENTS
- Three environments: local (staging n8n + staging Supabase), staging (auto on merge to main), production (manual promote). Separate Supabase projects per environment.
- Vercel preview deployments per PR wired to staging Supabase.
- Env vars per Section 13c, validated at build time via Zod `env.ts` (never a runtime crash for a blank var).

### CODE QUALITY CONVENTIONS
- No default exports except Next.js `page.tsx`/`layout.tsx`.
- Every shared component has a co-located `.stories.tsx`.
- Conventional Commits enforced via commitlint.
- No commented-out code committed.

---

## 17. Product modules — and the Billing/Payments module in full

Sections 13/16 described pages and code architecture. This section describes the app as modules the way a recruiter/admin experiences it, and designs the upgrade/payment flow.

### The 9 modules

| Module | What lives here | Who sees it |
|---|---|---|
| Auth & Onboarding | sign-up/in, first-account bootstrap, empty-state "create your first campaign" | Recruiter/Admin |
| Dashboard | KPI card matrix, funnel, time-to-hire, source effectiveness (13a/13b) | Recruiter/Admin |
| Recruitment | Campaigns, Candidates, round pipeline, resume intake | Recruiter |
| Interviews | Booking, AI conduct, human scheduling, assignment submission | Recruiter + Candidate |
| Team & Collaboration | Team members, roles, calendar connect | Recruiter/Admin |
| Notifications | Templates, send-window/cap prefs, outreach history | Admin |
| Billing & Payments | Plan, usage, upgrade, payment method, invoices | Admin/Owner only |
| Analytics & Reporting | The three views (13b), exportable | Recruiter/Admin |
| Settings & Admin | Account details, sending identity, audit log | Admin/Owner |

Role gating: only `team_members.role = 'owner' or 'admin'` can see the Billing & Payments module at all — an `interviewer` must not even see the nav item (hidden, not disabled).

### BILLING & PAYMENTS MODULE (/billing)
Four sub-views, not one page. Data: `accounts.tier`, `tier_limits`, `accounts.billing_status`, `credit_ledger`, Stripe webhook (workflow 12).

1. **OVERVIEW (default view)**
   - Plan card: current tier name + price, `billing_status` badge (active/trialing/past_due/canceled/incomplete), "renews on {billing_anchor_date}" or Enterprise "true-up on {next_true_up_date}".
   - Usage: one `MetricCard` per `credit_type` (`ai_interview`, `ai_voice_screening`, `scheduled_round`, `offer_letters`) — used/included progress bar, amber past 80%, red past 100% with "X over included, billed at metered rate" for Growth's metered overage, hard "upgrade to continue" for hard_stop tiers at 100%.
   - Primary CTA "Change plan" → Upgrade Modal. Secondary "Manage payment method", "View invoices" switch the view in-place (never separate routes).

2. **UPGRADE / CHANGE PLAN (modal, not a full page)**
   - Monthly/Annual toggle only if annual pricing exists (omit rather than show non-functional).
   - Plan comparison: 3–4 cards (Free / Basic / Growth / Enterprise), desktop side-by-side, mobile stacked/swipeable. Each: tier name, price, one-line positioning, feature checklist pulled LIVE from `tier_limits` (resumes/mo, active campaigns, AI interview credits, voice screening included/not, `reach_out_channels` as icons, `round_types_available` flagging "Assignment rounds" as Growth+), current plan visually distinct with disabled "Your current plan" CTA, others "Upgrade to {tier}" (filled) / "Downgrade to {tier}" (ghost), Enterprise always "Contact sales".
   - Upgrade click (Free/Basic/Growth): no `stripe_customer_id` → collect payment method first (Stripe Payment Element embedded inline, no redirect); exists → confirmation step "You'll be charged {proration_amount} now, then {new_price}/mo starting {next_billing_date}" (Stripe's proration preview API — never computed client-side).
   - Downgrade click: confirmation "You'll keep {current_tier} features until {billing_anchor_date}, then move to {new_tier}" + plain-language list of what they lose (from `tier_limits` diff).
   - Loading state: spinner "Updating your plan…", THEN poll/refetch `accounts.tier` until it reflects the change before closing (Stripe webhook is async — never optimistically close).

3. **PAYMENT METHOD**
   - Current card: brand icon + last4 + expiry + "Default" badge.
   - "Update payment method" opens Stripe's Payment Element inline (same component as upgrade modal's collection step — one component, two entry points).
   - `past_due` → red-bordered card + "Your last payment failed — update your payment method to avoid service interruption" (revenue-at-risk, get this right).

4. **INVOICES**
   - Table: date, description (plan name + period), amount, status (paid/open/void), "Download PDF" via Stripe's `hosted_invoice_url`/`invoice_pdf` (never re-render invoices yourself).
   - Free-tier empty state: "No invoices yet" + the plan card's upgrade CTA (not a bare empty table).

**DATA SOURCE NOTE:** no new backend work beyond workflow 12's Stripe integration + `accounts.billing_status`/`stripe_customer_id`/`stripe_subscription_id`/`tier_limits`. The ONE missing backend piece: a Stripe-side call to create/update the subscription and collect payment method from the browser (Payment Element needs a client secret from a server-created PaymentIntent/SetupIntent) — a small addition to workflow 12 or a dedicated endpoint. Flagged explicitly rather than implying it already works.
