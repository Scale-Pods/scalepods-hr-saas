import { type CreditType, effectiveGranted, PLANS, type Reports, type Tier } from "@scalepods/core";

export interface ReconciledUsage {
  ai_interview: { used: number; granted: number | null };
  ai_voice_screening: { used: number; granted: number | null };
  scheduled_round: { used: number; granted: number | null };
}

const CREDIT_TYPES: CreditType[] = ["ai_interview", "ai_voice_screening", "scheduled_round"];

/**
 * Displayed usage for the dashboard/billing cards. `used` comes straight from
 * the n8n report; `granted` is reconciled from the authoritative plan table so
 * a drifting backend `granted` (e.g. free-tier numbers on an Enterprise
 * account) can't under-report allowances.
 */
export function reconcileUsage(usage: Reports["usage"], tier: Tier): ReconciledUsage {
  const plan = PLANS[tier];
  const out: ReconciledUsage = {
    ai_interview: { used: 0, granted: null },
    ai_voice_screening: { used: 0, granted: null },
    scheduled_round: { used: 0, granted: null },
  };
  for (const type of CREDIT_TYPES) {
    const slice = usage?.[type];
    out[type].used = slice?.used ?? 0;
    out[type].granted = effectiveGranted(plan, type, slice);
  }
  return out;
}
