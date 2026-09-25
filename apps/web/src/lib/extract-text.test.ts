import { describe, expect, it } from "vitest";
import { reconstructPageText } from "./extract-text";

describe("reconstructPageText", () => {
  it("keeps same-baseline runs on one line and breaks on y change", () => {
    const items = [
      { str: "Aqib", transform: [1, 0, 0, 1, 0, 50] },
      { str: "Firdous", transform: [1, 0, 0, 1, 0, 50] },
      { str: "Khan", transform: [1, 0, 0, 1, 0, 50] },
      { str: "Full Stack Developer", transform: [1, 0, 0, 1, 0, 36] },
      { str: "aqibfirdous93@gmail.com", transform: [1, 0, 0, 1, 0, 36] },
      { str: "7780874496", transform: [1, 0, 0, 1, 0, 36] },
    ];
    expect(reconstructPageText(items)).toBe(
      "Aqib Firdous Khan\nFull Stack Developer aqibfirdous93@gmail.com 7780874496",
    );
  });

  it("does not insert a space at the very start", () => {
    const items = [{ str: "Only", transform: [1, 0, 0, 1, 0, 10] }];
    expect(reconstructPageText(items)).toBe("Only");
  });
});
