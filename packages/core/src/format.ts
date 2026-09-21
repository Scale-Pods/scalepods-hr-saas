/** Small presentation helpers - no business logic, formatting only. */

export function formatDateTime(iso: string | null | undefined, tz?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatTime(timeValue: string | null | undefined): string {
  if (!timeValue) return "—";
  // Accepts "09:00" or "09:00:00" or full ISO timestamp.
  const m = /(\d{1,2}):(\d{2})/.exec(timeValue);
  if (!m) return timeValue;
  const hours = Number(m[1]);
  const mins = m[2];
  const period = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 === 0 ? 12 : hours % 12;
  return `${h}:${mins} ${period}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat().format(n);
}

/** Countdown to a deadline expressed as a short human string. */
export function formatCountdown(targetIso: string, now: Date = new Date()): string {
  const target = new Date(targetIso).getTime();
  const diff = target - now.getTime();
  if (diff <= 0) return "0h 0m";
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${mins}m`;
}

/**
 * Slot picker: generate candidate-facing time slots for a day bounded by
 * [start, end] at a given step and duration. Pure + testable. Times are in
 * the caller's local timezone and serialized as "HH:MM".
 */
export function buildTimeSlots(opts: {
  startTime: string;
  endTime: string;
  stepMinutes?: number;
  durationMinutes?: number;
}): { start: string; end: string }[] {
  const step = opts.stepMinutes ?? 30;
  const duration = opts.durationMinutes ?? 45;
  const startMin = hmToMinutes(opts.startTime);
  const endMin = hmToMinutes(opts.endTime);
  const slots: { start: string; end: string }[] = [];
  for (let s = startMin; s + duration <= endMin; s += step) {
    slots.push({ start: minutesToHM(s), end: minutesToHM(s + duration) });
  }
  return slots;
}

export function hmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "Europe/Berlin" style IANA zone from the browser. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** "3m ago"-style relative timestamp. Pure + testable (inject `now`). */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return weeks > 4 ? formatDate(iso) : `${weeks}w ago`;
}

/**
 * Bucket ISO date strings into per-day counts for the last `days` days,
 * oldest → newest. Pure + testable (inject `now`).
 */
export function dailySeries(isos: string[], days: number, now: Date = new Date()): number[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const startMs = start.getTime();
  const buckets = new Array<number>(days).fill(0);
  for (const iso of isos) {
    const t = new Date(iso).getTime();
    const dayIndex = Math.floor((t - startMs) / 86_400_000);
    if (dayIndex >= 0 && dayIndex < days) buckets[dayIndex] += 1;
  }
  return buckets;
}
