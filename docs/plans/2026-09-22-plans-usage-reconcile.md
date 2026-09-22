# Authoritative Plans Table + Usage Reconcile — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the web app display plan-derived usage allowances (Enterprise = unlimited, not n8n's free-tier `1/1`) by adding an authoritative `PLANS` table in `@scalepods/core` and reconciling `GET /webhook/reports` `granted` with `plan allowance + rolled_over + purchased`.

**Architecture:** Add a pure, shared `PLANS` table + `effectiveGranted()` in `packages/core` (design: `docs/plans/2026-09-22-plans-usage-reconcile-design.md`). Add `reconcileUsage()` in `apps/web/src/features/dashboard` and wire it into the dashboard Usage bars/card and the Billing Usage rows. `used` stays from reports; `granted` is always recalculated from the plan. `TIER_LIMITS`, gating, compare table and DB `tier_limits` are untouched; `apps/legacy` untouched.

**Tech Stack:** TypeScript, Vitest (`apps/web` runner), `@scalepods/core` workspace package, Next.js 15 app router, Biome.

---

## Prep: running checks

Commands are run from `apps/web` (for vitest) or the repo root (typecheck/lint). The web vitest config (`apps/web/vitest.config.ts:11`) only includes `src/**`; Task 1 widens it to also pick up core's co-located tests.

---

### Task 1: Core plans tests + widen web vitest include

**Files:**
- Create: `packages/core/src/plans.test.ts`
- Modify: `apps/web/vitest.config.ts:11`

**Step 1: Write the failing test**

`packages/core/src/plans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { effectiveGranted, PLANS } from "./plans";

describe("PLANS authoritative plan table", () => {
  it("treats Enterprise AI/voice/scheduled allowances as unlimited", () => {
    expect(PLANS.enterprise.aiInterviewCreditsIncluded).toBeNull();
    expect(PLANS.enterprise.aiVoiceScreeningCreditsIncluded).toBeNull();
    expect(PLANS.enterprise.scheduledRoundsPerMonth).toBeNull();
    expect(PLANS.enterprise.overageBehavior).toBe("committed_volume");
  });

  it("mirrors the Section 4.1 values for the other tiers", () => {
    expect(PLANS.free.aiInterviewCreditsIncluded).toBe(1);
    expect(PLANS.basic.aiInterviewCreditsIncluded).toBe(10);
    expect(PLANS.growth.aiInterviewCreditsIncluded).toBe(100);
    expect(PLANS.growth.aiVoiceScreeningCreditsIncluded).toBe(300);
    expect(PLANS.growth.scheduledRoundsPerMonth).toBe(250);
    expect(PLANS.growth.overageBehavior).toBe("metered");
    expect(PLANS.basic.activeCampaigns).toBe(5);
    expect(PLANS.enterprise.roundTypesAvailable).toContain("custom");
    expect(PLANS.free.aiInterviewRollover).toBe(false);
  });
});

describe("effectiveGranted", () => {
  it("returns null (unlimited) when the plan allowance is null, ignoring n8n granted", () => {
    expect(effectiveGranted(PLANS.enterprise, "ai_interview", { used: 1, granted: 1 })).toBeNull();
  });

  it("starts from the plan allowance and ignores n8n granted", () => {
    expect(effectiveGranted(PLANS.free, "ai_interview", { used: 1, granted: 999 })).toBe(1);
  });

  it("adds rolled_over and purchased to the allowance", () => {
    expect(
      effectiveGranted(PLANS.growth, "ai_interview", { used: 4, granted: 0, rolled_over: 5, purchased: 10 }),
    ).toBe(115);
  });

  it("defaults missing rollover/purchase to 0", () => {
    expect(effectiveGranted(PLANS.basic, "scheduled_round", undefined)).toBe(100);
  });
});
```

Modify `apps/web/vitest.config.ts:11`:

```ts
include: [
  "src/**/*.{test,spec}.{ts,tsx}",
  "../../packages/core/src/**/*.{test,spec}.{ts,tsx}",
],
```

**Step 2: Run test to verify it fails**

Run (workdir `apps/web`): `npx vitest run packages/core/src/plans.test.ts`
Expected: FAIL — `Failed to resolve import "./plans"`.

**Step 3: Commit**

```bash
git add apps/web/vitest.config.ts packages/core/src/plans.test.ts
git commit -m "test(core): add authoritative plans table tests"
```

---

### Task 2: Implement `plans.ts` in core

**Files:**
- Create: `packages/core/src/plans.ts`
- Modify: `packages/core/src/index.ts:1-9`

**Step 1: Write minimal implementation**

`packages/core/src/plans.ts`:

