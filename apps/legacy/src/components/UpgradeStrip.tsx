import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "../lib/cn";
import { Card } from "./ui/Card";

/** Inline strip shown when a gate is hit but the user must keep working. */
export function UpgradeStrip({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2",
        className
      )}
    >
      <p className="text-xs font-medium text-warning">{message}</p>
      <Link
        to="/billing"
        className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-warning hover:opacity-80"
      >
        Upgrade <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

/** Placeholder block for a dashboard section whose backend isn't deployed yet. */
export function UnavailableCard({ title, note }: { title: string; note?: string }) {
  return (
    <Card>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        {note ?? "This section will appear once the reporting workflow is live."}
      </p>
    </Card>
  );
}