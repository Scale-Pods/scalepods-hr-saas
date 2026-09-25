"use client";

import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface StatBandStat {
  id: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  hero?: boolean;
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

/**
 * Glass-tiled KPI row. Each stat renders as a liquid-glass metric tile.
 * `hero` stat, if present, must be the first entry and there must be at most one.
 */
export function StatBand({ stats, className }: StatBandProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-6", className)}>
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
  icon,
  hero,
  delta,
  trend,
  progress,
  description,
  onClick,
  loading,
}: StatBandStat) {
  const gradientId = useId();
  const subId = useId();
  const over = progress ? progress.used / Math.max(1, progress.granted) > 0.9 : false;
  const pct = progress ? Math.min(100, (progress.used / Math.max(1, progress.granted)) * 100) : 0;

  return (
    <div
      className={cn("glass-surface metric-tile min-w-0 p-4", hero && "lg:col-span-2")}
      style={{ ["--tile-accent" as string]: "var(--blue)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-fill-tertiary text-label-secondary"
            >
              {icon}
            </span>
          ) : null}
          <p className="metric-label truncate">{label}</p>
        </div>
        {description ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`What does ${label} mean`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label-secondary hover:bg-fill-tertiary hover:text-label-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
        aria-label={onClick ? `${label}: ${String(value)}` : undefined}
        aria-describedby={onClick && sub ? subId : undefined}
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
            <div className="h-7 w-20 animate-pulse rounded bg-fill-tertiary" />
            <div className="h-3.5 w-32 animate-pulse rounded bg-fill-tertiary" />
          </div>
        ) : (
          <>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <p className={cn("metric-value", hero && "text-4xl xl:text-5xl")}>{value}</p>
              {delta != null && delta !== 0 ? (
                <span
                  role="img"
                  className={cn(
                    "metric-trend tabular-nums",
                    delta > 0
                      ? "metric-trend-up text-success"
                      : "metric-trend-down text-destructive",
                  )}
                  aria-label={`${delta > 0 ? `+${delta}` : `${delta}`} vs previous period`}
                >
                  {delta > 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {delta > 0 ? `+${delta}` : `${delta}`}
                </span>
              ) : null}
            </div>
            {trend && trend.length > 1 ? (
              <div
                className={cn("-mx-1 mt-1", hero ? "h-14" : "h-9")}
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
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="var(--chart-1)"
                      strokeWidth={1.5}
                      fill={`url(#${gradientId})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : null}
            {progress ? (
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-fill-tertiary"
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
            {sub ? (
              <p id={sub ? subId : undefined} className="mt-1.5 text-xs text-label-secondary">
                {sub}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
