import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateHtmlOfferPdf } from "./generate-html-offer-pdf";

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

    const buf = await generateHtmlOfferPdf(html);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const doc = await PDFDocument.load(new Uint8Array(buf));
    expect(doc.getPageCount()).toBe(1);
  });
});
