# Editable Tier-Gated Campaign Cadence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the read-only "Cadence preview" in the create-campaign Reach-out step with an interactive, tier-gated `CadenceEditor`, and push the recruiter's choices through the existing `/webhook/campaigns` create flow as a `cadence_config` JSONB stored on the campaign.

**Architecture:** New pure helpers in `@scalepods/core/src/cadence.ts` (`defaultCadenceForTier`, `cadenceTierEditability`, `clampCadence`, `cadenceConfigPayload`) drive a new `CadenceEditor` component. `CADENCE_STAGES` gains a `pre_interview_reminder` stage so the model mirrors what n8n actually sends. The create page keeps one `CadenceConfig` state, renders the editor at step 2, and appends a slim `cadence_config` to the same `POST /webhook/campaigns` body. A `cadence_config jsonb` column (migration 0006) + `campaignCreateSchema` field carry it through. n8n consumption is external and documented in the reference appendix.

**Tech Stack:** TypeScript, zod v3, React 19, Next 15, Tailwind v4, Radix `Switch`, vitest + @testing-library/react.

**Reference design:** `docs/plans/2026-09-24-editable-campaign-cadence-design.md`

---

## Environment / exec notes (IMPORTANT — read once)

- Repo root: `B:\Scalepods Hr SaaS`; run app commands in `apps/web`, core commands in `packages/core`.
- Pre-commit hook: biome format+lint then commitlint. Allowed types: build,chore,ci,docs,feat,fix,perf,refactor,revert,style,test. Files must be LF + trailing newline; if a hook rejects for formatting normalize with `npx biome format --write <file>` then re-add.
- `skill()`, `glob`, and `grep` tools are broken on this box (`powershell.exe` missing). Use Bash `findstr`/`dir` and the Read/Edit tools only.
- Tests: `apps/web` vitest config already includes `packages/core/src/**/*.{test,spec}.{ts,tsx}` — so core tests run via `npm test` (or `npx vitest run src/...` from `apps/web`).
- Do NOT stage unrelated WIP. The tree has uncommitted user WIP (README, legacy Settings, package.json, auth/conduct/campaigns-id/settings pages, resume-uploader files, package-lock, old plan docs). Only `git add` the files listed per task. Never `git add .` / `git add -A`.

---

### Task 1: Core helpers — types + defaults + clamping + payload (TDD)

**Files:**
- Test: `packages/core/src/cadence.test.ts`
- Modify: `packages/core/src/cadence.ts` (append new code; keep all existing exports)

**Step 1: Write the failing test**

