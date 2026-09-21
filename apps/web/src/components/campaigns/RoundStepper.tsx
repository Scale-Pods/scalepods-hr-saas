import type { RoundType } from "@scalepods/core";
import { Bot, CalendarClock, ClipboardList, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export const ROUND_TYPE_META: Record<
  RoundType,
  { label: string; icon: typeof Bot; blurb: string }
> = {
  ai_interview: { label: "AI Interview", icon: Bot, blurb: "Live AI-conducted interview" },
  human_interview: {
    label: "Human Interview",
    icon: CalendarClock,
    blurb: "Live interview on a team calendar",
  },
  assignment: { label: "Assignment", icon: ClipboardList, blurb: "Take-home task" },
};

export function RoundTypeIcon({ type, className }: { type: RoundType; className?: string }) {
  const meta = ROUND_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span
      title={meta.blurb}
      className={cn(
        "inline-flex rounded-full p-1.5",
        type === "ai_interview"
          ? "bg-accent text-primary"
          : type === "human_interview"
            ? "bg-success/10 text-success"
            : "bg-warning/10 text-warning",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export function RoundStepper({
  numberOfRounds,
  types,
  currentRound,
  statuses,
}: {
  numberOfRounds: number;
  types: Record<number, RoundType>;
  currentRound?: number;
  statuses?: Record<number, string>;
}) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto">
      {Array.from({ length: numberOfRounds }, (_, i) => i + 1).map((n) => (
        <li key={n} className="flex shrink-0 items-center gap-1">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
              currentRound === n ? "border-primary bg-accent" : "border-border bg-card",
            )}
          >
            <span className="text-xs font-semibold text-muted-foreground">Round {n}</span>
            {types[n] ? <RoundTypeIcon type={types[n]} /> : null}
            {statuses?.[n] ? <StatusChip status={statuses[n]} /> : null}
          </div>
          {n < numberOfRounds ? <span className="text-muted-foreground">→</span> : null}
        </li>
      ))}
      <li className="flex shrink-0 items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-1">
        <Trophy className="h-3.5 w-3.5 text-success" aria-hidden />
        <span className="text-xs font-semibold text-success">Offer</span>
      </li>
    </ol>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "passed"
      ? "bg-success/10 text-success"
      : status === "failed"
        ? "bg-destructive/10 text-destructive"
        : "bg-warning/10 text-warning";
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase", tone)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
