import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "@/features/dashboard/api";
import { computeUnread } from "./unread";

let seq = 0;
const entry = (decided_at: string): LedgerEntry => ({
  id: `entry-${++seq}`,
  candidate_id: "c-1",
  stage: "ai_interview",
  score: null,
  source: "workflow",
  override_of: null,
  decided_at,
});

describe("computeUnread", () => {
  it("counts every entry when nothing has been seen yet", () => {
    const entries = [entry("2026-09-01T10:00:00Z"), entry("2026-09-02T10:00:00Z")];
    expect(computeUnread(entries, null)).toBe(2);
  });

  it("counts only decisions decided after seenAt", () => {
    const entries = [entry("2026-09-01T10:00:00Z"), entry("2026-09-02T10:00:00Z")];
    expect(computeUnread(entries, Date.parse("2026-09-01T12:00:00Z"))).toBe(1);
  });

  it("excludes the exact seenAt boundary", () => {
    const at = Date.parse("2026-09-02T10:00:00Z");
    const entries = [entry(new Date(at).toISOString())];
    expect(computeUnread(entries, at)).toBe(0);
  });
});
