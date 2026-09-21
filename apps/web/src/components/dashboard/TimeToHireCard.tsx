import type { Reports } from "@scalepods/core";
import { summarizeTimeToHireCard } from "@scalepods/core";
import { EmptyState } from "@/components/shared/EmptyState";

function metric(value: number | null, unit: string): string {
  return value == null ? "—" : `${value} ${unit}`;
}

/** Spec Section 13b PATCH 1 time-to-hire card. */
export function TimeToHireCard({ reports }: { reports: Reports }) {
  const card = summarizeTimeToHireCard(reports);
  if (!card) {
    return (
      <EmptyState
        title="No time-to-hire data yet"
        hint="Intake-to-offer lag comes from GET /webhook/reports."
      />
    );
  }

  const metrics = [
    {
      label: "Intake → signed offer",
      value: metric(card.avg_days_intake_to_offer_signed, "days"),
    },
    { label: "Avg. hours per round", value: metric(card.avg_hours_per_round, "hrs") },
    { label: "No-shows", value: String(card.no_show_count) },
    { label: "Platform faults", value: String(card.platform_fault_count) },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4">
      {metrics.map((m) => (
        <div key={m.label}>
          <dt className="text-xs text-muted-foreground">{m.label}</dt>
          <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}
