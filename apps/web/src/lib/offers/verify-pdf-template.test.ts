import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateStyledOfferPdf } from "../generate-styled-offer-pdf";

describe("Offer Letter Template & Styled PDF Integration", () => {
  it("extracts letterhead image and renders exact internship offer PDF without 'Full-time' duration or '(0)' stipend", async () => {
    // Check bundled scalepods-letterhead.jpg
    const assetPath = fs.existsSync(path.resolve(process.cwd(), "src/lib/offers/assets/scalepods-letterhead.jpg"))
      ? path.resolve(process.cwd(), "src/lib/offers/assets/scalepods-letterhead.jpg")
      : path.resolve(process.cwd(), "apps/web/src/lib/offers/assets/scalepods-letterhead.jpg");
    expect(fs.existsSync(assetPath)).toBe(true);
    const defaultBgBuf = fs.readFileSync(assetPath);
    expect(defaultBgBuf.length).toBeGreaterThan(50000);

    const renderedText = `Ref: SP/2026/OFFER/5908
Date: November 17, 2026
INTERNSHIP APPOINTMENT LETTER
Dear Manish Gandla,
Starting Date: 2026-12-01
We are pleased to offer you a 3 Months internship position with Scalepods in the capacity of Sales and Marketing intern, commencing from 2026-12-01.
TERMS OF ENGAGEMENT
1. Role & Scope
• Designation: Sales and Marketing intern | Department: Engineering | Mode: Remote
• Working Days: Mon - Fri (5 Days/Wk)
2. Compensation
• Monthly Stipend: INR 5000 /- (Five Thousand Rupees Only), paid between the 1st to 3rd of each month.
3. Internship Status
• This is a full-time internship engagement for a fixed duration of 3 Months.
4. Confidentiality & Non-Disclosure
You agree to maintain strict confidentiality.
5. Intellectual Property
All work shall be the sole intellectual property of Scalepods.
6. Code of Conduct
• You shall conduct yourself professionally.
7. Termination
Either party may terminate this internship with 15 days' prior written notice.
For Scalepods
Manish
Talent Acquisition Lead
Signature: ______________________     Date: _______________
ACKNOWLEDGEMENT
I, Manish Gandla, accept the above terms and agree to work with Scalepods as Sales and Marketing intern under the conditions stated herein.
| Signature: __________________ | Date: __________________ | Place: __________________ |`;

    const pdfBuf = generateStyledOfferPdf(renderedText, {
      companyName: "Scalepods",
      backgroundImageBuffer: defaultBgBuf,
      companyWebsite: "www.scalepods.com",
      companyEmail: "contact@scalepods.com",
    });

    const ascii = pdfBuf.toString("latin1");
    expect(ascii.startsWith("%PDF-1.4")).toBe(true);
    expect(ascii.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(ascii).toContain("/BgImg"); // Background letterhead image embedded
    expect(ascii).toContain("/DCTDecode"); // Native JPEG decode
    expect(ascii).toContain("3 Months");
    expect(ascii).not.toContain("a Full-time internship position");
    expect(ascii).not.toContain("fixed duration of Full-time");
    expect(ascii).not.toContain("(0)");
    expect(ascii).toContain("Five Thousand Rupees Only");
    expect(ascii).toContain("Scalepods   |   www.scalepods.com   |   contact@scalepods.com");
  });
});
