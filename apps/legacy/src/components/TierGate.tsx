import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import type { Tier } from "../lib/types";
import { TIER_ORDER, tierAtLeast } from "../lib/tier";

/**
 * Advisory client-side gate. Every gate is informational - server-side
 * enforcement (Credit & Usage Guard, workflow 7) is what actually blocks.
 * Never a silent block: it always shows the limit + upgrade path inline.
 */
export function TierGate({
  currentTier,
  minimumTier,
  feature,
  hint,
  children,
}: {
  currentTier: Tier;
  minimumTier: Tier;
  /** Human name of the gated capability, e.g. "Assignment rounds". */
  feature: string;
  hint?: string;
  children: ReactNode;
}) {
  const ok = tierAtLeast(currentTier, minimumTier);
  if (ok) return <>{children}</>;

  const upgradeTier = TIER_ORDER[TIER_ORDER.indexOf(minimumTier)];
  return (
    <div className="rounded-xl border border-dashed border-input bg-muted p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-muted p-1.5">
          <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{feature} is unavailable on your plan</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hint ?? `${feature} requires the ${upgradeTier} tier or above.`}
          </p>
          <Link
            to="/billing"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-accent-foreground"
          >
            Upgrade to {upgradeTier}
          </Link>
        </div>
      </div>
    </div>
  );
}