Create `packages/core/src/cadence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  cadenceConfigPayload,
  cadenceTierEditability,
  clampCadence,
  defaultCadenceForTier,
} from "./cadence";
import type { CadenceConfig } from "./cadence";

describe("defaultCadenceForTier", () => {
  it("keeps email-only stages on free and gates WhatsApp/voice/assignment", () => {
    const free = defaultCadenceForTier("free");
    expect(free.stages.shortlist?.channels).toEqual(["email"]);
    expect(free.stages.shortlist?.enabled).toBe(true);
    expect(free.stages.voice_screen?.enabled).toBe(false);
    expect(free.stages.assignment_deadline_24h?.enabled).toBe(false);
  });

  it("adds WhatsApp and voice channels on Basic+", () => {
    const basic = defaultCadenceForTier("basic");
    expect(basic.stages.shortlist?.channels).toEqual(["email", "whatsapp"]);
    expect(basic.stages.voice_screen?.channels).toEqual(["voice_call"]);
    expect(basic.stages.voice_screen?.enabled).toBe(true);
  });

  it("applies timing defaults to timing-aware stages", () => {
    const g = defaultCadenceForTier("growth");
    expect(g.stages.pre_interview_reminder?.hoursBefore).toBe(24);
    expect(g.stages.interview_day?.sendHour).toBe(9);
    expect(g.stages.assignment_deadline_24h?.hoursBefore).toBe(24);
  });
});

describe("cadenceTierEditability", () => {
  it("locks Free, unlocks stages+channels on Basic, timing from Growth", () => {
    expect(cadenceTierEditability("free")).toEqual({
      stages: false,
      channels: false,
      timing: false,
    });
    expect(cadenceTierEditability("basic")).toEqual({
      stages: true,
      channels: true,
      timing: false,
    });
    expect(cadenceTierEditability("growth").timing).toBe(true);
    expect(cadenceTierEditability("enterprise").timing).toBe(true);
  });
});

describe("clampCadence", () => {
  it("drops unknown stage keys and filters channels to the tier entitlement", () => {
    const c = clampCadence(
      { stages: { shortlist: { enabled: true, channels: ["email", "whatsapp"] } } } as CadenceConfig,
      "free",
    );
    expect(Object.keys(c.stages)).toEqual(["shortlist"]);
    expect(c.stages.shortlist?.channels).toEqual(["email"]);
  });

  it("clamps timing values to bounded integers", () => {
    const c = clampCadence(
      {
        stages: {
          pre_interview_reminder: { enabled: true, channels: ["email"], hoursBefore: 999 },
          interview_day: { enabled: true, channels: ["email"], sendHour: 25 },
        },
      },
      "growth",
    );
    expect(c.stages.pre_interview_reminder?.hoursBefore).toBe(168);
    expect(c.stages.interview_day?.sendHour).toBe(23);
  });
});

describe("cadenceConfigPayload", () => {
  it("returns an empty stages object when the config equals tier defaults", () => {
    const payload = cadenceConfigPayload(defaultCadenceForTier("basic"), "basic");
    expect(payload.stages).toEqual({});
  });

  it("keeps only stages that differ from the tier default", () => {
    const payload = cadenceConfigPayload(
      { stages: { reminder_day3: { enabled: false } } },
      "basic",
    );
    expect(Object.keys(payload.stages)).toEqual(["reminder_day3"]);
    expect(payload.stages.reminder_day3).toEqual({ enabled: false });
  });
});
```

**Step 2: Run to verify it fails**

Run (from `apps/web`): `npx vitest run ../../packages/core/src/cadence.test.ts`
Expected: FAIL — `defaultCadenceForTier`, `cadenceTierEditability`, `clampCadence`, `cadenceConfigPayload` are not exported.

**Step 3: Write the implementation**

First, in `packages/core/src/cadence.ts`, add the `pre_interview_reminder` stage to `CADENCE_STAGES` — insert it between the `reminder_day5` block and the `interview_day` block:

```ts
  {
    key: "pre_interview_reminder",
    label: "Pre-interview reminder",
    dayLabel: "24h before",
    description: "Reminder about the upcoming interview, sent shortly before the slot.",
    channels: ["email", "whatsapp"],
    appliesTo: ["ai_interview", "human_interview"],
  },
```

Then append at the END of `cadence.ts` (keep every existing export intact):

