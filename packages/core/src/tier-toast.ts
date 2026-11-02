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
  if (err instanceof Error) {
    const detail = (err as { detail?: string }).detail;
    const message = detail && detail !== err.message ? `${err.message}: ${detail}` : err.message;
    if (/error in the workflow|error in workflow|workflow execution failed/i.test(message)) {
      const cleanDetail =
        detail && !/error in the workflow|error in workflow/i.test(detail) ? detail : null;
      return {
        title: "Workflow Notice",
        message:
          cleanDetail ||
          "Workflow execution failed. Please check your configuration and try again.",
      };
    }
    return { title: "Something went wrong", message };
  }
  if (typeof err === "string" && err.trim().length > 0) {
    if (/error in the workflow|error in workflow/i.test(err)) {
      return {
        title: "Workflow Notice",
        message: "Workflow execution failed. Please check your configuration and try again.",
      };
    }
    return { title: "Notice", message: err };
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    const rawMsg = (err as { message: string }).message;
    if (/error in the workflow|error in workflow/i.test(rawMsg)) {
      return {
        title: "Workflow Notice",
        message: "Workflow execution failed. Please check your configuration and try again.",
      };
    }
    return { title: "Something went wrong", message: rawMsg };
  }
  return { title: "Something went wrong", message: "An unexpected error occurred." };
}
