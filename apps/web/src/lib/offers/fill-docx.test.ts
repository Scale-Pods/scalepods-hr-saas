import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { detectPlaceholders } from "./detect-placeholders";
import { fillOfferDocx, OfferDocxError } from "./fill-docx";

const sampleDocxPath = path.resolve(
  __dirname,
  "../../../../../apps/web/node_modules/mammoth/test/test-data/single-paragraph.docx",
);

function createSampleDocx(bodyXml: string, headerXml?: string): Buffer {
  const content = fs.readFileSync(sampleDocxPath);
  const zip = new PizZip(content);

  let docXml = zip.files["word/document.xml"].asText();
  docXml = docXml.replace(/<w:t>.*?<\/w:t>/, `<w:t>${bodyXml}</w:t>`);
  zip.file("word/document.xml", docXml);

  if (headerXml) {
    zip.file(
      "word/header1.xml",
      `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${headerXml}</w:t></w:r></w:p></w:hdr>`,
    );
  }

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

describe("fillOfferDocx", () => {
  it("successfully fills normal placeholders without modifying layout", () => {
    const template = createSampleDocx(
      "Dear {{candidate_name}}, Welcome to {{company_name}} as {{role}}.",
    );
    const filled = fillOfferDocx(template, {
      candidate_name: "Rahul Sharma",
      company_name: "Acme Corp",
      role: "Lead Engineer",
    });

    expect(filled).toBeInstanceOf(Buffer);
    expect(filled.length).toBeGreaterThan(0);

    const filledZip = new PizZip(filled);
    const resultXml = filledZip.files["word/document.xml"].asText();
    expect(resultXml).toContain("Rahul Sharma");
    expect(resultXml).toContain("Acme Corp");
    expect(resultXml).toContain("Lead Engineer");
  });

  it("raises clear, user-readable error for missing tags", () => {
    const template = createSampleDocx("Offer for {{candidate_name}} with CTC {{ctc_amount}}.");
    expect(() => {
      fillOfferDocx(template, {
        candidate_name: "Rahul Sharma",
        // ctc_amount is intentionally missing
      });
    }).toThrowError(/Missing value for placeholder: \{\{ctc_amount\}\}/i);
  });

  it("raises clear error on malformed or unclosed tags", () => {
    const template = createSampleDocx("Hello {{candidate_name, welcome to {{company_name}}.");
    expect(() => {
      fillOfferDocx(template, {
        candidate_name: "Rahul Sharma",
        company_name: "Acme Corp",
      });
    }).toThrowError(OfferDocxError);

    try {
      fillOfferDocx(template, {
        candidate_name: "Rahul Sharma",
        company_name: "Acme Corp",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(OfferDocxError);
      expect((err as OfferDocxError).message).toMatch(/unclosed/i);
    }
  });

  it("matches case-insensitively (e.g. CANDIDATE_NAME vs candidate_name)", () => {
    const template = createSampleDocx(
      "Dear {{CANDIDATE_NAME}}, your start date is {{START_DATE}}.",
    );
    const filled = fillOfferDocx(template, {
      candidate_name: "Rahul Sharma",
      start_date: "2026-12-01",
    });

    const filledZip = new PizZip(filled);
    const resultXml = filledZip.files["word/document.xml"].asText();
    expect(resultXml).toContain("Rahul Sharma");
    expect(resultXml).toContain("2026-12-01");
  });
});

describe("detectPlaceholders", () => {
  it("detects unique placeholders across body and headers", () => {
    const template = createSampleDocx(
      "Offer for {{candidate_name}} as {{role}}. Report to {{manager_name}}.",
      "Company: {{company_name}}",
    );

    const placeholders = detectPlaceholders(template);
    expect(placeholders).toContain("candidate_name");
    expect(placeholders).toContain("role");
    expect(placeholders).toContain("manager_name");
    expect(placeholders).toContain("company_name");
  });

  it("strictly excludes section tags (#, ^, /)", () => {
    const template = createSampleDocx(
      "Dear {{candidate_name}}, {{#has_bonus}}Bonus: {{bonus_amount}}{{/has_bonus}} {{^no_equity}}Equity: {{shares}}{{/no_equity}}",
    );

    const placeholders = detectPlaceholders(template);
    expect(placeholders).toContain("candidate_name");
    expect(placeholders).toContain("bonus_amount");
    expect(placeholders).toContain("shares");

    // Section tags must NOT be present
    expect(placeholders).not.toContain("has_bonus");
    expect(placeholders).not.toContain("#has_bonus");
    expect(placeholders).not.toContain("/has_bonus");
    expect(placeholders).not.toContain("no_equity");
    expect(placeholders).not.toContain("^no_equity");
  });
});