```ts
import { roundTypeAllowed } from "./tier"; // add to the existing imports at the top of the file

export type CadenceStageKey =
  | "shortlist"
  | "reminder_day1"
  | "reminder_day3"
  | "reminder_day5"
  | "pre_interview_reminder"
  | "interview_day"
  | "voice_screen"
  | "assignment_deadline_24h"
  | "result";

export interface CadenceConfigStage {
  enabled: boolean;
  channels: CadenceChannel[];
  /** Pre-interview / assignment stages. Clamped to 0-168. Growth+ only. */
  hoursBefore?: number;
  /** Interview-day link dispatch hour. Clamped to 0-23. Growth+ only. */
  sendHour?: number;
}

export interface CadenceConfig {
  stages: Partial<Record<CadenceStageKey, CadenceConfigStage>>;
}

/** Defaults for timing-aware stages. Keys mirror CADENCE_STAGES. */
export const CADENCE_TIMING_DEFAULTS: Partial<Record<CadenceStageKey, Partial<CadenceConfigStage>>> = {
  pre_interview_reminder: { hoursBefore: 24 },
  interview_day: { sendHour: 9 },
  assignment_deadline_24h: { hoursBefore: 24 },
};

/**
 * Full plan-default config for a tier: every stage the plan can reach is on,
 * with exactly the channels the tier entitles. Drives the editor's seed state.
 */
export function defaultCadenceForTier(tier: Tier): CadenceConfig {
  const stages: CadenceConfig["stages"] = {};
  for (const stage of CADENCE_STAGES) {
    const key = stage.key as CadenceStageKey;
    const channels = stage.channels.filter((c) => {
      if (c === "email") return true;
      if (c === "whatsapp") return TIER_LIMITS[tier].whatsapp;
      if (c === "voice_call") return TIER_LIMITS[tier].voiceScreening;
      return false;
    });
    const roundTypeFits =
      stage.appliesTo.length === 0 || stage.appliesTo.some((t) => roundTypeAllowed(tier, t));
    const enabled = channels.length > 0 && roundTypeFits;
    stages[key] = { enabled, channels, ...CADENCE_TIMING_DEFAULTS[key] };
  }
  return { stages };
}

/** How much control a tier gets over the editor. */
export function cadenceTierEditability(tier: Tier): {
  stages: boolean;
  channels: boolean;
  timing: boolean;
} {
  if (tier === "free") return { stages: false, channels: false, timing: false };
  if (tier === "basic") return { stages: true, channels: true, timing: false };
  return { stages: true, channels: true, timing: true };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Normalize a (possibly partial) config against a tier: drop unknown stages,
 * coerce enabled to boolean, subset channels to the tier's entitlement, and
 * clamp timing to bounded integers. Missing fields fall back to the tier
 * defaults, so callers treat this as "overrides over the plan default".
 */
export function clampCadence(config: CadenceConfig, tier: Tier): CadenceConfig {
  const defaults = defaultCadenceForTier(tier);
  const stages: CadenceConfig["stages"] = {};
  for (const [key, raw] of Object.entries(config.stages)) {
    const base = defaults.stages[key as CadenceStageKey];
    if (!base) continue;
    const stage: CadenceConfigStage = {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
      channels: raw.channels?.filter((c) => base.channels.includes(c)) ?? base.channels,
    };
    if (raw.hoursBefore != null) stage.hoursBefore = clampInt(raw.hoursBefore, 0, 168);
    if (raw.sendHour != null) stage.sendHour = clampInt(raw.sendHour, 0, 23);
    stages[key as CadenceStageKey] = stage;
  }
  return { stages };
}

function sameChannels(a: CadenceChannel[] | undefined, b: CadenceChannel[] | undefined): boolean {
  const sorted = (xs: CadenceChannel[] | undefined) => (xs ?? []).slice().sort().join(",");
  return sorted(a) === sorted(b);
}

/**
 * Slim webhook payload: only stages that differ from the tier plan defaults.
 * Sent as `cadence_config` in the /campaigns create body.
 */
export function cadenceConfigPayload(config: CadenceConfig, tier: Tier): CadenceConfig {
  const clamped = clampCadence(config, tier);
  const defaults = defaultCadenceForTier(tier);
  const stages: CadenceConfig["stages"] = {};
  for (const [key, cur] of Object.entries(clamped.stages)) {
    const base = defaults.stages[key as CadenceStageKey];
    if (!base) continue;
    const diff: Partial<CadenceConfigStage> = {};
    if (cur.enabled !== base.enabled) diff.enabled = cur.enabled;
    if (!sameChannels(cur.channels, base.channels)) diff.channels = cur.channels;
    if (cur.hoursBefore != null && cur.hoursBefore !== base.hoursBefore)
      diff.hoursBefore = cur.hoursBefore;
    if (cur.sendHour != null && cur.sendHour !== base.sendHour) diff.sendHour = cur.sendHour;
    if (Object.keys(diff).length > 0) stages[key as CadenceStageKey] = diff as CadenceConfigStage;
  }
  return { stages };
}
```

Note: rename the existing import block in `cadence.ts` from `import { TIER_LIMITS } from "./tier";` to `import { roundTypeAllowed, TIER_LIMITS } from "./tier";`.

**Step 4: Run to verify it passes**

Run (from `apps/web`): `npx vitest run ../../packages/core/src/cadence.test.ts`
Expected: PASS (3 suites / 8 tests).

