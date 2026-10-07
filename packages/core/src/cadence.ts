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
    appliesTo: ["ai_interview", "human_interview", "ai_voice_call"],
  },
  {
    key: "interview_day",
    label: "Interview-day link",
    dayLabel: "Interview day",
    description: "9 AM local: AI interview link or Google Meet link for the scheduled slot.",
    channels: ["email", "whatsapp"],
    appliesTo: ["ai_interview", "human_interview", "ai_voice_call"],
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

/**
 * Standard milestone day offsets.
 * shortlist: Day 0
 * reminder_day1: Day 1
 * reminder_day3: Day 3
 * reminder_day5: Day 5
 */
export const STAGE_DAY_OFFSETS: Record<string, number> = {
  shortlist: 0,
  reminder_day1: 1,
  reminder_day3: 3,
  reminder_day5: 5,
};

/**
 * Filters cadence rows according to the total duration of the campaign in days.
 * Stages with fixed day offsets strictly greater than or equal to the duration are excluded,
 * preventing reminders (e.g. Day 3 or Day 5) from appearing when the campaign duration is only 2 days.
 */
export function filterCadenceByDuration(
  rows: CadenceRenderRow[],
  durationDays: number | null | undefined,
): CadenceRenderRow[] {
  if (durationDays == null || durationDays <= 0) return rows;
  return rows.filter((r) => {
    const offset = STAGE_DAY_OFFSETS[r.stage.key];
    if (offset === undefined) return true;
    return offset < durationDays;
  });
}

export type CadenceStageKey = (typeof CADENCE_STAGES)[number]["key"];

export interface CadenceConfigStage {
  enabled: boolean;
  channels: CadenceChannel[];
  /** Pre-interview / assignment stages. Clamped to 0–168. Growth+ only. */
  hoursBefore?: number;
  /** Interview-day link dispatch hour (legacy). Clamped to 0–23. Growth+ only. */
  sendHour?: number;
  /** Milestone day offset (e.g. 0, 1, 3, 5). Clamped to 0–30. */
  dayOffset?: number;
  /**
   * Exact local time to send this notification, in "HH:MM" 24-hour format.
   * - For day-offset reminders: combined with dayOffset → "Day N at HH:MM".
   * - For pre_interview_reminder / assignment_deadline_24h: used as a
   *   hard-clock fallback when hoursBefore would put the send time in the past.
   * - For interview_day: replaces the legacy sendHour field.
   * Growth+ only.  Validated as /^([01]\d|2[0-3]):[0-5]\d$/.
   */
  sendTime?: string;
}

export interface CadenceConfig {
  stages: Partial<Record<CadenceStageKey, CadenceConfigStage>>;
}

/**
 * Stages that support a recruiter-configurable sendTime (HH:MM).
 * Used by the UI to decide which rows get a clock input.
 */
export const STAGE_SEND_TIME_KEYS = new Set<string>([
  "reminder_day1",
  "reminder_day3",
  "reminder_day5",
  "pre_interview_reminder",
  "interview_day",
  "assignment_deadline_24h",
]);

/** Validates a sendTime string. Returns true when the format is HH:MM 24-h. */
export function isValidSendTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/**
 * Returns sensible defaults for timing-aware stages scaled to the campaign window.
 * - durationHours: total campaign length in hours (e.g. 24 for a 1-day campaign).
 *   When omitted or null, the classic multi-day defaults (24 h, Day 1/3/5) are used.
 * - For short campaigns (≤ 24 h) reminder follow-ups are collapsed to hour-based
 *   values that actually fit in the window, and day-offset reminders are removed.
 */
export function scaledCadenceDefaults(
  durationHours: number | null | undefined,
): Partial<Record<CadenceStageKey, Partial<CadenceConfigStage>>> {
  // ---- Short campaign path (≤ 24 h) ----------------------------------------
  if (durationHours != null && durationHours <= 24) {
    return {
      shortlist: { dayOffset: 0 },
      reminder_day1: { dayOffset: 0, sendTime: "09:00" },
      reminder_day3: { dayOffset: 0, sendTime: "09:00" },
      reminder_day5: { dayOffset: 0, sendTime: "09:00" },
      pre_interview_reminder: { hoursBefore: Math.min(2, durationHours), sendTime: "09:00" },
      interview_day: { sendHour: 9, sendTime: "09:00" },
      assignment_deadline_24h: { hoursBefore: Math.min(2, durationHours), sendTime: "09:00" },
    };
  }

  // ---- Medium campaign (25 – 72 h, i.e. 1–3 days) --------------------------
  if (durationHours != null && durationHours <= 72) {
    return {
      shortlist: { dayOffset: 0 },
      reminder_day1: { dayOffset: 1, sendTime: "09:00" },
      reminder_day3: { dayOffset: 0, sendTime: "09:00" },
      reminder_day5: { dayOffset: 0, sendTime: "09:00" },
      pre_interview_reminder: { hoursBefore: Math.min(4, durationHours), sendTime: "09:00" },
      interview_day: { sendHour: 9, sendTime: "09:00" },
      assignment_deadline_24h: { hoursBefore: Math.min(4, durationHours), sendTime: "09:00" },
    };
  }

  // ---- Standard / long campaign (> 3 days or no duration set) ---------------
  return {
    shortlist: { dayOffset: 0 },
    reminder_day1: { dayOffset: 1, sendTime: "09:00" },
    reminder_day3: { dayOffset: 3, sendTime: "09:00" },
    reminder_day5: { dayOffset: 5, sendTime: "09:00" },
    pre_interview_reminder: { hoursBefore: 24, sendTime: "09:00" },
    interview_day: { sendHour: 9, sendTime: "09:00" },
    assignment_deadline_24h: { hoursBefore: 24, sendTime: "09:00" },
  };
}

/**
 * @deprecated Use scaledCadenceDefaults() which is duration-aware.
 * Kept for backwards compatibility; callers that don't have a campaign
 * duration can still use this constant.
 */
export const CADENCE_TIMING_DEFAULTS = scaledCadenceDefaults(null);

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

export interface CadenceTimingWarning {
  stageKey: string;
  field: "hoursBefore" | "dayOffset" | "sendHour" | "sendTime";
  message: string;
}

/**
 * Validates configured timing against the actual campaign window and returns
 * human-readable warnings that the UI can display next to the input fields.
 *
 * @param config   The cadence config to validate.
 * @param durationHours  Total campaign length in hours (e.g. 24 for 1 day).
 */
export function validateCadenceTiming(
  config: CadenceConfig,
  durationHours: number | null | undefined,
): CadenceTimingWarning[] {
  if (durationHours == null || durationHours <= 0) return [];
  const warnings: CadenceTimingWarning[] = [];

  for (const [key, stage] of Object.entries(config.stages)) {
    if (!stage) continue;

    // dayOffset-based reminders — must be < durationDays
    if (stage.dayOffset != null && STAGE_DAY_OFFSETS[key] !== undefined) {
      const maxOffset = Math.floor(durationHours / 24);
      if (stage.dayOffset >= maxOffset) {
        warnings.push({
          stageKey: key,
          field: "dayOffset",
          message:
            maxOffset <= 0
              ? `Campaign is shorter than 1 day — day-offset reminders won't fire.`
              : `Day ${stage.dayOffset} is outside the ${maxOffset}-day campaign window. This reminder won't send.`,
        });
      }
    }

    // hoursBefore — must be < durationHours
    if (stage.hoursBefore != null) {
      if (stage.hoursBefore >= durationHours) {
        warnings.push({
          stageKey: key,
          field: "hoursBefore",
          message: `${stage.hoursBefore}h before is longer than the ${durationHours}h campaign — this reminder will never send. Use ${Math.max(1, Math.floor(durationHours / 2))}h or less.`,
        });
      }
    }

    // sendTime — must be a valid HH:MM string
    if (stage.sendTime != null && !isValidSendTime(stage.sendTime)) {
      warnings.push({
        stageKey: key,
        field: "sendTime",
        message: `"${stage.sendTime}" is not a valid time. Use HH:MM format (e.g. 09:00, 14:30).`,
      });
    }
  }

  return warnings;
}

/**
 * Full plan-default config for a tier: every stage the plan can reach is on,
 * with exactly the channels the tier entitles. Drives the editor's seed state.
 *
 * @param tier          The account's billing tier.
 * @param durationHours Total campaign window in hours. Pass null/undefined for
 *                      the classic "no-deadline" defaults (24h reminders, Day 1/3/5).
 */
export function defaultCadenceForTier(tier: Tier, durationHours?: number | null): CadenceConfig {
  const timingDefaults = scaledCadenceDefaults(durationHours);
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
    stages[key] = { enabled, channels, ...timingDefaults[key] };
  }
  return { stages };
}

