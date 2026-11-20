import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  generateStyledOfferPdf,
  getDefaultLetterheadBuffer,
  numberToWords,
} from "./generate-styled-offer-pdf";
import { generateTextOfferPdf } from "./generate-text-offer-pdf";
import { extractDocumentLogoInfoFromDocxBuffer } from "./offers/prune-docx-xml";

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

  it("faithfully preserves custom company template paragraphs without swallowing terms or cutting off text", () => {
    const customLetterText = `Working with Ziegler Aerospace is an opportunity, not an obligation. Being part of this journey is earned every day by every team member.

REF: SP/2026/OFFER/7613    Date: November 18, 2026
Dear Aqib Firdous Khan,
Congratulations and Welcome to Ziegler Family!!
Sub: Letter of Intent- AI Engineer (Internship) "Engineering" Dept at Ziegler Bangalore.

On behalf of Ziegler, we are pleased to extend this Letter of Intent (LOI) for the position of AI Engineer, effective from December 02, 2026, upon successful completion of your training at Ziegler Bangalore Office.

The following outlines the terms of the agreement:
Term of this agreement is a period of 2 Weeks, starting from your date of joining i.e. December 02, 2026 until the end of the specified period. During this tenure, you will undergo a training process in our organization. Upon satisfactory completion of the training, a formal offer for a 3 Months internship may be extended. Your training may be extended by up to 6 Months, should your performance require further improvements. The criteria for extension will be communicated to you, and you will be given feedback and support to meet these criteria.

As this training is intended to provide valuable industrial insights and knowledge, no monetary compensation will be provided for this training period.

A high attendance percentage (minimum 95%) is mandatory throughout the training period to ensure comprehensive learning and readiness for potential future roles within the company.

The company reserves the right to offer an internship position upon satisfactory performance during training. The offer of internship will also be subjected to production of necessary documents, including educational and professional certificates. Failure to provide these documents may result in the rescission of the internship offer.

It shall not be obligatory on the part of the Company to Extend Internship (or) offer a permanent position to you on expiry of this Agreement. This Extension Internship (or) offer of Employment will be subject to the satisfactory performance during Internship and subject to production of necessary documents including educational and professional certificates and may be rescinded in the event such necessary documents are not provided to the Company.

Sincerely / Acceptance
Signature:
Full Name: Aqib Firdous Khan
Date: 18-11-2026
Authorized Signatory For Ziegler Aerospace Private Limited`;

    const buf = generateStyledOfferPdf(customLetterText, {
      companyName: "Ziegler Aerospace",
      isDefaultTemplate: false,
    });
    const ascii = buf.toString("latin1");

    // All terms and legal clauses must be 100% preserved
    expect(ascii).toContain("Ziegler Aerospace");
    expect(ascii).toContain("no monetary compensation will be");
    expect(ascii).toContain("provided for this training period");
    expect(ascii).toContain("minimum 95%");
    expect(ascii).toContain("satisfactory performance during training");
    expect(ascii).toContain("It shall not be obligatory");
    expect(ascii).toContain("Sincerely / Acceptance");
    expect(ascii).toContain("Authorized Signatory For Ziegler Aerospace");

    // Must NOT contain synthetic ScalePods acknowledgement
    expect(ascii).not.toContain("accept the above terms and agree to work with");

    // Footer must NOT contain recruiter personal email
    expect(ascii).not.toContain("manish@scalepods.tech");
    expect(ascii).toContain("Private & Confidential - Ziegler Aerospace");
  });

  it("faithfully embeds custom company logo image and formats 2-column signature block", () => {
    const textWithCols = `REF: SP/2026/01    Date: Nov 18, 2026
Dear Aqib Firdous Khan,
We are pleased to offer you AI Automation Engineer.

[SIGNATURE_COLUMNS]
LEFT: Sincerely / Acceptance Signature: Full Name: Aqib Firdous Khan Date: 18-11-2026
RIGHT: Manish Authorized Signatory For Ziegler Talent Acquisition Lead "CC:" Engineering
[/SIGNATURE_COLUMNS]`;

    // 1x1 transparent PNG buffer
    const dummyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );

    const buf = generateStyledOfferPdf(textWithCols, {
      companyName: "Ziegler Aerospace",
      logoImage: {
        buffer: dummyPng,
        format: "png",
        width: 100,
        height: 50,
      },
    });

    const ascii = buf.toString("latin1");
    expect(ascii).toContain("/LogoImg");
    expect(ascii).toContain("/FlateDecode");
    expect(ascii).toContain("Sincerely / Acceptance");
    expect(ascii).toContain("Full Name: Aqib Firdous Khan");
    expect(ascii).toContain("Authorized Signatory For Ziegler");
    expect(ascii).toContain("Talent Acquisition Lead");
  });

  it("detects right logo alignment from docx template and renders logo at right margin", () => {
    const docxPath =
      "C:/Users/aqibf/.gemini/antigravity/brain/c1a33689-b2eb-4708-881b-dafa9e1830c3/.user_uploaded/media_1795000158153_0da472f6.docx";

    // 1. If user docx file exists, test native extraction of right-aligned logo
    if (fs.existsSync(docxPath)) {
      const docxBuf = fs.readFileSync(docxPath);
      const logoInfo = extractDocumentLogoInfoFromDocxBuffer(docxBuf);
      expect(logoInfo).not.toBeNull();
      expect(logoInfo?.format).toBe("png");
      expect(logoInfo?.alignment).toBe("right");

      const pdfBuf = generateStyledOfferPdf("OFFER LETTER\n\nDear Aqib Khan,", {
        companyName: "XYZ Company",
        logoImage: logoInfo,
        logoAlignment: logoInfo?.alignment,
      });
      const pdfAscii = pdfBuf.toString("latin1");
      expect(pdfAscii).toContain("/LogoImg");

      // Calculate expected right-aligned X coordinate: PAGE_W (595.28) - MARGIN_R (50) - logoW
      // Logo maxH is 46, aspect is width/height, logoW = logoH * aspect.
      // The Do command format: `q <logoW> 0 0 <logoH> <logoX> <logoY> cm /LogoImg Do Q`
      const match = pdfAscii.match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/LogoImg Do Q/);
      expect(match).not.toBeNull();
      const logoW = Number(match?.[1]);
      const logoX = Number(match?.[3]);
      const expectedRightX = 595.28 - 50 - logoW;
      expect(Math.abs(logoX - expectedRightX)).toBeLessThan(0.05);
      // Confirmed right-aligned (X > 350, not left margin 50.00)
      expect(logoX).toBeGreaterThan(350);
    }

    // 2. Test left vs right vs center alignment explicitly
    const dummyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );

    // Left aligned: logoX = MARGIN_L = 50.00
    const leftPdf = generateStyledOfferPdf("OFFER LETTER", {
      companyName: "Acme Left",
      logoImage: { buffer: dummyPng, format: "png", width: 100, height: 50 },
      logoAlignment: "left",
    }).toString("latin1");
    const leftMatch = leftPdf.match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/LogoImg Do Q/);
    expect(Number(leftMatch?.[3])).toBeCloseTo(50.0, 1);

    // Right aligned: logoX = PAGE_W (595.28) - MARGIN_R (50) - logoW (92) = 453.28
    const rightPdf = generateStyledOfferPdf("OFFER LETTER", {
      companyName: "Acme Right",
      logoImage: { buffer: dummyPng, format: "png", width: 100, height: 50 },
      logoAlignment: "right",
    }).toString("latin1");
    const rightMatch = rightPdf.match(
      /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/LogoImg Do Q/,
    );
    expect(Number(rightMatch?.[3])).toBeGreaterThan(400);

    // Center aligned: logoX = MARGIN_L (50) + (USABLE_W - logoW)/2
    const centerPdf = generateStyledOfferPdf("OFFER LETTER", {
      companyName: "Acme Center",
      logoImage: { buffer: dummyPng, format: "png", width: 100, height: 50 },
      logoAlignment: "center",
    }).toString("latin1");
    const centerMatch = centerPdf.match(
      /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/LogoImg Do Q/,
    );
    const centerW = Number(centerMatch?.[1]);
    const expectedCenterX = 50 + (495.28 - centerW) / 2;
    expect(Number(centerMatch?.[3])).toBeCloseTo(expectedCenterX, 1);
  });

  it("detects right logo alignment from docx template and renders logo at right margin", () => {
    const docxPath =
      "C:/Users/aqibf/.gemini/antigravity/brain/c1a33689-b2eb-4708-881b-dafa9e1830c3/.user_uploaded/media_1795000158153_0da472f6.docx";

    // 1. If user docx file exists, test native extraction of right-aligned logo
    if (fs.existsSync(docxPath)) {
      const docxBuf = fs.readFileSync(docxPath);
      const logoInfo = extractDocumentLogoInfoFromDocxBuffer(docxBuf);
      expect(logoInfo).not.toBeNull();
      expect(logoInfo?.format).toBe("png");
      expect(logoInfo?.alignment).toBe("right");

      const pdfBuf = generateStyledOfferPdf("OFFER LETTER\n\nDear Aqib Khan,", {
        companyName: "XYZ Company",
        logoImage: logoInfo,
        logoAlignment: logoInfo?.alignment,
      });
      const pdfAscii = pdfBuf.toString("latin1");
      expect(pdfAscii).toContain("/LogoImg");

      // Calculate expected right-aligned X coordinate: PAGE_W (595.28) - MARGIN_R (50) - logoW
      // Logo maxH is 46, aspect is width/height, logoW = logoH * aspect.
      // The Do command format: `q <logoW> 0 0 <logoH> <logoX> <logoY> cm /LogoImg Do Q`
      const match = pdfAscii.match(
        /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/LogoImg Do Q/,
      );
      expect(match).not.toBeNull();
      const logoW = Number(match?.[1]);
      const logoX = Number(match?.[3]);
      const expectedRightX = 595.28 - 50 - logoW;
      expect(Math.abs(logoX - expectedRightX)).toBeLessThan(0.05);
      // Confirmed right-aligned (X > 350, not left margin 50.00)
      expect(logoX).toBeGreaterThan(350);
    }

    // 2. Test left vs right vs center alignment explicitly
    const dummyPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );

    // Left aligned: logoX = MARGIN_L = 50.00
    const leftPdf = generateStyledOfferPdf("OFFER LETTER", {
      companyName: "Acme Left",
      logoImage: { buffer: dummyPng, format: "png", width: 100, height: 50 },
      logoAlignment: "left",
    }).toString("latin1");
    const leftMatch = leftPdf.match(
      /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/LogoImg Do Q/,
    );
    expect(Number(leftMatch?.[3])).toBeCloseTo(50.0, 1);

    // Right aligned: logoX = PAGE_W (595.28) - MARGIN_R (50) - logoW (92) = 453.28
    const rightPdf = generateStyledOfferPdf("OFFER LETTER", {
      companyName: "Acme Right",
      logoImage: { buffer: dummyPng, format: "png", width: 100, height: 50 },
      logoAlignment: "right",
    }).toString("latin1");
    const rightMatch = rightPdf.match(
      /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/LogoImg Do Q/,
    );
    expect(Number(rightMatch?.[3])).toBeGreaterThan(400);

    // Center aligned: logoX = MARGIN_L (50) + (USABLE_W - logoW)/2
    const centerPdf = generateStyledOfferPdf("OFFER LETTER", {
      companyName: "Acme Center",
      logoImage: { buffer: dummyPng, format: "png", width: 100, height: 50 },
      logoAlignment: "center",
    }).toString("latin1");
    const centerMatch = centerPdf.match(
      /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/LogoImg Do Q/,
    );
    const centerW = Number(centerMatch?.[1]);
    const expectedCenterX = 50 + (495.28 - centerW) / 2;
    expect(Number(centerMatch?.[3])).toBeCloseTo(expectedCenterX, 1);
  });
});
