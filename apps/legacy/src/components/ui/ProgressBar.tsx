import { cn } from "../../lib/cn";

export function ProgressBar({
  value,
  max,
  dangerThreshold = 0.9,
  className,
  barClassName,
}: {
  value: number;
  max: number | null | undefined;
  dangerThreshold?: number;
  className?: string;
  barClassName?: string;
}) {
  if (!max || max <= 0) {
    return (
      <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
        <div className="h-full w-0 rounded-full bg-muted" />
      </div>
    );
  }
  const pct = Math.min(100, (value / max) * 100);
  const isOver = pct > dangerThreshold * 100;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all",
          barClassName ?? (isOver ? "bg-destructive" : "bg-primary")
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function UsageBar({
  label,
  used,
  granted,
  sub,
}: {
  label: string;
  used: number;
  granted: number | null | undefined;
  sub?: string;
}) {
  const over = granted ? used / granted >= 0.9 : false;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className={cn("text-xs text-muted-foreground", over && "font-semibold text-destructive")}>
          {used.toLocaleString()} / {granted ? granted.toLocaleString() : "unlimited"}
          {sub ? ` · ${sub}` : ""}
        </span>
      </div>
      <ProgressBar value={used} max={granted} />
    </div>
  );
}