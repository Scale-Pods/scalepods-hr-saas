import { describe, expect, it } from "vitest";
import { DEFAULT_ROUND, type RoundDraft } from "@/components/campaigns/RoundEditor";
import { syncRoundCount } from "./rounds";

const DEFAULT_FIELDS = {
  round_type: "ai_interview",
  interviewer_email: "",
  cutoff_score: 70,
  daily_start_time: "09:00",
  daily_end_time: "18:00",
  brief_text: "",
  assignment_deadline_hours: 72,
} as const;

function draft(overrides: Partial<RoundDraft> = {}): RoundDraft {
  return { ...DEFAULT_ROUND, ...overrides };
}

describe("syncRoundCount", () => {
  it("leaves the array untouched when the count already matches", () => {
    const rounds = [draft()];
    expect(syncRoundCount(rounds, 1)).toBe(rounds);
  });

  it("appends default rounds when the count grows", () => {
    const next = syncRoundCount([draft()], 3);
    expect(next).toHaveLength(3);
    expect(next[1]).toMatchObject(DEFAULT_FIELDS);
    expect(next[2]).toMatchObject(DEFAULT_FIELDS);
  });

  it("gives every round a unique stable id", () => {
    const next = syncRoundCount([draft()], 3);
    const ids = next.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(next[1].id).not.toBe(next[0].id);
  });

  it("preserves already-configured rounds while growing", () => {
    const configured = draft({ round_type: "human_interview", cutoff_score: 80 });
    const next = syncRoundCount([configured], 2);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(configured);
    expect(next[1]).toMatchObject(DEFAULT_FIELDS);
  });

  it("truncates rounds beyond the count when it shrinks", () => {
    const first = draft({ cutoff_score: 40 });
    const second = draft({ cutoff_score: 90 });
    const third = draft({ cutoff_score: 55 });
    expect(syncRoundCount([first, second, third], 1)).toEqual([first]);
  });
});
