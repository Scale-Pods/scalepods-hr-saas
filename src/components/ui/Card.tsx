import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-sm",
        className
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3 border-b border-border pb-4", className)}>
      <div>
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}