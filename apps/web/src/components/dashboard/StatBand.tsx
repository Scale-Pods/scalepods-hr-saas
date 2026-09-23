"use client";

import { Info, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface StatBandStat {
  id: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number | null;
  trend?: number[] | null;
  progress?: { used: number; granted: number } | null;
  description?: ReactNode;
  onClick?: () => void;
  loading?: boolean;
}

export interface StatBandProps {
  stats: StatBandStat[];
  className?: string;
}

/** Flat, hairline-separated KPI row. No cards, no boxes. */
export function StatBand({ stats, className }: StatBandProps) {
  return (
    <div
      className={cn(
        "grid gap-6 sm:grid-cols-2 lg:grid-cols-5",
        "lg:[&>*:first-child]:border-0 lg:[&>*:first-child]:pl-0",
        className,
      )}
    >
      {stats.map((s) => (
        <StatCell key={s.id} {...s} />
      ))}
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
  delta,
  trend,
  progress,
  description,
  onClick,
  loading,
}: StatBandStat) {
  const gradientId = useId();
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaTone =
    delta == null || delta === 0
      ? "text-muted-foreground"
      : delta > 0
        ? "text-success"
        : "text-destructive";
  const deltaLabel = delta == null ? "" : delta > 0 ? `+${delta}` : `${delta}`;
  const over = progress ? progress.used / Math.max(1, progress.granted) > 0.9 : false;
  const pct = progress ? Math.min(100, (progress.used / Math.max(1, progress.granted)) * 100) : 0;

  return (
    <div className="min-w-0 border-border lg:border-l lg:pl-6">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        {description ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`What does ${label} mean`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 text-xs">
              {description}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: content block is a valid interactive region when onClick is provided */}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role resolves to "button" when aria-label is used */}
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? label : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        className={cn(
          onClick &&
            "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        {loading ? (
          <div className="mt-2 space-y-2">
            <div className="h-7 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {value}
              </p>
              {delta != null && delta !== 0 ? (
                <span
                  role="img"
                  className={cn(
                    "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                    deltaTone,
                  )}
                  aria-label={`${deltaLabel} vs previous period`}
                >
                  <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
                  {deltaLabel}
                </span>
              ) : null}
            </div>
            {trend && trend.length > 1 ? (
              <div
                className="-mx-1 mt-1 h-9"
                role="img"
                aria-label={`${label} trend: ${trend.join(", ")}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={trend.map((v, i) => ({ i, v }))}
                    margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="var(--chart-1)"
                      strokeWidth={1.5}
                      fill={`url(#${gradientId})`}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : null}
            {progress ? (
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${label} progress: ${progress.used} of ${progress.granted}`}
              >
                {pct > 0 ? (
                  <div
                    className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-success")}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                ) : null}
              </div>
            ) : null}
            {sub ? <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
