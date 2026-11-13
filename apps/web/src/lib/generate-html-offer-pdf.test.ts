import { readFileSync } from "node:fs";
import mammoth from "mammoth";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateHtmlOfferPdf } from "./generate-html-offer-pdf";
import { cleanOfferTemplateDirectives, renderOfferTemplateText } from "./offer-template-utils";

describe("generateHtmlOfferPdf", () => {
  it("renders headings, bold paragraphs, lists, and tables into a valid A4 PDF", async () => {
    const html = `
      <h1>APPOINTMENT LETTER</h1>
      <p>Dear <strong>Manish Sharma</strong>, welcome to <strong>ScalePods</strong>.</p>
      <ul>
        <li>Role: AI Automation Intern</li>
        <li>Location: Remote</li>
      </ul>
      <table>
        <tr><th>Component</th><th>Monthly</th><th>Annual</th></tr>
        <tr><td>Basic Salary</td><td>25,000</td><td>3,00,000</td></tr>
      </table>
    `;

    const buf = await generateHtmlOfferPdf(html, "ScalePods Technologies");
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const doc = await PDFDocument.load(new Uint8Array(buf));
    expect(doc.getPageCount()).toBe(1);
  });

  it("correctly converts docx-extracted html into multi-page branded offer letter", async () => {
    const docxPath =
      "C:/Users/manis/.gemini/antigravity/brain/8ddcbbec-3188-4304-8770-e31274d74bc0/.user_uploaded/media_1794564558689_a321da54.docx";
    const buffer = readFileSync(docxPath);
    const { value: rawHtml } = await mammoth.convertToHtml({ buffer });

    // Intern test
    const cleanedIntern = cleanOfferTemplateDirectives(rawHtml, {
      letterType: "intern",
      isIntern: true,
    });
    const renderedIntern = renderOfferTemplateText(cleanedIntern, {
      CANDIDATE_NAME: "Aqib Firdous Khan",
      ROLE: "AI Automation Intern",
      COMPANY_NAME: "ScalePods Technologies",
      JOINING_DATE: "November 9, 2026",
      DURATION: "6 Months",
      DEPARTMENT: "Engineering",
      LOCATION: "Remote",
      WORKING_DAYS: "Mon - Fri",
      STIPEND_AMOUNT: "10,000",
      STIPEND_WORDS: "Ten Thousand",
      SIGNATORY_NAME: "Manish Sharma",
      SIGNATORY_TITLE: "Head of Talent Acquisition",
      REF_NO: "SP/2026/OFFER/1234",
      ISSUE_DATE: "November 1, 2026",
    });

    const bufIntern = await generateHtmlOfferPdf(renderedIntern, "ScalePods Technologies");
    const docIntern = await PDFDocument.load(new Uint8Array(bufIntern));
    console.log("Intern PDF page count:", docIntern.getPageCount());
    expect(docIntern.getPageCount()).toBeGreaterThanOrEqual(2);

    // Fulltime test
    const cleanedFulltime = cleanOfferTemplateDirectives(rawHtml, {
      letterType: "fulltime",
      isIntern: false,
    });
    const renderedFulltime = renderOfferTemplateText(cleanedFulltime, {
      CANDIDATE_NAME: "Aqib Firdous Khan",
      ROLE: "Full Stack Engineer",
      COMPANY_NAME: "ScalePods Technologies",
      JOINING_DATE: "November 9, 2026",
      DEPARTMENT: "Engineering",
      LOCATION: "Remote",
      WORKING_DAYS: "Mon - Fri",
      GROSS_ANNUAL: "12,00,000",
      GROSS_ANNUAL_WORDS: "Twelve Lakhs",
      GROSS_MONTHLY: "1,00,000",
      BASIC_SALARY: "50,000",
      BASIC_SALARY_ANNUAL: "6,00,000",
      HRA: "25,000",
      HRA_ANNUAL: "3,00,000",
      SPECIAL_ALLOWANCE: "25,000",
      SPECIAL_ALLOWANCE_ANNUAL: "3,00,000",
      NOTICE_PERIOD: "30 Days",
      PROBATION_PERIOD: "3 Months",
      SIGNATORY_NAME: "Manish Sharma",
      SIGNATORY_TITLE: "Head of Talent Acquisition",
      REF_NO: "SP/2026/OFFER/1234",
      ISSUE_DATE: "November 1, 2026",
    });

    const bufFulltime = await generateHtmlOfferPdf(renderedFulltime, "ScalePods Technologies");
    const docFulltime = await PDFDocument.load(new Uint8Array(bufFulltime));
    console.log("Fulltime PDF page count:", docFulltime.getPageCount());
    expect(docFulltime.getPageCount()).toBe(3);
  });
});
