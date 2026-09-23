"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MetricTone = "campaigns" | "candidates" | "interviews" | "credits" | "custom";

const TONE_TILES: Record<MetricTone, string> = {
  campaigns: "bg-gradient-to-br from-[#6c5ce7] to-[#4c3fc7]",
  candidates: "bg-gradient-to-br from-[#8b7af6] to-[#5b4bd6]",
  interviews: "bg-gradient-to-br from-[#a78bfa] to-[#7c5ce0]",
  credits: "bg-gradient-to-br from-[#c9e85c] to-[#a7c63b]",
  custom: "bg-gradient-to-br from-[#6c5ce7] to-[#c9e85c]",
};

const TONE_ICON: Record<MetricTone, string> = {
  campaigns: "text-white",
  candidates: "text-white",
  interviews: "text-white",
  credits: "text-[#17161f]",
  custom: "text-white",
};

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number | null;
  trend?: number[] | null;
  icon?: ReactNode;
  description?: ReactNode;
  onClick?: () => void;
  loading?: boolean;
  className?: string;
  tone?: MetricTone;
}

export function MetricCard({
  label,
  value,
  sub,
  delta,
  trend,
  icon,
  description,
  onClick,
  loading,
  className,
  tone,
}: MetricCardProps) {
  const gradientId = useId();

  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaTone =
    delta == null || delta === 0
      ? "text-muted-foreground"
      : delta > 0
        ? "text-success"
        : "text-destructive";
  const deltaLabel = delta == null ? "" : delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
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
        "flex flex-col gap-2 p-5",
        onClick && "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon ? (
          description ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`What does ${label} mean`}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    TONE_ICON[tone ?? "custom"],
                    "shadow-md shadow-black/10",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    TONE_TILES[tone ?? "custom"],
                  )}
                >
                  {icon}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 text-xs">
                {description}
              </PopoverContent>
            </Popover>
          ) : (
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                TONE_ICON[tone ?? "custom"],
                "shadow-md shadow-black/10",
                TONE_TILES[tone ?? "custom"],
              )}
            >
              {icon}
            </span>
          )
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {value}
            </p>
            {delta != null && delta !== 0 ? (
              <span
                role="img"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                  deltaTone,
                )}
                aria-label={`${deltaLabel} vs previous period`}
              >
                <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
                {deltaLabel}
              </span>
            ) : null}
          </div>
          {sub ? <p className="text-xs text-muted-foreground">&nbsp;</p> : null}
          {trend && trend.length > 1 ? (
            <div
              className="-mx-1 h-10"
              role="img"
              aria-label={`${label} trend: ${trend.join(", ")}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trend.map((value, index) => ({ i: index, v: value }))}
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
          {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </>
      )}
    </Card>
  );
}
