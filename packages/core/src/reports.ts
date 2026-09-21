import type { Reports } from "./schemas";

export interface FunnelRow {
  stage: string;
  entered: number;
  converted?: number;
}

/**
 * Pure helpers that turn the deployed `/webhook/reports` payload (per-campaign
 * stage counts, `time_to_hire` array) into the shapes the dashboard renders.
 * Kept outside the route so the mapping is unit-testable.
 */

const STAGES = [
  "Intake",
  "Any round passed",
  "Human interview",
  "Offers made",
  "Offers signed",
] as const;

function sum(
  rows: Exclude<Reports["funnel_conversion"], undefined>,
  pick: (r: (typeof rows)[number]) => number,
) {
  return rows.reduce((acc, r) => acc + (pick(r) || 0), 0);
}

/**
 * Aggregate the per-campaign funnel columns into a 5-stage funnel.
 * Each row's `converted` is the count that moved to the next stage. Returns
 * null when there is no report-driven funnel so callers can fall back to
 * database-derived rows.
 */
export function buildFunnelRows(reports: Reports): FunnelRow[] | null {
  const rows = reports.funnel_conversion;
  if (!rows || rows.length === 0) return null;

  const intake = sum(rows, (r) => r.entered_stage_1);
  const passed = sum(rows, (r) => r.passed_any_round);
  const human = sum(rows, (r) => r.reached_human_interview);
  const offers = sum(rows, (r) => r.offers_made);
  const signed = sum(rows, (r) => r.offers_signed);

  return [
    { stage: STAGES[0], entered: intake, converted: passed },
    { stage: STAGES[1], entered: passed, converted: human },
    { stage: STAGES[2], entered: human, converted: offers },
    { stage: STAGES[3], entered: offers, converted: signed },
    { stage: STAGES[4], entered: signed },
  ];
}

export interface TimeToHireSummary {
  median_days: number | null;
  average_days: number | null;
  hires: number;
  outlier_entries: number;
}

/**
 * Collapse the `time_to_hire` array to a single summary. The deployed workflow
 * currently returns `[]`, in which case null tells the UI to show its empty
 * state rather than fabricated numbers.
 */
export function summarizeTimeToHire(reports: Reports): TimeToHireSummary | null {
  const slices = reports.time_to_hire;
  if (!slices || slices.length === 0) return null;

  const summary: TimeToHireSummary = {
    median_days: null,
    average_days: null,
    hires: 0,
    outlier_entries: 0,
  };
  for (const s of slices) {
    summary.hires += s.hires || 0;
    summary.outlier_entries += s.outlier_entries || 0;
    if (s.median_days != null) {
      summary.median_days =
        summary.median_days == null ? s.median_days : (summary.median_days + s.median_days) / 2;
    }
    if (s.average_days != null) {
      summary.average_days =
        summary.average_days == null ? s.average_days : (summary.average_days + s.average_days) / 2;
    }
  }
  return summary;
}

export interface SourceRow {
  source: string;
  conversations: number;
  offers: number;
  rate: number | null;
}

export interface TimeToHireCard {
  avg_days_intake_to_offer_signed: number | null;
  avg_hours_per_round: number | null;
  no_show_count: number;
  platform_fault_count: number;
}

/**
 * Spec Section 13b PATCH 1 time-to-hire card. Averages the per-slice averages
 * and totals the counts. Returns null when the backend reports no rows (or no
 * slice carries any of the newer metrics) so the UI shows its empty state
 * instead of zeros pretending to be data.
 */
export function summarizeTimeToHireCard(reports: Reports): TimeToHireCard | null {
  const slices = reports.time_to_hire;
  if (!slices || slices.length === 0) return null;

  const card: TimeToHireCard = {
    avg_days_intake_to_offer_signed: null,
    avg_hours_per_round: null,
    no_show_count: 0,
    platform_fault_count: 0,
  };
  let sawDays = false;
  let sawHours = false;
  for (const s of slices) {
    card.no_show_count += s.no_show_count || 0;
    card.platform_fault_count += s.platform_fault_count || 0;
    if (s.avg_days_intake_to_offer_signed != null) {
      sawDays = true;
      card.avg_days_intake_to_offer_signed =
        card.avg_days_intake_to_offer_signed == null
          ? s.avg_days_intake_to_offer_signed
          : (card.avg_days_intake_to_offer_signed + s.avg_days_intake_to_offer_signed) / 2;
    }
    if (s.avg_hours_per_round != null) {
      sawHours = true;
      card.avg_hours_per_round =
        card.avg_hours_per_round == null
          ? s.avg_hours_per_round
          : (card.avg_hours_per_round + s.avg_hours_per_round) / 2;
    }
  }
  if (!sawDays && !sawHours && card.no_show_count === 0 && card.platform_fault_count === 0) {
    return null;
  }
  return card;
}

export interface SourceEffectivenessRow {
  channel: string;
  stage: string | null;
  messages_sent: number;
  delivered: number;
  fell_back: number;
  delivery_rate_pct: number | null;
}

/**
 * Spec Section 13b PATCH 1 source-effectiveness table. Keeps rows with a usable
 * channel label and derives `delivery_rate_pct` when the backend omits it.
 */
export function sourceEffectivenessRows(reports: Reports): SourceEffectivenessRow[] {
  const rows = reports.source_effectiveness;
  if (!rows) return [];
  const out: SourceEffectivenessRow[] = [];
  for (const r of rows) {
    const channel = r.channel ?? r.source;
    if (typeof channel !== "string" || channel.length === 0) continue;
    const sent = r.messages_sent || r.conversations || 0;
    const delivered = r.delivered || 0;
    out.push({
      channel,
      stage: r.stage ?? null,
      messages_sent: sent,
      delivered,
      fell_back: r.fell_back || 0,
      delivery_rate_pct:
        r.delivery_rate_pct ?? (sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : null),
    });
  }
  return out;
}

/** Keep only source rows that carry a usable label. */
export function sourceRows(reports: Reports): SourceRow[] {
  const rows = reports.source_effectiveness;
  if (!rows) return [];
  return rows
    .filter((r) => typeof r.source === "string" && r.source.length > 0)
    .map((r) => ({
      source: r.source as string,
      conversations: r.conversations || 0,
      offers: r.offers || 0,
      rate: r.rate ?? null,
    }));
}
