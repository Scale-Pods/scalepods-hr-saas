import { DashboardSection } from "@/components/shared/DashboardSection";
import { Skeleton } from "@/components/ui/skeleton";

export interface ReportsNoticeProps {
  state: "loading" | "unavailable";
}

/**
 * The reports widget degrades gracefully: a missing/broken workflow 11 shows
 * this notice while every database-backed widget keeps working.
 */
export function ReportsNotice({ state }: ReportsNoticeProps) {
  if (state === "loading") {
    return (
      <DashboardSection title="Usage & reporting" subtitle="Compiling reports and metrics…">
        <div className="space-y-3 rounded-[14px] bg-fill-quaternary/70 px-4 py-3">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-2/3" />
        </div>
      </DashboardSection>
    );
  }

  return (
    <DashboardSection
      title="Usage & reporting"
      subtitle="Analytics metrics are currently being compiled."
    >
      <div className="rounded-[14px] bg-fill-quaternary/70 px-4 py-3 text-sm text-label-primary">
        <p>
          Pipeline metrics and usage summaries will automatically appear once activity data is
          compiled.
        </p>
      </div>
    </DashboardSection>
  );
}