```ts
import type { RoundType, Tier } from "./types";

export type OverageBehavior = "hard_stop" | "metered" | "committed_volume";
export type ReachOutChannel = "email" | "whatsapp" | "sms";
export type ReachOutCadence = "reduced" | "standard" | "full" | "configurable";
export type SupportLevel = "email_48h" | "priority_24h" | "dedicated_csm" | null;
export type PlanRoundType = RoundType | "custom";
export type CreditType = "ai_interview" | "ai_voice_screening" | "scheduled_round";

/** Report slice fields the reconcile reads (structurally a UsageSlice). */
export interface CreditUsage {
  rolled_over?: number;
  purchased?: number;
}

/** Authoritative plan table (spec Section 4.1). `null` numeric = unlimited. */
export interface Plan {
  label: string;
  resumesPerMonth: number | null;
  activeCampaigns: number | null;
  roundsPerCampaign: number | null;
  scheduledRoundsPerMonth: number | null;
  aiInterviewCreditsIncluded: number | null;
  aiInterviewRollover: boolean;
  aiVoiceScreeningCreditsIncluded: number | null;
  concurrentAiSessions: number | null;
  offerLettersPerMonth: number | null;
  mediaRetentionDays: number | null;
  reachOutChannels: ReachOutChannel[];
  reachOutCadence: ReachOutCadence;
  roundTypesAvailable: PlanRoundType[];
  overageBehavior: OverageBehavior;
  supportLevel: SupportLevel;
}

const CREDIT_FIELD: Record<CreditType, keyof Plan> = {
  ai_interview: "aiInterviewCreditsIncluded",
  ai_voice_screening: "aiVoiceScreeningCreditsIncluded",
  scheduled_round: "scheduledRoundsPerMonth",
};

/**
 * Displayed allowance for a credit type. Never trusts a report's `granted`:
 * plan allowance + rollover + purchases. Returns null for unlimited plans.
 */
export function effectiveGranted(
  plan: Plan,
  type: CreditType,
  usage?: CreditUsage,
): number | null {
  const allowance = plan[CREDIT_FIELD[type]] as number | null;
  if (allowance == null) return null;
  return allowance + (usage?.rolled_over ?? 0) + (usage?.purchased ?? 0);
}

export const PLANS: Record<Tier, Plan> = {
  free: {
    label: "Free",
    resumesPerMonth: 15,
    activeCampaigns: 2,
    roundsPerCampaign: 2,
    scheduledRoundsPerMonth: 2,
    aiInterviewCreditsIncluded: 1,
    aiInterviewRollover: false,
    aiVoiceScreeningCreditsIncluded: null,
    concurrentAiSessions: 1,
    offerLettersPerMonth: 0,
    mediaRetentionDays: 7,
    reachOutChannels: ["email"],
    reachOutCadence: "reduced",
    roundTypesAvailable: ["ai_interview", "human_interview"],
    overageBehavior: "hard_stop",
    supportLevel: null,
  },
  basic: {
    label: "Basic",
    resumesPerMonth: 500,
    activeCampaigns: 5,
    roundsPerCampaign: 3,
    scheduledRoundsPerMonth: 100,
    aiInterviewCreditsIncluded: 10,
    aiInterviewRollover: true,
    aiVoiceScreeningCreditsIncluded: 100,
    concurrentAiSessions: 3,
    offerLettersPerMonth: 5,
    mediaRetentionDays: 90,
    reachOutChannels: ["email", "whatsapp"],
    reachOutCadence: "standard",
    roundTypesAvailable: ["ai_interview", "human_interview"],
    overageBehavior: "hard_stop",
    supportLevel: "email_48h",
  },
  growth: {
    label: "Growth",
    resumesPerMonth: null,
    activeCampaigns: 25,
    roundsPerCampaign: 6,
    scheduledRoundsPerMonth: 250,
    aiInterviewCreditsIncluded: 100,
    aiInterviewRollover: true,
    aiVoiceScreeningCreditsIncluded: 300,
    concurrentAiSessions: 10,
    offerLettersPerMonth: null,
    mediaRetentionDays: 365,
    reachOutChannels: ["email", "whatsapp"],
    reachOutCadence: "full",
    roundTypesAvailable: ["ai_interview", "human_interview", "assignment"],
    overageBehavior: "metered",
    supportLevel: "priority_24h",
  },
  enterprise: {
    label: "Enterprise",
    resumesPerMonth: null,
    activeCampaigns: null,
    roundsPerCampaign: null,
    scheduledRoundsPerMonth: null,
    aiInterviewCreditsIncluded: null,
    aiInterviewRollover: true,
    aiVoiceScreeningCreditsIncluded: null,
    concurrentAiSessions: null,
    offerLettersPerMonth: null,
    mediaRetentionDays: null,
    reachOutChannels: ["email", "whatsapp", "sms"],
    reachOutCadence: "configurable",
    roundTypesAvailable: ["ai_interview", "human_interview", "assignment", "custom"],
    overageBehavior: "committed_volume",
    supportLevel: "dedicated_csm",
  },
};
```

