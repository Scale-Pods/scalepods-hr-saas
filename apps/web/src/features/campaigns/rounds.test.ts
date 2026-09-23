import { describe, expect, it } from "vitest";
import { DEFAULT_ROUND, type RoundDraft } from "@/components/campaigns/RoundEditor";
import { syncRoundCount } from "./rounds";

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
    expect(next[1]).toEqual(DEFAULT_ROUND);
    expect(next[2]).toEqual(DEFAULT_ROUND);
  });

  it("preserves already-configured rounds while growing", () => {
    const configured = draft({ round_type: "human_interview", cutoff_score: 80 });
    const next = syncRoundCount([configured], 2);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(configured);
    expect(next[1]).toEqual(DEFAULT_ROUND);
  });

  it("truncates rounds beyond the count when it shrinks", () => {
    const first = draft({ cutoff_score: 40 });
    const second = draft({ cutoff_score: 90 });
    const third = draft({ cutoff_score: 55 });
    expect(syncRoundCount([first, second, third], 1)).toEqual([first]);
  });
});
