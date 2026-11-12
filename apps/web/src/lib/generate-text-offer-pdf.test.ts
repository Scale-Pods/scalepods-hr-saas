import { describe, expect, it } from "vitest";
import { generateTextOfferPdf } from "./generate-text-offer-pdf";

describe("generateTextOfferPdf", () => {
  it("generates a valid single-page PDF buffer from rendered offer text", () => {
    const buf = generateTextOfferPdf(
      "OFFER OF EMPLOYMENT\n\nDear Manish Sharma,\n\nWe are pleased to offer you AI Automation Intern.",
    );
    const ascii = buf.toString("latin1");
    expect(ascii.startsWith("%PDF-1.4")).toBe(true);
    expect(ascii.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(ascii).toContain("Dear Manish Sharma,");
    expect(ascii).toContain("1 0 0 1 72 ");
  });

  it("paginates long multi-line letters across multiple pages", () => {
    const longBody = Array.from(
      { length: 120 },
      (_, i) => `Clause ${i + 1}: Standard employment term.`,
    ).join("\n");
    const buf = generateTextOfferPdf(longBody);
    const ascii = buf.toString("latin1");
    expect(ascii).toContain("/Count 3");
  });
});
