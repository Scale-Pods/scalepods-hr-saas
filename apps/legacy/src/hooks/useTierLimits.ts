import { useEffect, useState } from "react";
import { browserClient } from "../lib/supabase";
import { TIER_LIMITS, type TierLimits } from "../lib/tier";
import type { Tier } from "../lib/types";

/**
 * Loads the account tier's allowance from the public, anon-readable
 * `tier_limits` table (PATCH 3) and merges it over the static mirror in
 * `src/lib/tier.ts`. The static mirror renders immediately; the DB row (when
 * present) becomes authoritative. Every gate stays advisory - the n8n Credit &
 * Usage Guard is the real enforcement.
 */
export function useTierLimits(tier: Tier): TierLimits {
  const [limits, setLimits] = useState<TierLimits>(() => TIER_LIMITS[tier]);

  useEffect(() => {
    let mounted = true;
    setLimits(TIER_LIMITS[tier]);
    browserClient()
      .from("tier_limits")
      .select("*")
      .eq("id", tier)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted && data) setLimits({ ...TIER_LIMITS[tier], ...fromRow(data) });
      });
    return () => {
      mounted = false;
    };
  }, [tier]);

  return limits;
}

function fromRow(
  row: {
    max_rounds: number;
    active_campaigns: number | null;
    resumes_screened: number | null;
    ai_interview: number | null;
    ai_voice_screening: number | null;
    scheduled_round: number | null;
    offers_per_month: number | null;
    whatsapp: boolean;
    voice_screening: boolean;
    sms: boolean;
    assignment: boolean;
    retention_days: number;
    custom_identity: boolean;
    overage_behavior: "hard_stop" | "metered";
  }
): Partial<TierLimits> {
  return {
    maxRounds: row.max_rounds,
    activeCampaigns: row.active_campaigns,
    resumesScreened: row.resumes_screened,
    aiInterview: row.ai_interview,
    aiVoiceScreening: row.ai_voice_screening,
    scheduledRound: row.scheduled_round,
    offersPerMonth: row.offers_per_month,
    whatsapp: row.whatsapp,
    voiceScreening: row.voice_screening,
    sms: row.sms,
    assignment: row.assignment,
    retentionDays: row.retention_days,
    customIdentity: row.custom_identity,
    overageBehavior: row.overage_behavior,
  };
}