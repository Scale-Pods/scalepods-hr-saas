import { roundTypeAllowed, TIER_LIMITS } from "./tier";
import type { RoundType, Tier } from "./types";

/**
 * Candidate outreach cadence - default/placeholder values that mirror the
 * integration doc, Section 3.2. Adjust keys/labels/stages here if the real
 * cadence differs; the campaign builder preview + settings render this source.
 */
export type CadenceChannel = "email" | "whatsapp";

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
    key: "reminder_day2",
    label: "Reminder",
    dayLabel: "Day 2",
    description: "Follow-up reminder ahead of the interview window.",
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
    key: "reminder_day4",
    label: "Reminder",
    dayLabel: "Day 4",
    description: "Follow-up reminder before the interview day.",
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
  reminder_day2: 2,
  reminder_day3: 3,
  reminder_day4: 4,
  reminder_day5: 5,
};

/**
 * Filters cadence rows according to the total duration of the campaign in days.
 * Stages with fixed day offsets strictly greater than or equal to the duration are excluded,
 * preventing reminders (e.g. Day 3 or Day 4) from appearing when the campaign duration is only 2 days.
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
  /** Milestone day offset (e.g. 0, 1, 2, 3, 4). Clamped to 0–30. */
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
  "reminder_day2",
  "reminder_day3",
  "reminder_day4",
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
 *   When omitted or null, the classic multi-day defaults (24 h, Day 1/2/3/4) are used.
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
      reminder_day2: { dayOffset: 0, sendTime: "09:00" },
      reminder_day3: { dayOffset: 0, sendTime: "09:00" },
      reminder_day4: { dayOffset: 0, sendTime: "09:00" },
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
      reminder_day2: { dayOffset: 2, sendTime: "09:00" },
      reminder_day3: { dayOffset: 0, sendTime: "09:00" },
      reminder_day4: { dayOffset: 0, sendTime: "09:00" },
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
    reminder_day2: { dayOffset: 2, sendTime: "09:00" },
    reminder_day3: { dayOffset: 3, sendTime: "09:00" },
    reminder_day4: { dayOffset: 4, sendTime: "09:00" },
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

// --------------------------------------------------------------------------
// Timezone-Aware Calendar & Interview Reminder Dispatch Safety
// --------------------------------------------------------------------------

/**
 * Returns the "YYYY-MM-DD" local calendar date string for a given date in a specific timezone.
 */
export function getCalendarDateString(date: Date | string, timezone = "UTC"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/**
 * Returns the 24-hour "HH:MM" local time string for a given date in a specific timezone.
 */
export function getLocalTimeString(date: Date | string, timezone = "UTC"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return formatter.format(d);
}

/**
 * Checks whether a given timestamp falls on a weekend (Saturday or Sunday)
 * in the specified timezone.
 */
export function isWeekendDay(date: Date | string, timezone = "UTC"): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return false;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const weekday = formatter.format(d);
  return weekday === "Sat" || weekday === "Sun";
}

/**
 * Checks whether two timestamps fall on the exact same calendar date in the given timezone.
 */
export function isSameCalendarDay(
  dateA: Date | string,
  dateB: Date | string,
  timezone = "UTC",
): boolean {
  const strA = getCalendarDateString(dateA, timezone);
  const strB = getCalendarDateString(dateB, timezone);
  return !!strA && !!strB && strA === strB;
}

/**
 * Checks whether targetDate falls on the calendar day immediately following baseDate (Day + 1)
 * in the given timezone.
 */
export function isTomorrowCalendarDay(
  baseDate: Date | string,
  targetDate: Date | string,
  timezone = "UTC",
): boolean {
  const baseStr = getCalendarDateString(baseDate, timezone);
  const targetStr = getCalendarDateString(targetDate, timezone);
  if (!baseStr || !targetStr) return false;

  const [by, bm, bd] = baseStr.split("-").map(Number);
  const baseUtcNext = new Date(Date.UTC(by, bm - 1, bd + 1));
  const expectedNextStr = baseUtcNext.toISOString().slice(0, 10);
  return targetStr === expectedNextStr;
}

export interface InterviewReminderEvaluation {
  shouldDispatch: boolean;
  stage: "interview_day" | "pre_interview_reminder" | null;
  reason: string;
}

/**
 * Evaluates whether an interview notification is eligible to be dispatched,
 * guaranteeing that:
 * 1. "interview_day" ("Your Interview Is Today") ONLY fires when scheduled_at
 *    matches the current local calendar date (D-0).
 * 2. "interview_day" NEVER fires on a Saturday or Sunday when weekends are excluded.
 * 3. An interview scheduled for tomorrow (D-1) evaluates strictly to
 *    "pre_interview_reminder" ("Interview Tomorrow"), never "interview_day".
 */
export function evaluateInterviewReminderStage(params: {
  scheduledAt: Date | string;
  now?: Date | string;
  timezone?: string;
  sendTime?: string;
}): InterviewReminderEvaluation {
  const tz = params.timezone || "UTC";
  const sendTime = params.sendTime || "09:00";
  const scheduledDate =
    typeof params.scheduledAt === "string" ? new Date(params.scheduledAt) : params.scheduledAt;
  const nowDate = params.now
    ? typeof params.now === "string"
      ? new Date(params.now)
      : params.now
    : new Date();

  if (Number.isNaN(scheduledDate.getTime()) || Number.isNaN(nowDate.getTime())) {
    return { shouldDispatch: false, stage: null, reason: "invalid_date_provided" };
  }

  // If already past the scheduled time
  if (scheduledDate.getTime() < nowDate.getTime()) {
    return { shouldDispatch: false, stage: null, reason: "interview_already_passed" };
  }

  const isToday = isSameCalendarDay(nowDate, scheduledDate, tz);
  const isTomorrow = isTomorrowCalendarDay(nowDate, scheduledDate, tz);
  const currentIsWeekend = isWeekendDay(nowDate, tz);

  // Case 1: Interview is on the same calendar day (D-0)
  if (isToday) {
    // Weekend safety guard: no interviews on weekends
    if (currentIsWeekend) {
      return {
        shouldDispatch: false,
        stage: null,
        reason: "weekend_blocked_no_interview_day",
      };
    }

    // Check sendTime (e.g. 09:00 local time)
    const currentHm = getLocalTimeString(nowDate, tz);
    if (currentHm < sendTime) {
      return {
        shouldDispatch: false,
        stage: null,
        reason: `send_time_not_reached: current time ${currentHm} is before ${sendTime}`,
      };
    }

    return {
      shouldDispatch: true,
      stage: "interview_day",
      reason: "interview_is_today",
    };
  }

  // Case 2: Interview is on the next calendar day (D-1)
  if (isTomorrow) {
    const diffHours = (scheduledDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60);
    // Eligible within 36 hours window of tomorrow's interview
    if (diffHours <= 36 && diffHours >= 12) {
      return {
        shouldDispatch: true,
        stage: "pre_interview_reminder",
        reason: "interview_is_tomorrow",
      };
    }

    return {
      shouldDispatch: false,
      stage: null,
      reason: `pre_interview_window_not_matched: ${diffHours.toFixed(1)}h remaining`,
    };
  }

  return {
    shouldDispatch: false,
    stage: null,
    reason: "interview_not_today_or_tomorrow",
  };
}
