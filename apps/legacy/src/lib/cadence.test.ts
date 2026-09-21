import { describe, expect, it } from "vitest";
import { cadenceForTier, voiceScreeningEnabledForTier } from "./cadence";

describe("cadence filtering by tier", () => {
  it("keeps email-only stages for the free tier", () => {
    const rows = cadenceForTier("free", "ai_interview");
    const shortlist = rows.find((r) => r.stage.key === "shortlist");
    expect(shortlist?.enabled).toBe(true);
    expect(shortlist?.channels).toEqual(["email"]);
  });

  it("drops WhatsApp and voice stages below their gates", () => {
    const free = cadenceForTier("free", "ai_interview");
    expect(free.find((r) => r.stage.key === "voice_screen")?.enabled).toBe(false);
    expect(voiceScreeningEnabledForTier("free")).toBe(false);

    const basic = cadenceForTier("basic", "ai_interview");
    expect(basic.find((r) => r.stage.key === "voice_screen")?.enabled).toBe(true);
    expect(basic.find((r) => r.stage.key === "shortlist")?.channels).toContain("whatsapp");
  });

  it("applies round-type-specific stages only to matching rounds", () => {
    const assignmentRows = cadenceForTier("growth", "assignment");
    expect(assignmentRows.find((r) => r.stage.key === "assignment_deadline_24h")?.enabled).toBe(true);

    const aiRows = cadenceForTier("growth", "ai_interview");
    expect(aiRows.find((r) => r.stage.key === "assignment_deadline_24h")?.enabled).toBe(false);
    expect(aiRows.find((r) => r.stage.key === "interview_day")?.enabled).toBe(true);
  });
});