/** How much control a tier gets over the editor. */
export function cadenceTierEditability(tier: Tier): {
  stages: boolean;
  channels: boolean;
  timing: boolean;
  maxChanges: number;
} {
  if (tier === "free") return { stages: false, channels: false, timing: false, maxChanges: 0 };
  if (tier === "basic") return { stages: true, channels: true, timing: false, maxChanges: 1 };
  if (tier === "growth") return { stages: true, channels: true, timing: true, maxChanges: 5 };
  return { stages: true, channels: true, timing: true, maxChanges: Number.MAX_SAFE_INTEGER };
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
 *
 * @param config        The raw cadence config to normalise.
 * @param tier          The account's billing tier.
 * @param durationHours Total campaign window in hours. When provided, dayOffset
 *                      and hoursBefore are further clamped so they can't exceed
 *                      the campaign window.
 */
export function clampCadence(
  config: CadenceConfig,
  tier: Tier,
  durationHours?: number | null,
): CadenceConfig {
  const defaults = defaultCadenceForTier(tier, durationHours);
  const timingDefaults = scaledCadenceDefaults(durationHours);
  const timing = cadenceTierEditability(tier).timing;
  // Upper bounds derived from the campaign window (inclusive)
  const maxHoursBefore = durationHours != null && durationHours > 0 ? durationHours - 1 : 168;
  const maxDayOffset =
    durationHours != null && durationHours > 0
      ? Math.max(0, Math.floor(durationHours / 24) - 1)
      : 30;

  const stages: CadenceConfig["stages"] = {};
  for (const [key, raw] of Object.entries(config.stages)) {
    const stageKey = key as CadenceStageKey;
    const base = defaults.stages[stageKey];
    if (!base) continue;
    const stage: CadenceConfigStage = {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
      channels: raw.channels?.filter((c) => base.channels.includes(c)) ?? base.channels,
    };
    if (timing && raw.hoursBefore != null && timingDefaults[stageKey]?.hoursBefore != null)
      stage.hoursBefore = clampInt(raw.hoursBefore, 0, maxHoursBefore);
    if (timing && raw.sendHour != null && timingDefaults[stageKey]?.sendHour != null)
      stage.sendHour = clampInt(raw.sendHour, 0, 23);
    if (timing && raw.dayOffset != null && timingDefaults[stageKey]?.dayOffset != null)
      stage.dayOffset = clampInt(raw.dayOffset, 0, maxDayOffset);
    // sendTime: accept any valid HH:MM string for stages that support it
    if (timing && raw.sendTime != null && STAGE_SEND_TIME_KEYS.has(stageKey))
      stage.sendTime = isValidSendTime(raw.sendTime)
        ? raw.sendTime
        : (timingDefaults[stageKey]?.sendTime ?? "09:00");
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
    if (cur.dayOffset != null && cur.dayOffset !== base.dayOffset) diff.dayOffset = cur.dayOffset;
    if (cur.sendTime != null && cur.sendTime !== base.sendTime) diff.sendTime = cur.sendTime;
    if (Object.keys(diff).length > 0) stages[key as CadenceStageKey] = diff as CadenceConfigStage;
  }
  return { stages };
}
