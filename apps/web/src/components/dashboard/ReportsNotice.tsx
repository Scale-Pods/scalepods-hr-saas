import { SectionCard } from "@/components/shared/SectionCard";
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
      <SectionCard title="Usage & reporting" subtitle="Loading from the reporting workflow…">
        <div className="space-y-3">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-2/3" />
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Usage & reporting"
      subtitle="The reports endpoint did not respond - is workflow 11 deployed?"
    >
      <p className="text-sm text-muted-foreground">
        Counts above still load from your database. Pipeline and usage bars will appear once{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">GET /webhook/reports</code> is live.
      </p>
    </SectionCard>
  );
}
