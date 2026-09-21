import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Cols = 1 | 2 | 3 | 4;

const COL_CLASSES: Record<Cols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

const GAP_CLASSES: Record<3 | 4 | 6, string> = {
  3: "gap-3",
  4: "gap-4",
  6: "gap-6",
};

export interface CardGridCols {
  base?: Cols;
  sm?: Cols;
  md?: Cols;
  lg?: Cols;
}

function gridFor(cols?: CardGridCols, fallback: Cols = 1): string {
  const base = cols?.base ?? fallback;
  const parts = [COL_CLASSES[base]];
  if (cols?.sm) parts.push(`sm:${COL_CLASSES[cols.sm]}`);
  if (cols?.md) parts.push(`md:${COL_CLASSES[cols.md]}`);
  if (cols?.lg) parts.push(`lg:${COL_CLASSES[cols.lg]}`);
  return parts.join(" ");
}

export interface CardGridProps {
  cols?: CardGridCols;
  gap?: keyof typeof GAP_CLASSES;
  className?: string;
  children: ReactNode;
}

export function CardGrid({ cols, gap = 4, className, children }: CardGridProps) {
  return <div className={cn("grid", gridFor(cols), GAP_CLASSES[gap], className)}>{children}</div>;
}
