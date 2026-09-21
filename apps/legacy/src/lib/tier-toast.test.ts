import { describe, expect, it } from "vitest";
import { TierLimitError, N8nError, tierLimitToastContent, describeError, upgradeTarget } from "@scalepods/core";

describe("tier limit toast messaging", () => {
  it("composes a title from the reason when present", () => {
    const err = new TierLimitError("book-slot", "limit", "detail", "ai_interview");
    const { title } = tierLimitToastContent(err);
    expect(title).toContain("ai_interview");
    expect(title).toContain("Plan limit reached");
  });

  it("uses the detail as the message when available", () => {
    const err = new TierLimitError("book-slot", "limit", "Top up from Billing", "ai_interview");
    const { message } = tierLimitToastContent(err);
    expect(message).toBe("Top up from Billing");
  });

  it("builds a sensible default message when detail is missing", () => {
    const err = new TierLimitError("book-slot", "Plan limit reached", undefined, "ai_interview");
    const { message } = tierLimitToastContent(err);
    expect(message).toContain("Upgrade or top up");
  });

  it("routes tier errors through describeError and leaves generic errors alone", () => {
    const tier = describeError(new TierLimitError("x", "m", "d", "r"));
    expect(tier.title).toBeTruthy();
    const generic = describeError(new Error("plain"));
    expect(generic.title).toBe("Something went wrong");
    expect(generic.message).toBe("plain");
    expect(describeError("nonsense").message).toContain("unexpected");
    expect(describeError(new N8nError("n", { status: 500, path: "p" })).title).toBe("Something went wrong");
  });

  it("points the upgrade CTA at /billing", () => {
    expect(upgradeTarget()).toBe("/billing");
    expect(upgradeTarget("ai_interview")).toBe("/billing");
  });
});