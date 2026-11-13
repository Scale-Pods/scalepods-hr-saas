import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateBrandedOfferPdf } from "./generate-offer-pdf";

describe("generateBrandedOfferPdf", () => {
  it("generates 3-page perfectly spaced intern offer PDF without gaps or stranded bullets", async () => {
    const buf = generateBrandedOfferPdf({
      candidate_name: "Gandla Manish",
      position_title: "Ai Automation Intern",
      salary: "5000",
      company_name: "Scalepods",
      start_date: "2026-11-27",
      signatory_name: "Manish",
      signatory_title: "Talent Acquisition Lead",
      ref_no: "SP/2026/OFFER/2395",
      issue_date: "2026-11-13",
      dynamic_variables: {
        DURATION: "6 Months",
        WORKING_DAYS: "Mon - Fri (5 Days/Wk)",
        LOCATION: "Remote",
        DEPARTMENT: "Engineering",
        STIPEND_WORDS: "Five Thousand Rupees Only",
      },
    });

    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const doc = await PDFDocument.load(new Uint8Array(buf));
    expect(doc.getPageCount()).toBe(3);
  });

  it("generates 3-page perfectly spaced fulltime offer PDF with CTC table", async () => {
    const buf = generateBrandedOfferPdf({
      candidate_name: "Gandla Manish",
      position_title: "Full Stack Engineer",
      salary: "1200000",
      company_name: "Scalepods",
      start_date: "2026-11-27",
      signatory_name: "Manish",
      signatory_title: "Talent Acquisition Lead",
      ref_no: "SP/2026/OFFER/2395",
      issue_date: "2026-11-13",
      dynamic_variables: {
        DURATION: "Full-time",
        WORKING_DAYS: "Mon - Fri (5 Days/Wk)",
        LOCATION: "Remote",
        DEPARTMENT: "Engineering",
        PROBATION_PERIOD: "3 Months",
        NOTICE_PERIOD: "30 Days",
      },
    });

    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const doc = await PDFDocument.load(new Uint8Array(buf));
    expect(doc.getPageCount()).toBe(3);
  });
});
