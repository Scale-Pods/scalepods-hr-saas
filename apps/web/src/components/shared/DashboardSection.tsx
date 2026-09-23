import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DashboardSectionProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

/** Cardless section: heading row closed by a hairline rule. */
export function DashboardSection({
  title,
  subtitle,
  action,
  className,
  contentClassName,
  children,
}: DashboardSectionProps) {
  return (
    <section className={cn("py-5", className)}>
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("pt-4", contentClassName)}>{children}</div>
    </section>
  );
}
