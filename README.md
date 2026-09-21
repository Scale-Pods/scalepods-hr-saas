# ScalePods

Recruiting SaaS platform. A React + TypeScript + Tailwind (Vite) single-page app
with Supabase for auth / database / storage and an **n8n backend** for all
business logic. The frontend is the UI layer only — every state change is a
webhook into your n8n workflows.

## Stack

- Vite 6 + React 19 + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`)
- `@supabase/supabase-js` (typed via `src/lib/supabase-db.ts`)
- `zod` (request/response validation), `react-router-dom` v7
- `pdfjs-dist` + `mammoth` (lazy-loaded resume text extraction)
- Vitest + Testing Library

## Getting started

```bash
npm install
cp .env.example .env        # fill in real values
npm run dev                 # http://localhost:5173
```

Env vars:

| Var | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon (publishable) key |
| `VITE_N8N_BASE_URL` | Root of your n8n instance |
| `VITE_APP_ORIGIN` | Origin used when building candidate links |

## Scripts

```bash
npm run dev       # dev server
npm run build     # typecheck + production build
npm run typecheck
npm run lint      # eslint
npm run test      # vitest
```

## Setting up Supabase

1. Create a project, enable **Email/Password** + **Google** auth providers.
2. Run the migrations in order (`supabase/migrations/`):
   - `0001_schema.sql` — tables (accounts, candidates, campaigns + rounds,
     round_instances, decision_ledger, credit_ledger, outreach_log,
     interview_sessions, scorecards, proctoring_events, audit_log,
     team_members, calendar_connections, calendar_events,
     candidate_access_tokens, assignment_submissions)
   - `0002_rls.sql` — `campaign_candidates` view + tenant-scoped RLS
   - `0003_candidate_rpc.sql` — token-gated RPCs for candidate pages
   - `0004_storage.sql` — private buckets (`resumes`, `interview-recordings`,
     `assignments`)
   - `0005_patch13b.sql` — 13b backend-alignment columns (`round_instances`
     `no_show`/`fault_reason`/`retake_of_round_instance_id`, `accounts`
     `billing_status` + quiet hours + daily message cap), the public
     `tier_limits` table + seeds, and RPC updates exposing retake context

   `supabase db push` or paste each file into the SQL editor.

3. Deploy the Edge Functions in `supabase/functions/` and set their secrets
   (see `supabase/functions/.env.example`):
   - `sign-upload` — token-gated signed upload URLs for candidate files
   - `checkout` — Stripe Checkout for credit top-ups (returns `{ url }`)
   - `portal` — Stripe Customer Portal (invoice history)
   - `stripe-webhook` — grants purchased credits on payment success
   - `score-assignment` — LLM evaluation of take-home assignments, then hands
     off to n8n `/webhook/round-evaluate` for the cutoff check

## How the app talks to n8n

Everything goes through `callWebhook()` in `src/lib/n8n.ts`. A non-2xx
`402` (credit exhaustion) or `403` (hard tier-limit block) is thrown as
`TierLimitError`, and the world reacts with a global `TierLimitToast` + upgrade
CTA (your Credit & Usage Guard workflow should return `{ error, detail?, reason? }`).

Webhook endpoints the frontend calls:

| Endpoint | Method | Used by |
| --- | --- | --- |
| `/webhook/campaigns` | POST | Campaign builder (create) |
| `/webhook/campaigns/:id/status` | POST | Campaign detail (toggle on/off) |
| `/webhook/candidate-intake` | POST (multipart) | Resume upload + screening |
| `/webhook/book-slot` | POST | Candidate booking |
| `/webhook/reschedule` | POST | Candidate reschedule |
| `/webhook/interview-engine` | POST | AI interview conduct |
| `/webhook/score-interview` | POST | AI interview grading |
| `/webhook/interviewers` | POST | Team member management |
| `/webhook/calendar/connect` | GET redirect | Calendar OAuth start (backend drives the Google exchange and returns to `/settings?calendar=connected`) |
| `/webhook/reports` | GET | Dashboard usage / `funnel_conversion` / `time_to_hire` / `source_effectiveness` |
| `/webhook/round-evaluate` | POST | Assignment scoring (from edge fn) |

Recruiter calls send `Authorization: Bearer <JWT>` (the Supabase session token)
so n8n can identify the account. **Never** pass a client-trusted `account_id`
for writes except where the webhook spec explicitly includes it.

### Candidate links

Candidate access is token-gated. n8n creates rows in `candidate_access_tokens`
with a generated token; store the **hash** (`encode(sha256(raw_token),
'hex')`) in `token_hash`, and share links shaped like:

```
{APP_ORIGIN}/book/{round_instance_id}?tok={raw}
{APP_ORIGIN}/assignment/{round_instance_id}?tok={raw}
{APP_ORIGIN}/interview/{session_id}/check?tok={raw}
```

The candidate pages use the anonymous client + SECURITY DEFINER RPCs only; there
is no per-candidate auth and no anon RLS on data tables.

## Known placeholder values (replace me)

- **`src/lib/tier.ts`** `TIER_LIMITS` — static mirror used as an instant
  render + fallback. The authoritative allowances now live in the public
  `tier_limits` table (migrated + seeded in `0005_patch13b.sql`); the dashboard
  and campaign builder merge DB rows over this mirror via
  `src/hooks/useTierLimits.ts`. Growth is `overageBehavior: 'metered'`
  (extra usage billed); every other tier is `'hard_stop'` (UI disabled + server
  403).
branding on scalepods.co.
- **`src/routes/Home.tsx`** — public landing page at `/` (hero + feature grid +
  log in/sign up CTAs to `/auth`). The recruiter app lives under `/dashboard`.
- **`src/lib/cadence.ts`** `CADENCE_STAGES` — placeholder for Section 3.2
  cadence.
- The n8n workflows themselves (the "Unified SaaS Platform" spec) are not in
  this repo.