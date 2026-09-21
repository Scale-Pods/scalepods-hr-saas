import { cn } from "../lib/cn";
import type { FunnelRow } from "@scalepods/core";

export type { FunnelRow };

/**
 * Renders a funnel from generic rows (PATCH 1) - either the backend's
 * `funnel_conversion` report or a database-derived fallback. Each bar scales
 * against `entered`; `converted` (the count that moved to the next stage) is
 * shown to the right when present.
 */
export function FunnelChart({
  rows,
  max,
  className,
}: {
  rows: FunnelRow[];
  max?: number;
  className?: string;
}) {
  if (rows.length === 0) return null;
  const peak = max ?? Math.max(...rows.map((r) => r.entered), 1);
  return (
    <div className={cn("space-y-2", className)}>
      {rows.map((row) => {
        const width = peak > 0 ? (row.entered / peak) * 100 : 0;
        return (
          <div key={row.stage} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-xs text-muted-foreground">{row.stage}</span>
            <div className="h-7 flex-1 overflow-hidden rounded-md bg-muted">
              {row.entered > 0 && (
                <div
                  className="flex h-full items-center justify-end rounded-md bg-primary pr-2 transition-all"
                  style={{ width: `${Math.max(6, width)}%` }}
                >
                  <span className="text-xs font-semibold text-primary-foreground">{row.entered}</span>
                </div>
              )}
            </div>
            {typeof row.converted === "number" && (
              <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                {row.converted} converted
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}