Add to `packages/core/src/index.ts` (alphabetical, after `./format`): `export * from "./plans";`

**Step 2: Run test to verify it passes**

Run (workdir `apps/web`): `npx vitest run packages/core/src/plans.test.ts`
Expected: PASS (5 tests).

**Step 3: Typecheck core**

Run (root): `npm run typecheck --workspace @scalepods/core`
Expected: no errors.

**Step 4: Commit**

```bash
git add packages/core/src/plans.ts packages/core/src/index.ts
git commit -m "feat(core): add authoritative plans table and effectiveGranted"
```

---

### Task 3: Web reconcile helper + tests

**Files:**
- Create: `apps/web/src/features/dashboard/usage.ts`
- Create: `apps/web/src/features/dashboard/usage.test.ts`

**Step 1: Write the failing test**

`apps/web/src/features/dashboard/usage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reconcileUsage } from "./usage";

describe("reconcileUsage", () => {
  it("reports Enterprise ai_interview as unlimited even when n8n grants 1", () => {
    const out = reconcileUsage(
      { ai_interview: { used: 1, granted: 1 } },
      "enterprise",
    );
    expect(out.ai_interview).toEqual({ used: 1, granted: null });
  });

  it("uses the plan allowance for free, ignoring reports granted", () => {
    const out = reconcileUsage({ ai_interview: { used: 1, granted: 999 } }, "free");
    expect(out.ai_interview.granted).toBe(1);
  });

  it("adds rolled_over and purchased for growth", () => {
    const out = reconcileUsage(
      { ai_interview: { used: 4, granted: 0, rolled_over: 5, purchased: 10 } },
      "growth",
    );
    expect(out.ai_interview.granted).toBe(115);
  });

  it("passes through used and defaults a missing slice", () => {
    const out = reconcileUsage(undefined, "basic");
    expect(out.scheduled_round).toEqual({ used: 0, granted: 100 });
    expect(out.ai_voice_screening.granted).toBe(100);
  });
});
```

**Step 2: Run test to verify it fails**

Run (workdir `apps/web`): `npx vitest run src/features/dashboard/usage.test.ts`
Expected: FAIL — `Failed to resolve import "./usage"`.

**Step 3: Write minimal implementation**

`apps/web/src/features/dashboard/usage.ts`:

```ts
import { effectiveGranted, PLANS, type CreditType, type Tier, type UsageSlice } from "@scalepods/core";

export interface ReconciledSlice {
  used: number;
  granted: number | null;
}

export type ReconciledUsage = Record<CreditType, ReconciledSlice>;

const CREDIT_TYPES: CreditType[] = ["ai_interview", "ai_voice_screening", "scheduled_round"];

/**
 * Displayed usage slices: `used` from reports, `granted` from the authoritative
 * plan (never n8n's `granted`). Enterprise resolves to unlimited (null).
 */
export function reconcileUsage(
  usage:
    | { ai_interview?: UsageSlice; ai_voice_screening?: UsageSlice; scheduled_round?: UsageSlice }
    | undefined,
  tier: Tier,
): ReconciledUsage {
  const out = {} as ReconciledUsage;
  for (const type of CREDIT_TYPES) {
    const slice = usage?.[type];
    out[type] = {
      used: slice?.used ?? 0,
      granted: effectiveGranted(PLANS[tier], type, slice),
    };
  }
  return out;
}
```

**Step 4: Run test to verify it passes**