**Step 5: Commit**

```bash
git add packages/core/src/cadence.ts packages/core/src/cadence.test.ts
git commit -m "feat: tier-gated cadence helpers with default, clamp and slim payload"
```

---

### Task 2: Campaign schema + DB column + DB types

**Files:**
- Create: `supabase/migrations/0006_campaign_cadence.sql`
- Modify: `packages/core/src/schemas.ts`
- Modify: `packages/core/src/supabase-db.ts:62-82`

**Step 1: Migration**

Create `supabase/migrations/0006_campaign_cadence.sql`:

```sql
alter table campaigns
  add column cadence_config jsonb;

comment on column campaigns.cadence_config is
  'Per-campaign outreach cadence overrides. null = use plan defaults (CADENCE_STAGES in @scalepods/core).';
```

**Step 2: Update DB types**

In `packages/core/src/supabase-db.ts`, `campaigns.Row` gains `cadence_config: Json | null;` and `campaigns.Insert` gains `cadence_config?: Json | null;` (after `created_at` / before `number_of_rounds` respectively so biome sorts them — `cadence_config` alphabetically precedes `created_at`, so place it first in both blocks).

**Step 3: Update the zod schema**

In `packages/core/src/schemas.ts`, after the `campaignUpdateSchema` definition, add:

```ts
export const cadenceChannelSchema = z.enum(["email", "whatsapp", "voice_call"]);

export const cadenceConfigSchema = z
  .object({
    stages: z.record(
      z.string(),
      z.object({
        enabled: z.boolean().optional(),
        channels: z.array(cadenceChannelSchema).optional(),
        hoursBefore: z.number().int().min(0).max(168).optional(),
        sendHour: z.number().int().min(0).max(23).optional(),
      }),
    ),
  })
  .optional();
```

Then add `cadence_config: cadenceConfigSchema,` to `campaignCreateSchema` (optional field; keep every existing field). Do NOT touch `campaignUpdateSchema` — post-create editing is out of scope.

**Step 4: Typecheck + test**

Run (from `packages/core`): `npm run typecheck`
Expected: PASS.

Run (from `apps/web`): `npx vitest run ../../packages/core/src/cadence.test.ts`
Expected: still PASS.

**Step 5: Commit**

```bash
git add supabase/migrations/0006_campaign_cadence.sql packages/core/src/schemas.ts packages/core/src/supabase-db.ts
git commit -m "feat: cadence_config column, campaign schema field and db types"
```

---

### Task 3: CadenceEditor component (TDD)

**Files:**
- Test: `apps/web/src/components/campaigns/CadenceEditor.test.tsx`
- Create: `apps/web/src/components/campaigns/CadenceEditor.tsx`

**Step 1: Write the failing test**

Create `apps/web/src/components/campaigns/CadenceEditor.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type RoundType, type Tier, defaultCadenceForTier } from "@scalepods/core";
import { CadenceEditor } from "./CadenceEditor";

function renderEditor(tier: Tier = "basic", roundTypes: RoundType[] = ["ai_interview"]) {
  const onChange = vi.fn();
  render(
    <CadenceEditor
      tier={tier}
      roundTypes={roundTypes}
      config={defaultCadenceForTier(tier)}
      onChange={onChange}
    />,
  );
  return { onChange };
}

const shortlistSwitch = () =>
  screen.getByRole("switch", { name: /Shortlist & booking .* enabled/i });

describe("CadenceEditor", () => {
  it("renders applicable stage rows with a per-stage switch", () => {
    renderEditor();
    expect(shortlistSwitch()).toBeInTheDocument();
    expect(screen.getByText(/Booking confirmation/i)).toBeInTheDocument();
  });

  it("locks every control on the free tier", () => {
    renderEditor("free");
    expect(shortlistSwitch()).toBeDisabled();
  });

  it("hides timing inputs below Growth", () => {
    renderEditor("basic");
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("shows timing inputs on Growth", () => {
    renderEditor("growth", ["ai_interview"]);
    expect(screen.getAllByRole("spinbutton").length).toBeGreaterThan(0);
  });

  it("skips stages that don't apply to any campaign round", () => {
    const { onChange } = renderEditor("growth", ["ai_interview"]);
    const assignmentKnobs = screen.queryAllByText(/Assignment deadline/i);
    expect(assignmentKnobs).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("toggling a stage switch emits an updated config", () => {
    const { onChange } = renderEditor();
    fireEvent.click(shortlistSwitch());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].stages.shortlist.enabled).toBe(false);
  });
});
```

