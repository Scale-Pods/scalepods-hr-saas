# Editable Tier-Gated Campaign Cadence — Design

**Date:** 2026-09-24
**Status:** Approved

## Goal

Let a recruiter configure the outreach cadence for a campaign they are creating, instead of the current fixed, read-only "Cadence preview — what your plan actually sends" table. How much a recruiter can change depends on their tier. The chosen settings travel through the existing `/webhook/campaigns` → n8n flow and are persisted on the campaign as a `cadence_config` JSON blob.

## Current state

- `packages/core/src/cadence.ts` hardcodes `CADENCE_STAGES` (shortlist, reminder Day 1/3/5, interview-day link, voice screen, assignment 24h-deadline, result) and renders per-tier entitlement via `cadenceForTier(tier, roundType)` — read-only.
- The create-campaign page (apps/web `(recruiter)/campaigns/new/page.tsx`) shows that preview via `components/campaigns/CadencePreview.tsx` — no user controls.
- The create body only carries `name, jd_text, number_of_rounds, rounds[{round_number, round_type, interviewer_email, cutoff_score, daily_start_time, daily_end_time, brief_text, assignment_deadline_hours}]`. Nothing cadence-related.
- n8n hand-codes the dispatch timing in the reminder workflow (booking reminders Day 1/3/5 from `created_at`, pre-interview reminder 23–25h before, link dispatch 0–1h + hour 9, assignment midpoint + 24h).

## Data model

New optional `cadence_config jsonb` column on `campaigns` (migration `0006`). `null` or absent means "use the plan defaults".

```ts
export type CadenceChannel = "email" | "whatsapp" | "voice_call";

export type CadenceStageKey =
  | "shortlist"
  | "reminder_day1"
  | "reminder_day3"
  | "reminder_day5"
  | "pre_interview_reminder"
  | "interview_day"
  | "voice_screen"
  | "assignment_deadline"
  | "result";

export interface CadenceConfigStage {
  enabled: boolean;
  /** Subset of the tier's channel entitlements; email is always allowed. */
  channels: CadenceChannel[];
  /** Pre-interview / assignment stages. Clamped to 0–168. Growth+ only. */
  hoursBefore?: number;
  /** Interview-day link dispatch hour. Clamped to 0–23. Growth+ only. */
  sendHour?: number;
}

export interface CadenceConfig {
  stages: Partial<Record<CadenceStageKey, CadenceConfigStage>>;
}
```

Notes:

- Day offsets are not a separate knob: `reminder_day1/3/5` are independent stages, so enabling/disabling them *is* choosing the offset set.
- `pre_interview_reminder` is a **new stage** added to `CADENCE_STAGES` that mirrors what n8n already sends (reminder ~24h before a scheduled round).
- Stored configs are normalized/slim: `{}` for stages left at their plan default (so diffs stay small and forward-compatible).

## Tier flexibility

| Tier | Can change | Timing knobs |
|---|---|---|
| Free | nothing (read-only preview; email-only plan) | — |
| Basic | enable/disable stages + per-stage channels (email always on; WhatsApp/voice where entitled) | — |
| Growth | Basic, plus timing inputs | `pre_interview_reminder.hoursBefore` (default 24), `interview_day.sendHour` (default 9), `assignment_deadline.hoursBefore` (default 24) |
| Enterprise | same as Growth | same as Growth |

## UI

`components/campaigns/CadencePreview.tsx` becomes an editor while keeping a read-only variant:

- `CadencePreview` — stays, unchanged for Free and the settings page.
- `CadenceEditor` — new. Receives `tier`, `rows` (tier-resolved, as today) and an `onChange(config)` callback.

Row rendering:

- Switch per stage (disabled when the stage is not entitled for the campaign's round set, e.g. assignment stages when no assignment round).
- Channel chips per stage rendered as toggle chips (checkbox semantics); the tier's non-entitled channels are shown dimmed and locked (tooltip "Requires the Basic tier", reuse `tierEntitlementReason`).
- Timing inputs (right-aligned in the Channels cell) shown only for stages with a knob, and only enabled on Growth/Enterprise (disabled + lock icon below that with a "Growth+" tooltip).

State flows from create-page `useState<CadenceConfig>`. The page initializes from `defaultCadenceForTier(tier)` (new core helper) and merges the editor's changes into the campaign payload.

## Data flow / webhook contract

Submit appends `cadence_config` (zod-optional) to the existing `/webhook/campaigns` create body, alongside the current fields:

```json
{
  "action": "create",
  "account_id": "…",
  "name": "…",
  "jd_text": "…",
  "number_of_rounds": 2,
  "rounds": [ … ],
  "cadence_config": {
    "stages": {
      "reminder_day3": { "enabled": false },
      "pre_interview_reminder": { "enabled": true, "channels": ["email", "whatsapp"], "hoursBefore": 24 },
      "interview_day": { "enabled": true, "channels": ["email", "whatsapp"], "sendHour": 9 }
    }
  }
}
```

- `campaignCreateSchema` and `campaignUpdateSchema` in `packages/core/src/schemas.ts` gain an optional `cadence_config`.
- The `/campaigns` n8n workflow (external) must insert/patch `cadence_config` into `campaigns`. The design ships the exact node JSON snippet for that change.
- The reminder workflow (external) reads `campaigns.cadence_config` joined by `round_instance.campaign_id` and consults it in each Compute Code node instead of the hardcoded Day 1/3/5, 23–25h, 9 AM, and 24h values. Reference snippet shipped in this doc.

## Migration

`supabase/migrations/0006_campaign_cadence.sql`:

```sql
alter table campaigns
  add column cadence_config jsonb;

comment on column campaigns.cadence_config is
  'Per-campaign outreach cadence overrides. null = use plan defaults (CADENCE_STAGES in @scalepods/core).';
```

## Core helpers (packages/core/src/cadence.ts)

- `defaultCadenceForTier(tier, config?)` — returns the full config for a tier: every entitled stage/channel on by default; used to seed the editor and to produce a webhook-safe slim body (only stages differing from the default).
- `cadenceTierEditability(tier)` — `{ stages: boolean; channels: boolean; timing: boolean }` driving which controls render enabled.
- `clampCadence(config)` — normalizes numbers (0–168 hours, 0–23 hour, integer), drops unknown keys, forces channel subsets to the tier's entitlements.
- Prefer `tierEntitlementReason` for locked-channel tooltips.

## Testing

Core (vitest, `packages/core`):

- `defaultCadenceForTier` returns email-on for free, WhatsApp/voice added per Basic+, interview/assignment stages present only for the round types they apply to.
- `clampCadence` clamps out-of-range hours/hour values and strips non-entitled channels.
- `cadenceTierEditability` — timing false below Growth.

Frontend (vitest, `apps/web`):

- Editor renders a switch + channels per row; time inputs are absent/disabled below Growth.
- Changing a toggle fires `onChange` with a slim stage entry.
- Create-page submit serializes the editor state into `cadence_config` in the payload and it satisfies `campaignCreateSchema`.

## Out of scope

- Editing cadence for an **existing** campaign (a follow-up: extend `/campaigns` `update` action + a cadence editor on the campaign detail page).
- Rebaking already-created `round_instances` when cadence changes.
- Custom sending identity (already separate and tier-gated elsewhere).
- Voice-screen attempt config.