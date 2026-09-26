"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PipelineStage {
  label: string;
  count: number;
  color: string;
}

interface PipelineFlowChartProps {
  stages: PipelineStage[];
  className?: string;
}

const DEFAULT_COLORS = ["#2563eb", "#06b6d4", "#10b981", "#f59e0b", "#8b5cf6"];

/**
 * Horizontal funnel / pipeline flow chart matching the reference UI.
 * Each stage is a box with a count, connected by arrows showing conversion %.
 */
export function PipelineFlowChart({ stages, className }: PipelineFlowChartProps) {
  if (!stages || stages.length === 0) return null;

  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className={cn("flex items-end gap-1 overflow-x-auto pb-2", className)}>
      {stages.map((stage, i) => {
        const pct = Math.round((stage.count / max) * 100);
        const barHeight = Math.max(40, Math.round((stage.count / max) * 120));
        const color = stage.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
        const conversionPct =
          i > 0 && stages[i - 1].count > 0
            ? `+${Math.round((stage.count / stages[i - 1].count) * 100)}%`
            : null;

        return (
          <div key={stage.label} className="flex items-end gap-1">
            {/* Connector arrow */}
            {i > 0 && (
              <div className="pipeline-connector mb-2">
                {conversionPct && (
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {conversionPct}
                  </span>
                )}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden />
              </div>
            )}

            {/* Stage column */}
            <div className="pipeline-stage min-w-[72px]">
              {/* Bar */}
              <div
                className="w-full rounded-t-lg opacity-20"
                style={{ height: `${barHeight}px`, backgroundColor: color }}
              />
              <div
                className="w-full rounded-b-lg"
                style={{ height: "4px", backgroundColor: color }}
              />

              {/* Label */}
              <div className="mt-2 text-center">
                <p className="text-xs font-medium text-muted-foreground">{stage.label}</p>
                <p className="text-xl font-bold tracking-[-0.03em]" style={{ color }}>
                  {stage.count.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
