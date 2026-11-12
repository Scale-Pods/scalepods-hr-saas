import { describe, expect, it } from "vitest";
import {
  buildPdfPatches,
  mergeWrappedPlaceholders,
  type PdfLineMetadata,
} from "./extract-pdf-patches";

describe("extract-pdf-patches", () => {
  it("merges 2-line and 3-line wrapped placeholders within their own columns", () => {
    const raw: PdfLineMetadata[] = [
      {
        key: "p1_l1",
        pageNumber: 1,
        x: 350,
        y: 500,
        width: 75,
        height: 11,
        fontSize: 10,
        originalText: "{{BASIC_SALARY}",
      },
      {
        key: "p1_l2",
        pageNumber: 1,
        x: 450,
        y: 500,
        width: 80,
        height: 11,
        fontSize: 10,
        originalText: "{{BASIC_SALARY_",
      },
      {
        key: "p1_l3",
        pageNumber: 1,
        x: 350,
        y: 488,
        width: 6,
        height: 11,
        fontSize: 10,
        originalText: "}",
      },
      {
        key: "p1_l4",
        pageNumber: 1,
        x: 450,
        y: 488,
        width: 50,
        height: 11,
        fontSize: 10,
        originalText: "ANNUAL}}",
      },
      {
        key: "p1_l5",
        pageNumber: 1,
        x: 450,
        y: 440,
        width: 75,
        height: 11,
        fontSize: 10,
        originalText: "{{SPECIAL_ALLO",
      },
      {
        key: "p1_l6",
        pageNumber: 1,
        x: 450,
        y: 428,
        width: 75,
        height: 11,
        fontSize: 10,
        originalText: "WANCE_ANNUAL}",
      },
      {
        key: "p1_l7",
        pageNumber: 1,
        x: 450,
        y: 416,
        width: 6,
        height: 11,
        fontSize: 10,
        originalText: "}",
      },
    ];

    const merged = mergeWrappedPlaceholders(raw);
    expect(merged.map((m) => m.originalText)).toEqual([
      "{{BASIC_SALARY}}",
      "{{BASIC_SALARY_ANNUAL}}",
      "{{SPECIAL_ALLOWANCE_ANNUAL}}",
    ]);

    const patches = buildPdfPatches(merged, {
      BASIC_SALARY: "50,000",
      BASIC_SALARY_ANNUAL: "6,00,000",
      SPECIAL_ALLOWANCE_ANNUAL: "1,20,000",
    });

    expect(patches.map((p) => p.text)).toEqual(["50,000", "6,00,000", "1,20,000"]);
  });
});
