import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { fillOfferDocx } from "./fill-docx";
import {
  applyTextReplacementsToDocx,
  findTextMatchesInDocx,
  normalizeFieldName,
} from "./make-reusable";

const sampleDocxPath = path.resolve(
  __dirname,
  "../../../../../apps/web/node_modules/mammoth/test/test-data/single-paragraph.docx",
);

function createDocxWithCustomXml(documentBodyXml: string, headerXml?: string): Buffer {
  const content = fs.readFileSync(sampleDocxPath);
  const zip = new PizZip(content);

  let docXml = zip.files["word/document.xml"].asText();
  // Replace the first <w:p>...</w:p> with our custom paragraphs
  docXml = docXml.replace(/<w:p(?:\s+[^>]*)?>[\s\S]*?<\/w:p>/, documentBodyXml);
  zip.file("word/document.xml", docXml);

  if (headerXml) {
    zip.file(
      "word/header1.xml",
      `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${headerXml}</w:hdr>`,
    );

    // Register relationship so docxtemplater discovers the header
    const relsPath = "word/_rels/document.xml.rels";
    if (zip.files[relsPath]) {
      let relsXml = zip.files[relsPath].asText();
      if (!relsXml.includes("header1.xml")) {
        relsXml = relsXml.replace(
          "</Relationships>",
          '<Relationship Id="rId999" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>',
        );
        zip.file(relsPath, relsXml);
      }
    }
  }

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

describe("make-reusable run-splitting replacement", () => {
  it("normalizes field names to lowercase_with_underscores", () => {
    expect(normalizeFieldName("Candidate Name")).toBe("candidate_name");
    expect(normalizeFieldName("JOINING DATE")).toBe("joining_date");
    expect(normalizeFieldName("Annual CTC (INR)")).toBe("annual_ctc_inr");
  });

  it("handles 'Rahul Sharma' split across multiple <w:r> runs in a paragraph", () => {
    // Construct paragraph where "Rahul Sharma" is broken across 3 runs
    const multiRunParagraph = `
      <w:p>
        <w:r><w:t>Dear </w:t></w:r>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Rah</w:t></w:r>
        <w:r><w:rPr><w:b/></w:rPr><w:t>ul </w:t></w:r>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Sharma</w:t></w:r>
        <w:r><w:t>, we are pleased to offer you the position.</w:t></w:r>
      </w:p>
    `;

    const originalDocx = createDocxWithCustomXml(multiRunParagraph);

    // 1. Find matches for "Rahul Sharma"
    const matches = findTextMatchesInDocx(originalDocx, ["Rahul Sharma"]);
    expect(matches["Rahul Sharma"].length).toBe(1);

    const match = matches["Rahul Sharma"][0];
    expect(match.contextSnippet).toContain("Dear Rahul Sharma");

    // 2. Replace match with "candidate_name"
    const replacedDocx = applyTextReplacementsToDocx(
      originalDocx,
      [{ matchId: match.id, fieldName: "candidate_name" }],
      matches,
    );

    const zip = new PizZip(replacedDocx);
    const xml = zip.files["word/document.xml"].asText();

    // Verify tag insertion and bold styling retention
    expect(xml).toContain("{{candidate_name}}");
    expect(xml).not.toContain("Rahul Sharma");
    expect(xml).toContain("<w:b/>"); // Bold tag preserved

    // 3. Verify it passes fillOfferDocx
    const filledDocx = fillOfferDocx(replacedDocx, {
      candidate_name: "Amit Patel",
    });
    const filledZip = new PizZip(filledDocx);
    const filledXml = filledZip.files["word/document.xml"].asText();
    expect(filledXml).toContain("Amit Patel");
    expect(filledXml).toContain("we are pleased to offer you the position");
  });

  it("replaces exact matches across body, header, and signature independently", () => {
    const bodyXml = `
      <w:p>
        <w:r><w:t>Candidate: </w:t></w:r>
        <w:r><w:t>Rahul Sharma</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:t>Signed by Candidate: </w:t></w:r>
        <w:r><w:t>Rahul Sharma</w:t></w:r>
      </w:p>
    `;

    const headerXml = `
      <w:p>
        <w:r><w:t>Offer Document for Rahul Sharma</w:t></w:r>
      </w:p>
    `;

    const originalDocx = createDocxWithCustomXml(bodyXml, headerXml);

    // Find matches
    const matches = findTextMatchesInDocx(originalDocx, ["Rahul Sharma"]);
    expect(matches["Rahul Sharma"].length).toBe(3);

    // Replace all 3 matches with candidate_name
    const instructions = matches["Rahul Sharma"].map((m) => ({
      matchId: m.id,
      fieldName: "candidate_name",
    }));

    const replacedDocx = applyTextReplacementsToDocx(originalDocx, instructions, matches);

    const zip = new PizZip(replacedDocx);
    const docXml = zip.files["word/document.xml"].asText();
    const hdrXml = zip.files["word/header1.xml"].asText();

    expect(docXml).toContain("{{candidate_name}}");
    expect(docXml).not.toContain("Rahul Sharma");
    expect(hdrXml).toContain("{{candidate_name}}");
    expect(hdrXml).not.toContain("Rahul Sharma");

    // Dry-run fill
    const filled = fillOfferDocx(replacedDocx, { candidate_name: "Priya Nair" });
    const filledZip = new PizZip(filled);
    expect(filledZip.files["word/document.xml"].asText()).toContain("Priya Nair");
    expect(filledZip.files["word/header1.xml"].asText()).toContain("Priya Nair");
  });

  it("honors unchecked matches, replacing only selected occurrences", () => {
    const bodyXml = `
      <w:p>
        <w:r><w:t>Candidate: Rahul Sharma</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:t>CEO: Rahul Sharma</w:t></w:r>
      </w:p>
    `;

    const originalDocx = createDocxWithCustomXml(bodyXml);
    const matches = findTextMatchesInDocx(originalDocx, ["Rahul Sharma"]);
    expect(matches["Rahul Sharma"].length).toBe(2);

    // User only selects match 0 (Candidate), leaving match 1 (CEO) un-replaced
    const instructions = [
      {
        matchId: matches["Rahul Sharma"][0].id,
        fieldName: "candidate_name",
      },
    ];

    const replacedDocx = applyTextReplacementsToDocx(originalDocx, instructions, matches);

    const zip = new PizZip(replacedDocx);
    const docXml = zip.files["word/document.xml"].asText();

    expect(docXml).toContain("Candidate: {{candidate_name}}");
    expect(docXml).toContain("CEO: Rahul Sharma"); // Remains untouched
  });
});
