"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MetricTone = "campaigns" | "candidates" | "interviews" | "credits" | "custom";

const TONE_ACCENT: Record<MetricTone, string> = {
  campaigns: "var(--blue)",
  candidates: "var(--green)",
  interviews: "var(--indigo)",
  credits: "var(--orange)",
  custom: "var(--purple)",
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
  const accent = TONE_ACCENT[tone ?? "custom"];

  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaTone =
    delta == null || delta === 0
      ? "text-muted-foreground"
      : delta > 0
        ? "text-success"
        : "text-destructive";
  const deltaLabel = delta == null ? "" : delta > 0 ? `+${delta}` : `${delta}`;

  const iconChipStyle = {
    backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`,
    color: accent,
  };

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
      style={{ "--tile-accent": accent } as React.CSSProperties}
      className={cn(
        "metric-tile flex h-full flex-col gap-2 p-5",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="metric-label">{label}</p>
        {icon ? (
          description ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`What does ${label} mean`}
                  style={iconChipStyle}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm transition-opacity hover:opacity-85",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
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
              style={iconChipStyle}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm"
            >
              {icon}
            </span>
          )
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-8 w-24 animate-pulse rounded-full bg-fill-quaternary" />
          <div className="h-4 w-40 animate-pulse rounded-full bg-fill-quaternary" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="metric-value">{value}</p>
            {delta != null && delta !== 0 ? (
              <span
                role="img"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                  deltaTone,
                )}
                aria-label={`${deltaLabel} vs previous period`}
              >
                <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
                {deltaLabel}
              </span>
            ) : null}
          </div>
          {sub ? <p className="metric-label text-xs">&nbsp;</p> : null}
          {trend && trend.length > 1 ? (
            <div
              className="-mx-1 mt-1 h-10"
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
                      <stop offset="0%" stopColor={accent} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={accent}
                    strokeWidth={1.5}
                    fill={`url(#${gradientId})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          {sub ? <p className="text-xs text-label-secondary">{sub}</p> : null}
        </>
      )}
    </Card>
  );
}
