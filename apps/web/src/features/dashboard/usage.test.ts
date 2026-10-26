import { describe, expect, it } from "vitest";
import { reconcileUsage } from "./usage";

describe("reconcileUsage", () => {
  it("keeps Enterprise AI/voice/scheduled allowances unlimited (null)", () => {
    expect(
      reconcileUsage(
        {
          ai_interview: { used: 1, granted: 1 },
          ai_voice_screening: { used: 0, granted: 1 },
          scheduled_round: { used: 0, granted: 1 },
        },
        "enterprise",
      ),
    ).toEqual({
      ai_interview: { used: 1, granted: null },
      ai_voice_screening: { used: 0, granted: null },
      scheduled_round: { used: 0, granted: null },
    });
  });

  it("uses the plan allowance and ignores n8n granted", () => {
    expect(reconcileUsage({ ai_interview: { used: 1, granted: 999 } }, "free")).toEqual({
      ai_interview: { used: 1, granted: 10 },
      ai_voice_screening: { used: 0, granted: 0 },
      scheduled_round: { used: 0, granted: 10 },
    });
  });

  it("adds rolled_over and purchased to the allowance, uses stay from report", () => {
    expect(
      reconcileUsage(
        {
          ai_interview: { used: 4, granted: 0, rolled_over: 5, purchased: 10 },
          ai_voice_screening: { used: 7 },
          scheduled_round: {},
        },
        "growth",
      ),
    ).toEqual({
      ai_interview: { used: 4, granted: 215 },
      ai_voice_screening: { used: 7, granted: 100 },
      scheduled_round: { used: 0, granted: 200 },
    });
  });

  it("defaults to the plan allowance when the report slice is missing", () => {
    expect(reconcileUsage(undefined, "basic")).toEqual({
      ai_interview: { used: 0, granted: 50 },
      ai_voice_screening: { used: 0, granted: 20 },
      scheduled_round: { used: 0, granted: 50 },
    });
  });
});
