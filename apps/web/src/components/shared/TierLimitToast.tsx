"use client";

import { describeError, TierLimitError, upgradeTarget } from "@scalepods/core";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Held states are informational - they must never look like a hard failure. */
const HELD_REASONS = new Set(["held_for_window", "held_for_cap"]);

export function isHardStop(reason?: string): boolean {
  return !(reason !== undefined && HELD_REASONS.has(reason));
}

export interface TierLimitToastProps {
  title: string;
  message: string;
  reason?: string;
  onUpgrade?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/** Quick toast for non-tier-limit informational messages. */
export function showToast(message: string, opts?: { kind?: "success" | "info" | "error" }) {
  toast[opts?.kind ?? "info"](message);
}

/**
 * The one and only renderer for 402/403 tier-limit failures. `hard_stop` gets
 * an upgrade CTA and destructive emphasis; `held_for_*` stays neutral.
 */
export function TierLimitToast({
  title,
  message,
  reason,
  onUpgrade,
  onRetry,
  onDismiss,
}: TierLimitToastProps) {
  const hardStop = isHardStop(reason);

  return (
    <div
      role="status"
      className={cn(
        "flex w-full flex-col gap-3 rounded-lg border p-3 shadow-lg",
        hardStop
          ? "border-destructive/40 bg-destructive/15 text-destructive"
          : "border-border bg-card text-foreground",
      )}
    >
      <div>
        <p
          className={cn("text-sm font-semibold", hardStop ? "text-destructive" : "text-foreground")}
        >
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
      </div>
      <div className="flex items-center gap-2">
        {hardStop ? (
          <Button
            asChild
            size="sm"
            onClick={() => {
              onUpgrade?.();
              onDismiss?.();
            }}
          >
            <Link href={upgradeTarget(reason)}>Upgrade plan</Link>
          </Button>
        ) : null}
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export interface ToastActionOptions {
  onUpgrade?: () => void;
  onRetry?: () => void;
}

/** Imperative entry point used by every `useMutation.onError`. */
export function showTierLimitToast(error: unknown, options: ToastActionOptions = {}): void {
  const { title, message } = describeError(error);
  const reason = error instanceof TierLimitError ? error.reason : undefined;
  toast.custom((id) => (
    <TierLimitToast
      title={title}
      message={message}
      reason={reason}
      onUpgrade={options.onUpgrade}
      onDismiss={() => toast.dismiss(id)}
    />
  ));
}

/** Generic network/5xx toast with a Retry wired to the same mutation. */
export function showErrorToast(error: unknown, options: ToastActionOptions = {}): void {
  const { title, message } = describeError(error);
  toast.custom((id) => (
    <TierLimitToast
      title={title}
      message={message}
      reason="held_for_window"
      onRetry={options.onRetry}
      onDismiss={() => toast.dismiss(id)}
    />
  ));
}
