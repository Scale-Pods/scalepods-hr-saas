# Authoritative Plans Table + Usage Grant Reconciliation (Design)

Date: 2026-09-22
Status: Approved

## Problem

A frontend account can show `Enterprise plan` (from `accounts.tier`, read via
`apps/web/src/features/account/api.ts`) while the Usage card reports a free-tier
grant (`AI interviews 1 / 1 · 0 credits remaining · 90% used`). The reason: the
usage `granted` value is taken verbatim from `GET /webhook/reports` (n8n), which
is issuing free-tier allowances for an Enterprise account.

The repo has no n8n source, so the authoritative plan cannot be fixed there.
This change makes the frontend stop trusting n8n's `granted` for plan-derived
allowances and instead compute the displayed allowance from an authoritative
plan table (per the spec's Section 4.1 tier config) plus rollover/purchases the
reports still provide.

## Decisions

- Authoritative plan lives in `packages/core` as a static table
  (`PLANS`), shared by both apps; DB `tier_limits` mirrors stay advisory.
- Allowance shown = plan allowance + `reports.usage.*.rolled_over` +
  `reports.usage.*.purchased`. `used` continues to come from reports.
- Scope: usage reconciliation in the web app only. Round/campaign caps,
  channel locks, the billing compare table, `TIER_LIMITS` and DB `tier_limits`
  are unchanged. `apps/legacy` is untouched (being replaced by `apps/web`).

## Architecture

### Core (`packages/core/src/plans.ts`, new)

- `OverageBehavior = "hard_stop" | "metered" | "committed_volume"`
- `ReachOutChannel = "email" | "whatsapp" | "sms"`
- `ReachOutCadence = "reduced" | "standard" | "full" | "configurable"`
- `SupportLevel = "email_48h" | "priority_24h" | "dedicated_csm" | null`
- `PlanRoundType = RoundType | "custom"`
- `CreditType = "ai_interview" | "ai_voice_screening" | "scheduled_round"`
- `interface Plan` mirroring the spec JSON:
  `resumesPerMonth, activeCampaigns, roundsPerCampaign,
   scheduledRoundsPerMonth, aiInterviewCreditsIncluded,
   aiInterviewRollover, aiVoiceScreeningCreditsIncluded,
   concurrentAiSessions, offerLettersPerMonth, mediaRetentionDays,
   reachOutChannels, reachOutCadence, roundTypesAvailable,
   overageBehavior, supportLevel`
  (numbers are `number | null`, `null` = unlimited)
- `export const PLANS: Record<Tier, Plan>` with the Section 4.1 values:

  | tier | ai_interview_credits_included | voice | scheduled_rounds | overage |
  |------|-------------------------------|-------|-------------------|---------|
  | free | 1 | null | 2 | hard_stop |
  | basic | 10 | 100 | 100 | hard_stop |
  | growth | 100 | 300 | 250 | metered |
  | enterprise | null | null | null | committed_volume |

- Pure helper:
  `effectiveGranted(plan, type, slice): number | null`
  - allowance = per-type credit from the plan
  - `null` allowance → returns `null` (unlimited)
  - otherwise → `allowance + (slice.rolled_over ?? 0) + (slice.purchased ?? 0)`

Exported from `packages/core/src/index.ts`. New `plans.test.ts` covers the
table values and `effectiveGranted` (unlimited; free base; growth
rollover+purchased).

### Web app

- `apps/web/src/app/(recruiter)/dashboard/page.tsx`
  - `aiGranted = effectiveGranted(PLANS[tier], "ai_interview", aiUsage)`
  - `creditsRemaining` / `creditsLow` logic unchanged (null → "—",
    no over-90% banner for Enterprise).
  - Build reconciled usage slices from `reports.usage` (granted set via the
    helper) and pass them to `UsageBars`.
- `apps/web/src/components/dashboard/UsageBars.tsx`
  - Stays presentational; rendered `granted` now always comes from the
    reconciled slices (`slice.granted ?? tierCap ?? null`).
- `apps/web/src/app/(recruiter)/billing/page.tsx`
  - Usage rows use `effectiveGranted(PLANS[tier], type, slice)` instead of
    `slice.granted ?? TIER_LIMITS[tier].<cap>`.

## Data flow

`reports.usage` (n8n) → `effectiveGranted(PLANS[tier], type, slice)` →
`granted` shown in Usage cards/bars; `used` from reports unchanged.

## Error handling

- Missing/partial `reports.usage` slice degrades to the plan allowance only
  (rollover/purchase default to 0). No new throw paths; `reportsSchema` already
  tolerates missing fields.

## Testing

- Core: `packages/core/src/plans.test.ts` (table + `effectiveGranted`).
- Web: existing tests keep passing; add one for reconciled slice building if a
  fixture is cheap.
- Run `npm run typecheck`, lint, and the vitest suites for `packages/core` and
  `apps/web`.

## Out of scope

- n8n workflow fixes (external), `TIER_LIMITS`/gates/compare table alignment,
  DB `tier_limits` migration, `apps/legacy`.