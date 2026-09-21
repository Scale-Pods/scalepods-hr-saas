import { describe, expect, it } from "vitest";
import {
  buildTimeSlots,
  hmToMinutes,
  minutesToHM,
  formatTime,
  formatCountdown,
  timeAgo,
  dailySeries,
} from "./format";

describe("buildTimeSlots", () => {
  it("splits a window into step-sized slots with the given duration", () => {
    const slots = buildTimeSlots({ startTime: "09:00", endTime: "11:00", stepMinutes: 30, durationMinutes: 45 });
    expect(slots).toEqual([
      { start: "09:00", end: "09:45" },
      { start: "09:30", end: "10:15" },
      { start: "10:00", end: "10:45" },
    ]);
  });

  it("never emits a slot that overruns the window", () => {
    const slots = buildTimeSlots({ startTime: "09:00", endTime: "09:30", stepMinutes: 15, durationMinutes: 45 });
    expect(slots).toHaveLength(0);
  });

  it("handles an all-day window with defaults", () => {
    const slots = buildTimeSlots({ startTime: "00:00", endTime: "01:30" });
    expect(slots[0]).toEqual({ start: "00:00", end: "00:45" });
    expect(slots[slots.length - 1]).toEqual({ start: "00:30", end: "01:15" });
    expect(slots).toHaveLength(2);
  });
});

describe("time helpers", () => {
  it("converts HH:MM to minutes and back", () => {
    expect(hmToMinutes("09:30")).toBe(570);
    expect(minutesToHM(570)).toBe("09:30");
    expect(minutesToHM(0)).toBe("00:00");
  });

  it("formats 12-hour display times", () => {
    expect(formatTime("09:00")).toBe("9:00 AM");
    expect(formatTime("14:30")).toBe("2:30 PM");
    expect(formatTime("12:15")).toBe("12:15 PM");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime(null)).toBe("—");
  });

  it("formats countdowns", () => {
    const now = new Date();
    const later = now.getTime() + 2 * 3_600_000 + 5 * 60_000;
    expect(formatCountdown(new Date(later).toISOString(), now)).toBe("2h 5m");
    const past = now.getTime() - 1000;
    expect(formatCountdown(new Date(past).toISOString(), now)).toBe("0h 0m");
  });
});

describe("timeAgo", () => {
  const base = new Date("2026-09-18T12:00:00Z");

  it("labels recent activity with a relative timestamp", () => {
    expect(
      timeAgo(new Date(base.getTime() - 5 * 60_000).toISOString(), base)
    ).toBe("5m ago");
    expect(
      timeAgo(new Date(base.getTime() - 3 * 3_600_000).toISOString(), base)
    ).toBe("3h ago");
    expect(
      timeAgo(new Date(base.getTime() - 2 * 86_400_000).toISOString(), base)
    ).toBe("2d ago");
  });

  it("falls back to a date for very old activity", () => {
    expect(
      timeAgo(new Date("2026-01-01T10:00:00Z").toISOString(), base)
    ).not.toContain("ago");
  });
});

describe("dailySeries", () => {
  const base = new Date("2026-09-18T12:00:00Z");

  it("buckets ISO timestamps into the last N days, oldest first", () => {
    const iso = (offsetMs: number) => new Date(base.getTime() + offsetMs).toISOString();
    const series = dailySeries(
      [iso(0), iso(-86_400_000), iso(-6 * 86_400_000), iso(-7 * 86_400_000)],
      7,
      base
    );
    expect(series).toHaveLength(7);
    expect(series.reduce((a, b) => a + b, 0)).toBe(3);
    expect(series[0]).toBe(1);
    expect(series[5]).toBe(1);
    expect(series[6]).toBe(1);
  });

  it("ignores timestamps outside the window", () => {
    const iso = (offsetMs: number) => new Date(base.getTime() + offsetMs).toISOString();
    const series = dailySeries(
      [iso(-8 * 86_400_000), iso(86_400_000)],
      7,
      base
    );
    expect(series.every((v) => v === 0)).toBe(true);
  });
});