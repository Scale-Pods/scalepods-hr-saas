import { roundTypeAllowed, TIER_LIMITS } from "./tier";
import type { RoundType, Tier } from "./types";

/**
 * Candidate outreach cadence - default/placeholder values that mirror the
 * integration doc, Section 3.2. Adjust keys/labels/stages here if the real
 * cadence differs; the campaign builder preview + settings render this source.
 */
export type CadenceChannel = "email" | "whatsapp" | "voice_call";

export interface CadenceStageDef {
  key: string;
  label: string;
  /** Display anchor: day offsets (0,1,3,5), a special label, or both. */
  dayLabel: string;
  description: string;
  /** Channels this stage dispatches on when the tier entitles them. */
  channels: CadenceChannel[];
  /** Round types this stage applies to (empty = all). */
  appliesTo: RoundType[];
}

export const CADENCE_STAGES = [
  {
    key: "shortlist",
    label: "Shortlist & booking",
    dayLabel: "Day 0",
    description: "Booking confirmation / interview invitation goes out instantly.",
    channels: ["email", "whatsapp"],
    appliesTo: [],
  },
  {
    key: "reminder_day1",
    label: "Reminder",
    dayLabel: "Day 1",
    description: "Follow-up nudge if the round hasn't been booked.",
    channels: ["email", "whatsapp"],
    appliesTo: [],
  },
  {
    key: "reminder_day3",
    label: "Reminder",
    dayLabel: "Day 3",
    description: "Second nudge ahead of the interview window.",
    channels: ["email", "whatsapp"],
    appliesTo: [],
  },
  {
    key: "reminder_day5",
    label: "Reminder",
    dayLabel: "Day 5",
    description: "Final nudge - one touch before the interview day.",
    channels: ["email", "whatsapp"],
    appliesTo: [],
  },
  {
    key: "pre_interview_reminder",
    label: "Pre-interview reminder",
    dayLabel: "24h before",
    description: "Reminder about the upcoming interview, sent shortly before the slot.",
    channels: ["email", "whatsapp"],
    appliesTo: ["ai_interview", "human_interview"],
  },
  {
    key: "interview_day",
    label: "Interview-day link",
    dayLabel: "Interview day",
    description: "9 AM local: AI interview link or Google Meet link for the scheduled slot.",
    channels: ["email", "whatsapp"],
    appliesTo: ["ai_interview", "human_interview"],
  },
  {
    key: "voice_screen",
    label: "Voice screening call",
    dayLabel: "Before round 1",
    description: "Automated 5-minute screening call intro (up to 2 attempts/day).",
    channels: ["voice_call"],
    appliesTo: [],
  },
  {
    key: "assignment_deadline_24h",
    label: "Assignment deadline nudge",
    dayLabel: "24h before deadline",
    description: "Reminder when the assignment is due within 24 hours.",
    channels: ["email", "whatsapp"],
    appliesTo: ["assignment"],
  },
  {
    key: "result",
    label: "Result",
    dayLabel: "After cutoff check",
    description: "Pass - next round or offer. Fail - rejection.",
    channels: ["email", "whatsapp"],
    appliesTo: [],
  },
] as const satisfies readonly CadenceStageDef[];

export interface CadenceRenderRow {
  stage: CadenceStageDef;
  /** Channels this account's tier can actually send for this stage. */
  channels: CadenceChannel[];
  enabled: boolean;
}

/** Describes why a stage is suppressed for display + tooltips. */
export function tierEntitlementReason(tier: Tier, channel: CadenceChannel): string | null {
  const t = TIER_LIMITS[tier];
  if (channel === "whatsapp" && !t.whatsapp) return "WhatsApp requires the Basic tier";
  if (channel === "voice_call" && !t.voiceScreening)
    return "Voice screening requires the Basic tier";
  return null;
}

/**
 * Renders the cadence the way the account's tier would actually receive it:
 * email always on; WhatsApp/voice stages filtered out below their tier gates.
 */
export function cadenceForTier(tier: Tier, roundType: RoundType): CadenceRenderRow[] {
  const limits = TIER_LIMITS[tier];
  return CADENCE_STAGES.map((stage: CadenceStageDef) => {
    const applies = stage.appliesTo.length === 0 || stage.appliesTo.includes(roundType);
    const channels = stage.channels.filter((c) => {
      if (c === "email") return true;
      if (c === "whatsapp") return limits.whatsapp;
      if (c === "voice_call") return limits.voiceScreening;
      return true;
    });
    return { stage, channels, enabled: applies && channels.length > 0 };
  });
}

export function voiceScreeningEnabledForTier(tier: Tier): boolean {
  return TIER_LIMITS[tier].voiceScreening;
}

export type CadenceStageKey = (typeof CADENCE_STAGES)[number]["key"];

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
export const CADENCE_TIMING_DEFAULTS: Partial<
  Record<CadenceStageKey, Partial<CadenceConfigStage>>
> = {
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
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Normalize a (possibly partial) config against a tier: drop unknown stages,
 * coerce enabled to boolean, subset channels to the tier's entitlement, and
 * clamp timing to bounded integers. Optional timing knobs are only forwarded
 * for stages that own them on tiers whose editability allows timing; every
 * other field the input omits falls back to the tier default.
 */
export function clampCadence(config: CadenceConfig, tier: Tier): CadenceConfig {
  const defaults = defaultCadenceForTier(tier);
  const timing = cadenceTierEditability(tier).timing;
  const stages: CadenceConfig["stages"] = {};
  for (const [key, raw] of Object.entries(config.stages)) {
    const stageKey = key as CadenceStageKey;
    const base = defaults.stages[stageKey];
    if (!base) continue;
    const stage: CadenceConfigStage = {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
      channels: raw.channels?.filter((c) => base.channels.includes(c)) ?? base.channels,
    };
    if (timing && raw.hoursBefore != null && CADENCE_TIMING_DEFAULTS[stageKey]?.hoursBefore != null)
      stage.hoursBefore = clampInt(raw.hoursBefore, 0, 168);
    if (timing && raw.sendHour != null && CADENCE_TIMING_DEFAULTS[stageKey]?.sendHour != null)
      stage.sendHour = clampInt(raw.sendHour, 0, 23);
    stages[stageKey] = stage;
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
