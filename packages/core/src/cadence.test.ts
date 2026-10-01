import { describe, expect, it } from "vitest";
import type { CadenceConfig } from "./cadence";
import {
  cadenceConfigPayload,
  cadenceTierEditability,
  clampCadence,
  defaultCadenceForTier,
} from "./cadence";

describe("defaultCadenceForTier", () => {
  it("keeps email-only stages on free and gates WhatsApp/voice/assignment", () => {
    const free = defaultCadenceForTier("free");
    expect(free.stages.shortlist?.channels).toEqual(["email"]);
    expect(free.stages.shortlist?.enabled).toBe(true);
    expect(free.stages.voice_screen?.enabled).toBe(false);
    expect(free.stages.assignment_deadline_24h?.enabled).toBe(false);
  });

  it("adds WhatsApp and voice channels on Basic+", () => {
    const basic = defaultCadenceForTier("basic");
    expect(basic.stages.shortlist?.channels).toEqual(["email", "whatsapp"]);
    expect(basic.stages.voice_screen?.channels).toEqual(["voice_call"]);
    expect(basic.stages.voice_screen?.enabled).toBe(true);
  });

  it("applies timing defaults to timing-aware stages", () => {
    const g = defaultCadenceForTier("growth");
    expect(g.stages.pre_interview_reminder?.hoursBefore).toBe(24);
    expect(g.stages.interview_day?.sendHour).toBe(9);
    expect(g.stages.assignment_deadline_24h?.hoursBefore).toBe(24);
  });
});

describe("cadenceTierEditability", () => {
  it("locks Free, unlocks stages+channels on Basic, timing from Growth", () => {
    expect(cadenceTierEditability("free")).toEqual({
      stages: false,
      channels: false,
      timing: false,
      maxChanges: 0,
    });
    expect(cadenceTierEditability("basic")).toEqual({
      stages: true,
      channels: true,
      timing: false,
      maxChanges: 1,
    });
    expect(cadenceTierEditability("growth").timing).toBe(true);
    expect(cadenceTierEditability("enterprise").timing).toBe(true);
  });
});

describe("clampCadence", () => {
  it("drops unknown stage keys and filters channels to the tier entitlement", () => {
    const c = clampCadence(
      {
        stages: { shortlist: { enabled: true, channels: ["email", "whatsapp"] } },
      } as CadenceConfig,
      "free",
    );
    expect(Object.keys(c.stages)).toEqual(["shortlist"]);
    expect(c.stages.shortlist?.channels).toEqual(["email"]);
  });

  it("clamps timing values to bounded integers", () => {
    const c = clampCadence(
      {
        stages: {
          pre_interview_reminder: { enabled: true, channels: ["email"], hoursBefore: 999 },
          interview_day: { enabled: true, channels: ["email"], sendHour: 25 },
        },
      },
      "growth",
    );
    expect(c.stages.pre_interview_reminder?.hoursBefore).toBe(168);
    expect(c.stages.interview_day?.sendHour).toBe(23);
  });

  it("drops hoursBefore on a tier without timing editability", () => {
    const c = clampCadence(
      {
        stages: {
          pre_interview_reminder: { enabled: true, channels: ["email"], hoursBefore: 48 },
        },
      },
      "basic",
    );
    expect(c.stages.pre_interview_reminder?.enabled).toBe(true);
    expect(c.stages.pre_interview_reminder?.hoursBefore).toBeUndefined();
  });

  it("drops sendHour on a stage without that knob", () => {
    const c = clampCadence(
      {
        stages: {
          assignment_deadline_24h: { enabled: true, channels: ["email"], sendHour: 12 },
        },
      },
      "growth",
    );
    expect(c.stages.assignment_deadline_24h?.enabled).toBe(true);
    expect(c.stages.assignment_deadline_24h?.sendHour).toBeUndefined();
  });
});

describe("cadenceConfigPayload", () => {
  it("returns an empty stages object when the config equals tier defaults", () => {
    const payload = cadenceConfigPayload(defaultCadenceForTier("basic"), "basic");
    expect(payload.stages).toEqual({});
  });

  it("keeps only stages that differ from the tier default", () => {
    const payload = cadenceConfigPayload(
      { stages: { reminder_day3: { enabled: false } } } as CadenceConfig,
      "basic",
    );
    expect(Object.keys(payload.stages)).toEqual(["reminder_day3"]);
    expect(payload.stages.reminder_day3).toEqual({ enabled: false });
  });

  it("emits no stage entry when only a wrong-knob timing value differs", () => {
    const payload = cadenceConfigPayload(
      {
        stages: {
          assignment_deadline_24h: {
            enabled: true,
            channels: ["email", "whatsapp"],
            sendHour: 12,
          },
        },
      } as CadenceConfig,
      "growth",
    );
    expect(payload.stages).toEqual({});
  });
});

describe("filterCadenceByDuration", () => {
  it("filters out Day 3 and Day 5 reminders when duration is 2 days", async () => {
    const { cadenceForTier, filterCadenceByDuration } = await import("./cadence");
    const rows = cadenceForTier("basic", "ai_interview");
    const filtered = filterCadenceByDuration(rows, 2);

    const keys = filtered.map((r) => r.stage.key);
    expect(keys).toContain("shortlist"); // Day 0
    expect(keys).toContain("reminder_day1"); // Day 1
    expect(keys).not.toContain("reminder_day3"); // Day 3 excluded
    expect(keys).not.toContain("reminder_day5"); // Day 5 excluded
  });

  it("filters out Day 5 reminder when duration is 4 days", async () => {
    const { cadenceForTier, filterCadenceByDuration } = await import("./cadence");
    const rows = cadenceForTier("basic", "ai_interview");
    const filtered = filterCadenceByDuration(rows, 4);

    const keys = filtered.map((r) => r.stage.key);
    expect(keys).toContain("shortlist");
    expect(keys).toContain("reminder_day1");
    expect(keys).toContain("reminder_day3");
    expect(keys).not.toContain("reminder_day5");
  });

  it("keeps all default reminders when duration is 6 days or more", async () => {
    const { cadenceForTier, filterCadenceByDuration } = await import("./cadence");
    const rows = cadenceForTier("basic", "ai_interview");
    const filtered = filterCadenceByDuration(rows, 7);

    const keys = filtered.map((r) => r.stage.key);
    expect(keys).toContain("shortlist");
    expect(keys).toContain("reminder_day1");
    expect(keys).toContain("reminder_day3");
    expect(keys).toContain("reminder_day5");
  });

  it("returns original rows unchanged if duration is null or undefined", async () => {
    const { cadenceForTier, filterCadenceByDuration } = await import("./cadence");
    const rows = cadenceForTier("basic", "ai_interview");
    expect(filterCadenceByDuration(rows, null)).toEqual(rows);
    expect(filterCadenceByDuration(rows, undefined)).toEqual(rows);
  });
});
