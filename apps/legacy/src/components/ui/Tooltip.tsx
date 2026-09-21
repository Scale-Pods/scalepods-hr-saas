import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

const SIDE_CLASSES: Record<Side, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

type Side = "top" | "bottom" | "left" | "right";

export function Tooltip({
  label,
  children,
  side = "bottom",
  disabled,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: Side;
  disabled?: boolean;
  className?: string;
}) {
  if (disabled) return <>{children}</>;
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-30 w-max max-w-64 rounded-lg bg-foreground px-2.5 py-1.5 text-center text-xs text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          SIDE_CLASSES[side],
          className
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function UpgradeHint({
  hint,
  show,
  className,
}: {
  hint: ReactNode;
  show: boolean;
  className?: string;
}) {
  return !show ? null : (
    <p className={cn("text-xs text-warning", className)}>{hint}</p>
  );
}