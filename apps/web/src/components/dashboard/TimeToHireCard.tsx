import type { Reports } from "@scalepods/core";
import { summarizeTimeToHireCard } from "@scalepods/core";
import { EmptyState } from "@/components/shared/EmptyState";

/** Spec Section 13b PATCH 1 time-to-hire card. */
export function TimeToHireCard({ reports }: { reports: Reports }) {
  const card = summarizeTimeToHireCard(reports);
  if (!card) {
    return (
      <EmptyState
        title="No time-to-hire data yet"
        hint="Intake-to-offer duration will appear as candidates progress through rounds."
      />
    );
  }

  const metrics = [
    {
      label: "Intake → signed offer",
      value: card.avg_days_intake_to_offer_signed,
      unit: "days",
    },
    { label: "Avg. hours per round", value: card.avg_hours_per_round, unit: "hrs" },
    { label: "No-shows", value: card.no_show_count, unit: null },
    { label: "Platform faults", value: card.platform_fault_count, unit: null },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4">
      {metrics.map((m) => (
        <div key={m.label}>
          <dt className="metric-label">{m.label}</dt>
          <dd className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[34px] font-light leading-none tracking-[-0.03em] tabular-nums text-label-primary">
              {m.value == null ? "—" : String(m.value)}
            </span>
            {m.unit ? <span className="text-xs text-label-secondary">{m.unit}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
