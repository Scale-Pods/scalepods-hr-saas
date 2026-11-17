import fs from "node:fs";
import path from "node:path";
import * as fflate from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterAndValidateSuggestions, suggestFieldsWithAnthropic } from "./suggest-fields";

const sampleDocxPath = path.resolve(
  __dirname,
  "../../../../../apps/web/node_modules/mammoth/test/test-data/single-paragraph.docx",
);

function createDocx(text: string): Buffer {
  const content = fs.readFileSync(sampleDocxPath);
  const unzipped = fflate.unzipSync(new Uint8Array(content));
  let docXml = fflate.strFromU8(unzipped["word/document.xml"]);
  docXml = docXml.replace(/<w:t>.*?<\/w:t>/, `<w:t>${text}</w:t>`);
  unzipped["word/document.xml"] = fflate.strToU8(docXml);
  const zipped = fflate.zipSync(unzipped);
  return Buffer.from(zipped);
}

describe("suggest-fields post-processing", () => {
  const documentText = `
    ScalePods Technologies Private Limited
    Ref: SP/2026/OFF-8912
    Date: 15 November 2026
    
    Dear Rahul Sharma,
    
    We are pleased to offer you the position of Senior Full Stack Engineer in the Platform Engineering department, reporting to Manish Gandla.
    Your annual CTC will be INR 18,00,000 (Eighteen Lakhs Rupees Only) starting on 01 December 2026.
    Notice period will be 60 days.
  `;

  it("retains valid suggestions that exist verbatim in the document and normalizes field names", () => {
    const rawSuggestions = [
      {
        text: "Rahul Sharma",
        suggested_field: "Candidate Name",
        reason: "Candidate recipient name",
      },
      {
        text: "Senior Full Stack Engineer",
        suggested_field: "ROLE_TITLE",
        reason: "Designation title",
      },
      {
        text: "INR 18,00,000",
        suggested_field: "annual_ctc",
        reason: "Compensation amount",
      },
    ];

    const results = filterAndValidateSuggestions(rawSuggestions, documentText);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      text: "Rahul Sharma",
      suggested_field: "candidate_name",
      reason: "Candidate recipient name",
    });
    expect(results[1]).toEqual({
      text: "Senior Full Stack Engineer",
      suggested_field: "role_title",
      reason: "Designation title",
    });
    expect(results[2]).toEqual({
      text: "INR 18,00,000",
      suggested_field: "annual_ctc",
      reason: "Compensation amount",
    });
  });

  it("strictly drops suggestions whose text does not appear verbatim in the document", () => {
    const rawSuggestions = [
      {
        text: "Rahul Sharma",
        suggested_field: "candidate_name",
        reason: "Valid",
      },
      {
        text: "John Doe", // Hallucinated
        suggested_field: "candidate_name",
        reason: "Not in document",
      },
      {
        text: "USD 120,000", // Non-existent amount
        suggested_field: "salary",
        reason: "Not in document",
      },
    ];

    const results = filterAndValidateSuggestions(rawSuggestions, documentText);

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("Rahul Sharma");
  });

  it("deduplicates suggestions on identical target text", () => {
    const rawSuggestions = [
      {
        text: "Rahul Sharma",
        suggested_field: "candidate_name",
        reason: "First match",
      },
      {
        text: "Rahul Sharma",
        suggested_field: "recipient_name",
        reason: "Duplicate target",
      },
    ];

    const results = filterAndValidateSuggestions(rawSuggestions, documentText);

    expect(results).toHaveLength(1);
    expect(results[0].suggested_field).toBe("candidate_name");
  });

  it("drops malformed items missing text or suggested_field", () => {
    const rawSuggestions = [
      { text: "", suggested_field: "empty_text" },
      { text: "Rahul Sharma" }, // missing suggested_field
      { suggested_field: "candidate_name" }, // missing text
      null,
      "invalid string item",
      { text: "15 November 2026", suggested_field: "issue_date" },
    ];

    const results = filterAndValidateSuggestions(rawSuggestions, documentText);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      text: "15 November 2026",
      suggested_field: "issue_date",
      reason: "Detected dynamic offer field",
    });
  });
});

describe("suggestFieldsWithAnthropic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes Anthropic API and parses + validates suggestions with mocked response", async () => {
    const docx = createDocx(
      "Welcome Rahul Sharma to Acme as Software Engineer with salary INR 12,00,000.",
    );

    const mockAiResponse = {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            suggestions: [
              {
                text: "Rahul Sharma",
                suggested_field: "candidate_name",
                reason: "Candidate Name",
              },
              {
                text: "Software Engineer",
                suggested_field: "role",
                reason: "Job title",
              },
              {
                text: "Fake Person", // Must be dropped
                suggested_field: "manager_name",
                reason: "Hallucinated",
              },
            ],
          }),
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockAiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const suggestions = await suggestFieldsWithAnthropic(docx, {
      apiKey: "test-anthropic-key",
      model: "claude-3-5-sonnet-20241022",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-anthropic-key",
        }),
      }),
    );

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].text).toBe("Rahul Sharma");
    expect(suggestions[1].text).toBe("Software Engineer");
  });
});
