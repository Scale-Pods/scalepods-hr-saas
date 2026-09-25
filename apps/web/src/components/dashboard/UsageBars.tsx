"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface UsageBarProps {
  label: string;
  used: number;
  granted: number | null | undefined;
  sub?: string;
}

/** One usage row: used vs. granted, turning destructive past 90%. */
export function UsageBar({ label, used, granted, sub }: UsageBarProps) {
  const over = granted ? used / granted >= 0.9 : false;
  const pct = granted && granted > 0 ? Math.min(100, (used / granted) * 100) : 0;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-label-primary">{label}</span>
        <span
          className={cn(
            "text-xs tabular-nums text-label-secondary",
            over && "font-semibold text-destructive",
          )}
        >
          {used.toLocaleString()} / {granted ? granted.toLocaleString() : "unlimited"}
          {sub ? ` · ${sub}` : ""}
        </span>
      </div>
      <Progress
        value={pct}
        aria-label={`${label} usage`}
        className={cn(
          over && "[&>[data-slot=progress-indicator]]:bg-destructive",
          "[&>[data-slot=progress-indicator]]:transition-all",
        )}
      />
    </div>
  );
}

export interface UsageBarsProps {
  slices: {
    ai_interview?: { used?: number; granted?: number | null };
    ai_voice_screening?: { used?: number; granted?: number | null };
    scheduled_round?: { used?: number; granted?: number | null };
  };
  fallback: {
    aiInterview: number | null;
    aiVoiceScreening: number | null;
    scheduledRound: number | null;
  };
  tierLabel: string;
}

const USAGE_DEFS = [
  { key: "ai_interview", label: "AI interviews", fallback: "aiInterview" },
  { key: "ai_voice_screening", label: "Voice screens", fallback: "aiVoiceScreening" },
  { key: "scheduled_round", label: "Scheduled rounds", fallback: "scheduledRound" },
] as const;

export function UsageBars({ slices, fallback, tierLabel }: UsageBarsProps) {
  return (
    <div className="space-y-4">
      {USAGE_DEFS.map((def) => {
        const slice = slices[def.key];
        const tierCap = fallback[def.fallback];
        // An explicit `granted` (even null = unlimited) always wins over the
        // legacy tier-cap fallback, which only applies to a missing slice.
        const granted = slice ? (slice.granted ?? null) : (tierCap ?? null);
        return (
          <UsageBar
            key={def.key}
            label={def.label}
            used={slice?.used ?? 0}
            granted={granted}
            sub={slice === undefined && tierCap != null ? `${tierLabel} allowance` : undefined}
          />
        );
      })}
    </div>
  );
}
