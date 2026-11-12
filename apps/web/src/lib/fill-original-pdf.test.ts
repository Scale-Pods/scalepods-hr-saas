import { PDFDocument, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fillOriginalOfferPdf } from "./fill-original-pdf";

describe("fillOriginalOfferPdf", () => {
  it("preserves the original PDF while replacing patched placeholder lines", async () => {
    const srcDoc = await PDFDocument.create();
    const page = srcDoc.addPage([595, 842]);
    page.drawText("Dear {{CANDIDATE_NAME}},", { x: 72, y: 700, size: 12, color: rgb(0, 0, 0) });
    const srcBytes = await srcDoc.save();

    const filledBuffer = await fillOriginalOfferPdf(srcBytes, [
      {
        pageNumber: 1,
        x: 72,
        y: 700,
        width: 140,
        height: 14,
        fontSize: 12,
        text: "Dear Manish Sharma,",
      },
    ]);

    expect(filledBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const outDoc = await PDFDocument.load(new Uint8Array(filledBuffer));
    expect(outDoc.getPageCount()).toBe(1);
  });
});
