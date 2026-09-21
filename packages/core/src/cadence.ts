import { TIER_LIMITS } from "./tier";
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

export const CADENCE_STAGES: CadenceStageDef[] = [
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
];

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
  return CADENCE_STAGES.map((stage) => {
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
