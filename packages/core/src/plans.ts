import type { RoundType, Tier } from "./types";

export type OverageBehavior = "hard_stop" | "metered" | "committed_volume";
export type ReachOutChannel = "email" | "whatsapp" | "sms";
export type ReachOutCadence = "reduced" | "standard" | "full" | "configurable";
export type SupportLevel = "email_48h" | "priority_24h" | "dedicated_csm" | null;
export type PlanRoundType = RoundType | "custom";
export type CreditType = "ai_interview" | "ai_voice_screening" | "scheduled_round";

/** Report slice fields the reconcile reads (structurally a subset of UsageSlice). */
export interface CreditUsage {
  used?: number;
  granted?: number | null;
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
export function effectiveGranted(plan: Plan, type: CreditType, usage?: CreditUsage): number | null {
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
