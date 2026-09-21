import { TierLimitError } from "./errors";

/**
 * Pure presentation helpers for the global tier-limit toast so the messaging
 * stays identical across every page (never bespoke error handling).
 */

export interface TierLimitToastContent {
  title: string;
  message: string;
}

export function tierLimitToastContent(err: TierLimitError): TierLimitToastContent {
  const reason = err.reason;
  const title = reason ? `Plan limit reached: ${reason}` : "Plan limit reached";
  const message = err.detail || `${err.message} Upgrade or top up to keep using this feature.`;
  return { title, message };
}

/** Upgrade CTA target for a given failure context (defaults to /billing). */
export function upgradeTarget(_reason?: string): string {
  return "/billing";
}

export function describeError(err: unknown): { title: string; message: string } {
  if (err instanceof TierLimitError) return tierLimitToastContent(err);
  if (err instanceof Error) return { title: "Something went wrong", message: err.message };
  return { title: "Something went wrong", message: "An unexpected error occurred." };
}
