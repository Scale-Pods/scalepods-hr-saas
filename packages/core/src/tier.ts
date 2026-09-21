import type { Tier, RoundType } from "./types";

/**
 * Static client-side mirror of the tier limits. These numbers are
 * PLACEHOLDERS - replace with the authoritative table from the integration
 * doc, Section 4.1. Every gate here is advisory: server-side enforcement lives
 * in n8n (Credit & Usage Guard, workflow 7) and wins on conflict.
 */
export interface TierLimits {
  label: string;
  /** Maximum number of rounds selectable in the campaign builder. */
  maxRounds: number;
  /** Monthly active campaigns */
  activeCampaigns: number | null; // null = unlimited
  /** Monthly resume screenings */
  resumesScreened: number | null;
  /** Monthly AI interview run credits */
  aiInterview: number | null;
  /** Monthly voice screening call credits */
  aiVoiceScreening: number | null;
  /** Monthly scheduled-round slots */
  scheduledRound: number | null;
  /** Monthly offer letters */
  offersPerMonth: number | null;
  /** Channel entitlements */
  whatsapp: boolean;
  voiceScreening: boolean;
  sms: boolean;
  /** Round types */
  assignment: boolean;
  /** Recording/transcript retention window in days */
  retentionDays: number;
  /** Custom sending identity (domain / WhatsApp number) */
  customIdentity: boolean;
  /**
   * What happens when a numeric allowance is exceeded (PATCH 3).
   * 'hard_stop' blocks (UI disables + server 403); 'metered' lets the action
   * proceed past the cap - extra usage is logged to usage_events and billed.
   * Growth = 'metered'; Free/Basic (and Enterprise-as-configured) = 'hard_stop'.
   */
  overageBehavior: "hard_stop" | "metered";
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    label: "Free",
    maxRounds: 2,
    activeCampaigns: 1,
    resumesScreened: 50,
    aiInterview: 10,
    aiVoiceScreening: 0,
    scheduledRound: 10,
    offersPerMonth: 0,
    whatsapp: false,
    voiceScreening: false,
    sms: false,
    assignment: false,
    retentionDays: 7,
    customIdentity: false,
    overageBehavior: "hard_stop",
  },
  basic: {
    label: "Basic",
    maxRounds: 4,
    activeCampaigns: 3,
    resumesScreened: 250,
    aiInterview: 50,
    aiVoiceScreening: 20,
    scheduledRound: 50,
    offersPerMonth: 5,
    whatsapp: true,
    voiceScreening: true,
    sms: false,
    assignment: false,
    retentionDays: 30,
    customIdentity: false,
    overageBehavior: "hard_stop",
  },
  growth: {
    label: "Growth",
    maxRounds: 6,
    activeCampaigns: 25,
    resumesScreened: null,
    aiInterview: 200,
    aiVoiceScreening: 100,
    scheduledRound: 200,
    offersPerMonth: 50,
    whatsapp: true,
    voiceScreening: true,
    sms: false,
    assignment: true,
    retentionDays: 90,
    customIdentity: true,
    overageBehavior: "metered",
  },
  enterprise: {
    label: "Enterprise",
    maxRounds: 6,
    activeCampaigns: null,
    resumesScreened: null,
    aiInterview: null,
    aiVoiceScreening: null,
    scheduledRound: null,
    offersPerMonth: null,
    whatsapp: true,
    voiceScreening: true,
    sms: true,
    assignment: true,
    retentionDays: 365,
    customIdentity: true,
    overageBehavior: "hard_stop",
  },
};

/** Ascending tier order used for "must be at least X" checks. */
export const TIER_ORDER: Tier[] = ["free", "basic", "growth", "enterprise"];

export function tierAtLeast(tier: Tier, minimum: Tier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(minimum);
}

export function tierFor(tier: Tier): TierLimits {
  return TIER_LIMITS[tier];
}

export function roundTypeAllowed(tier: Tier, type: RoundType): boolean {
  if (type === "assignment") return TIER_LIMITS[tier].assignment;
  return true;
}

export function roundTypeLimitLabel(type: RoundType): string | null {
  if (type === "assignment") return "Available on Growth+";
  return null;
}

export function limitLabel(limit: number | null): string {
  return limit === null ? "Unlimited" : String(limit);
}

export function usagePercent(used: number, granted: number | null | undefined): number | null {
  if (!granted) return null;
  return Math.min(100, (used / granted) * 100);
}

/** Cap labels used by overage notices / hard-stop copy. */
export const OVERAGE_CAP_LABELS: Record<keyof Pick<TierLimits, "maxRounds" | "activeCampaigns">, string> = {
  maxRounds: "rounds per campaign",
  activeCampaigns: "active campaigns",
};

/**
 * A tier whose overage_behavior is 'metered' may exceed its numeric allowances
 * (Growth). Every other tier hard-stops: the UI disables the option and the
 * server returns 403.
 */
export function overageAllowed(tier: Tier): boolean {
  return TIER_LIMITS[tier].overageBehavior === "metered";
}

/**
 * Inline notice copy for a metered tier going past one of its caps, e.g.
 * "Over your included 25 active campaigns - extra usage is billed." Returns
 * null when the action should be hard-gated instead.
 */
export function overageNotice(
  tier: Tier,
  capKey: keyof Pick<TierLimits, "maxRounds" | "activeCampaigns">
): string | null {
  const t = TIER_LIMITS[tier];
  if (t.overageBehavior !== "metered") return null;
  const cap = t[capKey];
  if (cap == null) return null;
  return `Over your included ${cap} ${OVERAGE_CAP_LABELS[capKey]} - extra usage is billed.`;
}