import type { LedgerEntry } from "@/features/dashboard/api";

export const SEEN_AT_KEY = "notifications:decisions-seen-at";

/** Number of decisions made after the last time the user viewed the dropdown. */
export function computeUnread(entries: LedgerEntry[], seenAt: number | null): number {
  if (seenAt == null) return entries.length;
  const at = seenAt;
  return entries.filter((e) => new Date(e.decided_at).getTime() > at).length;
}

export function readSeenAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SEEN_AT_KEY);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function writeSeenAt(t: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEEN_AT_KEY, String(t));
}
