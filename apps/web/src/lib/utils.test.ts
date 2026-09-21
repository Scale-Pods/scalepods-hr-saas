import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges conflicting Tailwind classes, keeping the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("returns the empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("deduplicates identical classes", () => {
    expect(cn("px-4", "px-4")).toBe("px-4");
  });
});
