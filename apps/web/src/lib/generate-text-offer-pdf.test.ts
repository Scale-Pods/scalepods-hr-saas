import { describe, expect, it } from "vitest";
import {
  generateStyledOfferPdf,
  getDefaultLetterheadBuffer,
  numberToWords,
} from "./generate-styled-offer-pdf";
import { generateTextOfferPdf } from "./generate-text-offer-pdf";

describe("generateStyledOfferPdf", () => {
  it("generates a valid single-page branded PDF buffer from rendered offer text", () => {
    const buf = generateStyledOfferPdf(
      "OFFER OF EMPLOYMENT\n\n| Ref: SP/2026/01 | Date: Nov 17, 2026 |\n\nDear Manish Sharma,\n\nWe are pleased to offer you AI Automation Intern.",
      { companyName: "ScalePods Partner" },
    );
    const ascii = buf.toString("latin1");
    expect(ascii.startsWith("%PDF-1.4")).toBe(true);
    expect(ascii.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(ascii).toContain("ScalePods Partner");
    expect(ascii).toContain("Dear Manish Sharma,");
    expect(ascii).toContain("CONFIDENTIAL EMPLOYMENT AGREEMENT");
    expect(ascii).toContain("Page 1 of 1");
  });

  it("renders structured compensation tables into vector table elements", () => {
    const tableText = `APPOINTMENT LETTER
| # | Component | Monthly (INR) | Annual (INR) |
| 1 | Basic Salary | 10,000 | 1,20,000 |
| Total CTC | 10,000 | 1,20,000 |`;

    const buf = generateStyledOfferPdf(tableText);
    const ascii = buf.toString("latin1");
    expect(ascii).toContain("Component");
    expect(ascii).toContain("Basic Salary");
    expect(ascii).toContain("Total CTC");
  });

  it("does not render '?' for bullets, dashes, or footers", () => {
    const sample = `INTERNSHIP APPOINTMENT LETTER
TERMS OF ENGAGEMENT
1. Role & Scope
• Designation: Software Engineer - Platform
• Working Days: Mon - Fri
Monthly Stipend: INR 5000 /- (0)

For ScalePods
Manish
Talent Acquisition Lead
Signature: ______________________     Date: _______________

ACKNOWLEDGEMENT
I, Manish Gandla, accept this offer
| Signature: __________________ | Date: __________________ | Place: __________________ |`;

    const buf = generateStyledOfferPdf(sample);
    const ascii = buf.toString("latin1");

    // Must not contain any "?" representing glitched characters
    expect(ascii).not.toContain("? Designation");
    expect(ascii).not.toContain("? Working Days");
    expect(ascii).not.toContain("Confidential ? ScalePods");
    expect(ascii).toContain("Five Thousand Rupees Only"); // Auto-fixed (0)!
    expect(ascii).toContain("Signature: __________________");
    expect(ascii).toContain("Place: __________________");
  });

  it("converts numbers to Indian words accurately", () => {
    expect(numberToWords(5000)).toBe("Five Thousand Rupees Only");
    expect(numberToWords(10000)).toBe("Ten Thousand Rupees Only");
    expect(numberToWords(192000)).toBe("One Lakh Ninety Two Thousand Rupees Only");
    expect(numberToWords(1800000)).toBe("Eighteen Lakh Rupees Only");
  });

  it("generates styled PDF with embedded letterhead background image", () => {
    const letterhead = getDefaultLetterheadBuffer();
    expect(letterhead).toBeInstanceOf(Buffer);
    expect(letterhead.length).toBeGreaterThan(1000);

    const buf = generateStyledOfferPdf(
      "| Ref: SP/2026/01 | Date: Nov 17, 2026 |\n| Dear Manish, | Starting Date: Nov 20, 2026 |\n\nINTERNSHIP APPOINTMENT LETTER\n\n• Term 1: Confidentiality agreement.",
      { backgroundImageBuffer: letterhead },
    );
    const ascii = buf.toString("latin1");
    expect(ascii).toContain("/BgImg");
    expect(ascii).toContain("/XObject");
    expect(ascii).toContain("Ref: SP/2026/01");
    expect(ascii).toContain("INTERNSHIP APPOINTMENT LETTER");
  });

  it("paginates long multi-line letters across multiple pages with page numbers", () => {
    const longBody = Array.from(
      { length: 120 },
      (_, i) =>
        `Clause ${i + 1}: Standard employment term with detailed company policy instructions.`,
    ).join("\n\n");
    const buf = generateTextOfferPdf(longBody);
    const ascii = buf.toString("latin1");
    expect(ascii).toMatch(/\/Count [2-9]/);
    expect(ascii).toContain("Page 1 of ");
  });

  it("embeds signature image and renders it on page without duplicate verification text", () => {
    const letterhead = getDefaultLetterheadBuffer();
    const sigBase64 = `data:image/jpeg;base64,${letterhead.toString("base64")}`;
    const buf = generateStyledOfferPdf(
      "For ScalePods\nAqib\nTalent Acquisition Lead\nSignature: ______________________     Date: _______________\nACKNOWLEDGEMENT\nI, Aqib, accept\n| Signature: ___ | Date: ___ | Place: ___ |",
      { signatureBase64: sigBase64, backgroundImageBuffer: letterhead },
    );
    const ascii = buf.toString("latin1");
    expect(ascii).toContain("/SigImg");
    expect(ascii).toContain("/SigImg Do");
    // Ensure redundant "Digitally Verified" is suppressed when real signature graphic is embedded
    expect(ascii).not.toContain("Digitally Verified");
    // Ensure signature line is rendered only once for candidate acceptance
    const sigMatches = ascii.match(/Signature:\s*_{3,}/g) || [];
    expect(sigMatches.length).toBe(1);
  });
});