**Step 2: Run to verify it fails**

Run (from `apps/web`): `npx vitest run src/components/campaigns/CadenceEditor.test.tsx`
Expected: FAIL — module `./CadenceEditor` cannot be resolved.

**Step 3: Write the component**

Create `apps/web/src/components/campaigns/CadenceEditor.tsx`:

```tsx
"use client";

import {
  CADENCE_STAGES,
  CADENCE_TIMING_DEFAULTS,
  type CadenceChannel,
  type CadenceConfig,
  type CadenceConfigStage,
  type CadenceStageKey,
  type RoundType,
  type Tier,
  cadenceForTier,
  cadenceTierEditability,
} from "@scalepods/core";
import { Check, Lock, MessageSquare, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const CHANNEL_META: Record<CadenceChannel, { label: string; icon: typeof MessageSquare | null }> = {
  email: { label: "Email", icon: null },
  whatsapp: { label: "WhatsApp", icon: MessageSquare },
  voice_call: { label: "Voice", icon: Phone },
};

const TIMING_KNOBS: Partial<Record<CadenceStageKey, "hoursBefore" | "sendHour">> = {
  pre_interview_reminder: "hoursBefore",
  interview_day: "sendHour",
  assignment_deadline_24h: "hoursBefore",
};

const TIMING_LABEL: Record<"hoursBefore" | "sendHour", string> = {
  hoursBefore: "h before",
  sendHour: "send at",
};

/** Channels a tier is entitled to per stage, merged across campaign round types. */
function entitledChannels(
  roundTypes: RoundType[],
  tier: Tier,
): Map<CadenceStageKey, CadenceChannel[]> {
  const map = new Map<CadenceStageKey, CadenceChannel[]>();
  for (const t of roundTypes) {
    for (const row of cadenceForTier(tier, t)) {
      const key = row.stage.key as CadenceStageKey;
      const existing = map.get(key);
      map.set(
        key,
        existing ? Array.from(new Set([...existing, ...row.channels])) : row.channels,
      );
    }
  }
  return map;
}

export function CadenceEditor({
  tier,
  roundTypes,
  config,
  onChange,
}: {
  tier: Tier;
  roundTypes: RoundType[];
  config: CadenceConfig;
  onChange: (config: CadenceConfig) => void;
}) {
  const entitled = entitledChannels(roundTypes, tier);
  const editable = cadenceTierEditability(tier);

  const patchStage = (key: CadenceStageKey, patch: Partial<CadenceConfigStage>) =>
    onChange({ stages: { ...config.stages, [key]: { ...config.stages[key], ...patch } } });

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Cadence — what your plan actually sends
        </p>
        {!editable.stages ? (
          <p className="text-[11px] text-muted-foreground">
            Fixed on your plan · upgrade to customize
          </p>
        ) : null}
      </div>
      <ul className="divide-y divide-border">
        {CADENCE_STAGES.map((stage) => {
          const key = stage.key as CadenceStageKey;
          const applies = entitled.has(key);
          if (!applies) return null;
          const allowedChannels = entitled.get(key) ?? [];
          const cur = config.stages[key] ?? {};
          const enabled = cur.enabled ?? allowedChannels.length > 0;
          const knob = TIMING_KNOBS[key];
          const knobValue = cur[knob] ?? CADENCE_TIMING_DEFAULTS[key]?.[knob];
          return (
            <li key={key} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5">
              <Switch
                id={`cadence-${key}`}
                aria-label={`${stage.label} enabled`}
                checked={enabled}
                disabled={!editable.stages}
                onCheckedChange={(next) => patchStage(key, { enabled: next })}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`cadence-${key}`}
                    className="text-sm font-medium text-foreground"
                  >
                    {stage.label}
                  </label>
                  <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {stage.dayLabel}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{stage.description}</p>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                {stage.channels.map((c) => {
                  const meta = CHANNEL_META[c];
                  const entitledChannel = allowedChannels.includes(c);
                  const selected = enabled && (cur.channels ?? allowedChannels).includes(c);
                  if (!entitledChannel) {
                    return (
                      <span
                        key={c}
                        aria-hidden
                        title={`${meta.label} requires the ${c === "whatsapp" ? "Basic" : "Basic"} tier`}
                        className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/50 px-2 text-[11px] text-muted-foreground/60"
                      >
                        <Lock className="h-3 w-3" />
                        {meta.label}
                      </span>
                    );
                  }
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${stage.label} via ${meta.label}`}
                      disabled={!editable.channels || !enabled}
                      onClick={() =>
                        patchStage(key, {
                          channels: selected
                            ? (cur.channels ?? allowedChannels).filter((x) => x !== c)
                            : Array.from(new Set([...(cur.channels ?? allowedChannels), c])),
                        })
                      }
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors",
                        selected
                          ? "border-success/40 bg-success/10 text-success"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {meta.icon ? (
                        <meta.icon className="h-3 w-3" aria-hidden />
                      ) : (
                        <Check className="h-3 w-3" aria-hidden />
                      )}
                      {meta.label}
                    </button>
                  );
                })}
                {knob && editable.timing ? (
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Input
                      type="number"
                      min={0}
                      max={knob === "sendHour" ? 23 : 168}
                      value={knobValue ?? ""}
                      onChange={(e) =>
                        patchStage(key, { [knob]: Number(e.target.value) })
                      }
                      className="w-16 !py-1 text-xs"
                      aria-label={`${stage.label} ${TIMING_LABEL[knob]}`}
                    />
                    {TIMING_LABEL[knob]}
                  </label>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

**Step 4: Run to verify it passes**

Run (from `apps/web`): `npx vitest run src/components/campaigns/CadenceEditor.test.tsx`
Expected: PASS (6 tests).

Then run: `npm run typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/campaigns/CadenceEditor.tsx apps/web/src/components/campaigns/CadenceEditor.test.tsx
git commit -m "feat: tier-gated interactive cadence editor"
```

---

### Task 4: Wire the editor into the create-campaign page

**Files:**
- Modify: `apps/web/src/app/(recruiter)/campaigns/new/page.tsx`

**Step 1: Imports + state**

- Change the `@scalepods/core` import to also bring in `type CadenceConfig`, `cadenceConfigPayload`, and `defaultCadenceForTier`.
- Replace `import { CadencePreview } from "@/components/campaigns/CadencePreview";` with `import { CadenceEditor } from "@/components/campaigns/CadenceEditor";`.
- Remove the two state lines `const [whatsappOn, setWhatsappOn] = useState(...)` and `const [voiceOn, setVoiceOn] = useState(...)`.
- Add:
  ```tsx
  const [cadenceConfig, setCadenceConfig] = useState<CadenceConfig>(() =>
    defaultCadenceForTier(tier),
  );

  useEffect(() => {
    setCadenceConfig(defaultCadenceForTier(tier));
  }, [tier]);

  const roundTypes: RoundType[] = rounds
    .slice(0, numberOfRounds)
    .map((r) => r.round_type);
  ```
- Delete the now-unused `previewRows` memo entirely (CadenceEditor computes rows itself).

**Step 2: Reach-out step JSX**

Replace the whole `<div className="space-y-3">…</div>` channel-toggle block AND the `<CadencePreview rows={previewRows} />` block inside `step === 2` with:

```tsx
        {step === 2 ? (
          <div className="space-y-5">
            <ChannelToggle
              label="Email"
              description="Transactional email for all stages — always on."
              checked
              disabled
              onCheckedChange={() => {}}
            />
            <CadenceEditor
              tier={tier}
              roundTypes={roundTypes}
              config={cadenceConfig}
              onChange={setCadenceConfig}
            />
          </div>
        ) : null}
```

**Step 3: Submit payload**

Inside `submit`, before `const parsed = campaignCreateSchema.safeParse(payload);`, add the field to the payload object (after `rounds`):

```tsx
      cadence_config: cadenceConfigPayload(cadenceConfig, tier),
```

**Step 4: Verify**

Run (from `apps/web`):
- `npm run typecheck` → PASS
- `npx vitest run src/components/campaigns/CadenceEditor.test.tsx` → PASS (6)
- `npx vitest run ../../packages/core/src/cadence.test.ts` → PASS (8)

Manual smoke (from `apps/web`, `npm run dev`): create a campaign on a Free account → the cadence table shows switches+chips disabled with the "Fixed on your plan" note; a Growth account → toggles work, time inputs appear for Pre-interview/Interview-day/Assignment rows; submitting posts `cadence_config` in the body (check n8n execution or network tab).

**Step 5: Commit**

```bash
git add "apps/web/src/app/(recruiter)/campaigns/new/page.tsx"
git commit -m "feat: wire tier-gated cadence editor into campaign creation"
```

---

### Task 5: Final verification gate + n8n contract reference

**Files:** none (verification + the reference in this plan only)

**Step 1: Ensure port 3000 is free**

Run: `netstat -ano | findstr :3000` — confirm no listener. (Stop any running dev server first.)

**Step 2: Clean + build**

Run (in `apps/web`): `rmdir /s /q .next && npm run build`
Expected: `Compiled successfully`, same static page count as before (13/13) — the new page is dynamic (client hooks), not static.

**Step 3: Full re-verify**

Run (from `apps/web`): `npm test` → all files pass (existing 19 files/82 tests + 2 new files/14 tests). Then `npm run typecheck` → PASS. From `packages/core`: `npm run typecheck` → PASS.

**Step 4: Report**

Summarize: `CADENCE_STAGES` gained `pre_interview_reminder`; core helpers; `cadence_config` schema/DB/types; `CadenceEditor` replacing the read-only preview; slim payload through `/webhook/campaigns`. Remind the user to apply the n8n wiring below and restart dev if stopped.

---

## n8n contract reference (external — apply manually, not from this plan)

**1. `/campaigns` workflow — persist the config.** In the `Supabase - Create campaign` HTTP node body, add the column so the raw body value flows in:

```json
{
  "_body_reference": "add to the existing jsonBody expression",
  "jsonBody": "={{ { \"cadence_config\": $node[\"Webhook - /campaigns\"].json.body.cadence_config ?? null, \"account_id\": $node[\"Webhook - /campaigns\"].json.body.account_id, \"name\": $node[\"Webhook - /campaigns\"].json.body.name, \"jd_text\": $node[\"Webhook - /campaigns\"].json.body.jd_text, \"number_of_rounds\": $node[\"Webhook - /campaigns\"].json.body.number_of_rounds, \"status\": \"on\" } }}"
}
```

**2. Reminder workflow — read it per campaign.** Each Compute node already has the `round_instance` row (with `campaign_id`). Before the hardcoded day/hr checks, fetch `campaigns.cadence_config` for that campaign (`GET /rest/v1/campaigns?campaign_id=eq.<id>&select=cadence_config`). Interpret it as overrides over the plan defaults:

- `reminder_day1/reminder_day3/reminder_day5` → stage emitted only when `stages[<key>].enabled !== false` and the stage message channel is in `stages[<key>].channels` (default: plan entitlement).
- `pre_interview_reminder` → use `stages.pre_interview_reminder.hoursBefore` (default 24) for the window instead of the literal `23-25`.
- `interview_day` → use `stages.interview_day.sendHour` (default 9) instead of the literal hour-9 check; skip the 0-1h link-dispatch when the stage is disabled.
- `assignment_deadline_24h` → use `stages.assignment_deadline_24h.hoursBefore` (default 24).
- A missing/empty `cadence_config` behaves exactly as today.

## Out of scope

- Editing cadence for an already-created campaign (update action + campaign-detail editor = follow-up).
- Rebaking existing `round_instances` when cadence changes.
- Custom sending identity; voice-screen attempt count.