Run (workdir `apps/web`): `npx vitest run src/features/dashboard/usage.test.ts`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add apps/web/src/features/dashboard/usage.ts apps/web/src/features/dashboard/usage.test.ts
git commit -m "feat(web): add usage reconcile helper"
```

---

### Task 4: Wire dashboard Usage bars + AI credits card

**Files:**
- Modify: `apps/web/src/app/(recruiter)/dashboard/page.tsx:108-113` (usage block) and the UsageBars render (`~line 204-215`)

**Step 1: Read current code to anchor edits**

`dashboard/page.tsx:108-113`:

```ts
const usage = reports.data?.usage;
const aiUsage = usage?.ai_interview;
const aiGranted = aiUsage?.granted ?? TIER_LIMITS[tier].aiInterview;
const aiUsed = aiUsage?.used ?? 0;
const creditsRemaining = aiGranted != null ? Math.max(0, aiGranted - aiUsed) : null;
const creditsLow = aiGranted != null && aiUsed / Math.max(1, aiGranted) > 0.9;
```

**Step 2: Implement**

Replace the block above with:

```ts
const reconciled = reconcileUsage(reports.data?.usage, tier);
const aiGranted = reconciled.ai_interview.granted;
const aiUsed = reconciled.ai_interview.used;
const creditsRemaining = aiGranted != null ? Math.max(0, aiGranted - aiUsed) : null;
const creditsLow = aiGranted != null && aiUsed / Math.max(1, aiGranted) > 0.9;
```

Update the Usage section to pass reconciled slices. Find `UsageBars` usage (`~page.tsx:206-214`) and pass `slices={reconciled}` (its shape — `{ ai_interview?: {used?, granted?}, ... }` — matches `ReconciledUsage`). Keep the existing `fallback` prop unchanged.

Add the import near the other `@/features/dashboard` imports (line ~36-42):

```ts
import { reconcileUsage } from "@/features/dashboard/usage";
```

**Step 3: Verify**

Run (workdir `apps/web`): `npx vitest run src/features/dashboard/usage.test.ts src/features/campaigns/api.test.ts src/env.test.ts`
Expected: PASS.

Run (root): `npm run typecheck --workspace @scalepods/web`
Expected: no errors.

**Step 4: Commit**

```bash
git add "apps/web/src/app/(recruiter)/dashboard/page.tsx"
git commit -m "feat(web): show plan-derived allowed usage on dashboard"
```

---

### Task 5: Wire Billing usage rows

**Files:**
- Modify: `apps/web/src/app/(recruiter)/billing/page.tsx:97-113`

**Step 1: Read current code to anchor edits**

`billing/page.tsx:97-113` builds `usageRows` with `granted: reports?.usage?...?.granted ?? TIER_LIMITS[tier].<cap>` for three rows.

**Step 2: Implement**

After `const tier = ...` add:

```ts
const reconciled = reconcileUsage(reports?.data?.usage, tier);
```

Replace the three `usageRows` `granted` values:

```ts
{
  label: "AI interviews",
  used: reconciled.ai_interview.used,
  granted: reconciled.ai_interview.granted,
},
{
  label: "Voice screens",
  used: reconciled.ai_voice_screening.used,
  granted: reconciled.ai_voice_screening.granted,
},
{
  label: "Scheduled rounds",
  used: reconciled.scheduled_round.used,
  granted: reconciled.scheduled_round.granted,
},
```

(The existing `r.granted ? ... : 0` percent guard already handles `granted === null` → 0.)

Add the import:

```ts
import { reconcileUsage } from "@/features/dashboard/usage";
```

Remove now-unused `TIER_LIMITS` usage if `reconcileUsage` leaves it unused for the rows — keep any other `TIER_LIMITS` reference it still needs (the `tierLabel`/compare modal uses it).

**Step 3: Verify**

Run (root): `npm run typecheck --workspace @scalepods/web`
Expected: no errors (watch for `unused` warnings from biome/tsc; remove dead imports).

**Step 4: Commit**

```bash
git add "apps/web/src/app/(recruiter)/billing/page.tsx"
git commit -m "feat(web): reconcile billing usage rows from plans table"
```

---

### Task 6: Full verification

**Files:** none (checks only)

**Step 1: Run all web tests**

Run (workdir `apps/web`): `npx vitest run`
Expected: all PASS.

**Step 2: Typecheck all workspaces**

Run (root): `npm run typecheck`
Expected: no errors.

**Step 3: Lint**

Run (root): `npm run lint`
Expected: Biome reports 0 issues (fix formatting with `npm run format` for any trailing whitespace/biome diffs, then re-run lint).

**Step 4: Confirm git status**

Run (root): `git status --short`
Expected: only the files from this plan are staged/committed; pre-existing user changes (auth page, interview conduct page, `src/types/`, etc.) remain untouched.

---

## Verification (behavioral)

With an account whose `accounts.tier = 'enterprise'` and reports returning `usage.ai_interview = { used: 1, granted: 1 }`:

- Dashboard "AI credits remaining" renders `—` (unlimited), no "90% used" banner.
- Usage bar shows `1 / unlimited` for AI interviews, `voice/scheduled` remain `0 / unlimited`.
- Billing rows show the same reconciled numbers.

For `growth`, a report `{ used: 4, granted: 999, rolled_over: 5, purchased: 10 }` renders `4 / 115`.

## Rollback

Revert the commits from Tasks 1-5 (`git revert` in reverse order); `plans.ts` and the helper are additive, so nothing else references them after revert.