import {
  type CreditType,
  type CreditUsage,
  effectiveGranted,
  PLANS,
  type Tier,
} from "@scalepods/core";

export interface ReconciledUsage {
  ai_interview: { used: number; granted: number | null };
  ai_voice_screening: { used: number; granted: number | null };
  scheduled_round: { used: number; granted: number | null };
}

/** Report slices the reconcile reads. Each field optional: the n8n report may drift. */
type UsageInput = Partial<Record<CreditType, CreditUsage>>;

const CREDIT_TYPES: CreditType[] = ["ai_interview", "ai_voice_screening", "scheduled_round"];

/**
 * Displayed usage for the dashboard/billing cards. `used` comes straight from
 * the n8n report; `granted` is reconciled from the authoritative plan table so
 * a drifting backend `granted` (e.g. free-tier numbers on an Enterprise
 * account) can't under-report allowances. `granted: null` = unlimited.
 */
export function reconcileUsage(usage: UsageInput | undefined, tier: Tier): ReconciledUsage {
  const plan = PLANS[tier];
  const out = {} as ReconciledUsage;
  for (const type of CREDIT_TYPES) {
    const slice = usage?.[type];
    out[type] = { used: slice?.used ?? 0, granted: effectiveGranted(plan, type, slice) };
  }
  return out;
}
