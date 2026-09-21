import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "../lib/cn";
import { Card } from "./ui/Card";

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
}: MetricCardProps) {
  const gradientId = useId();
  const [showInfo, setShowInfo] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showInfo) return;
    const onPointerDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setShowInfo(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowInfo(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showInfo]);

  const DeltaIcon =
    delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaTone =
    delta == null || delta === 0
      ? "text-muted-foreground"
      : delta > 0
        ? "text-success"
        : "text-destructive";
  const deltaLabel =
    delta == null ? "" : delta > 0 ? `+${delta}` : `${delta}`;

  const role = onClick ? "button" : undefined;

  return (
    <Card
      role={role}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "flex flex-col gap-2",
        onClick &&
          "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md",
        className
      )}
    >
      <div ref={headerRef} className="relative flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <button
              type="button"
              aria-label={description ? `What does ${label} mean` : undefined}
              aria-expanded={showInfo || undefined}
              onClick={(e) => {
                e.stopPropagation();
                setShowInfo((v) => !v);
              }}
              className="flex items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {icon}
            </button>
            {showInfo && description && (
              <span
                role="tooltip"
                className="absolute right-0 top-8 z-30 w-max max-w-64 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-left text-xs text-popover-foreground shadow-md"
              >
                {description}
              </span>
            )}
          </span>
        )}
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
            {delta != null && delta !== 0 && (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-xs font-medium tabular-nums",
                  deltaTone
                )}
                aria-label={`${deltaLabel} vs previous period`}
              >
                <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
                {deltaLabel}
              </span>
            )}
          </div>
          {sub && (
            <p className="text-xs text-muted-foreground">&nbsp;</p>
          )}
          {trend && trend.length > 1 ? (
            <div
              className="-mx-1 h-10"
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
                      <stop
                        offset="0%"
                        stopColor="var(--chart-1)"
                        stopOpacity={0.25}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--chart-1)"
                        stopOpacity={0}
                      />
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
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </>
      )}
    </Card>
  );
}