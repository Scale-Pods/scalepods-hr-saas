import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface PdfLinePatch {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  text: string;
}

/**
 * Strip characters unsupported by WinAnsi (StandardFonts.Helvetica) so pdf-lib never throws.
 */
function sanitizeWinAnsi(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, " ");
}

/**
 * Take the original uploaded PDF bytes and apply in-place white-out + text
 * replacement patches for lines containing {{VARIABLES}} or manual edits.
 *
 * Uses embedPages() into a fresh PDFDocument so any unclosed CTM/graphics-state
 * transforms in the source PDF (common in ReportLab / Chrome / Canva PDFs)
 * cannot shift or invert our overlay coordinates.
 */
export async function fillOriginalOfferPdf(
  originalPdfBytes: Uint8Array | ArrayBuffer,
  patches: PdfLinePatch[],
): Promise<Buffer> {
  const normalizedBytes =
    originalPdfBytes instanceof ArrayBuffer
      ? new Uint8Array(originalPdfBytes)
      : new Uint8Array(
          originalPdfBytes.buffer,
          originalPdfBytes.byteOffset,
          originalPdfBytes.byteLength,
        );

  const srcDoc = await PDFDocument.load(normalizedBytes);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const srcPages = srcDoc.getPages();
  const embeddedPages = await outDoc.embedPages(srcPages);

  for (let i = 0; i < srcPages.length; i++) {
    const { width, height } = srcPages[i].getSize();
    const page = outDoc.addPage([width, height]);
    page.drawPage(embeddedPages[i], { x: 0, y: 0, width, height });

    const pagePatches = patches.filter((p) => p.pageNumber === i + 1);
    for (const patch of pagePatches) {
      const safeText = sanitizeWinAnsi(patch.text).trim();
      const size = Math.max(7, Math.min(24, patch.fontSize || 10));
      // Cover multi-line wrapped cells downward from patch.y while keeping tight padding around borders
      const extraDrop = Math.max(0, (patch.height || size) - size * 1.15);
      const rectHeight = size * 1.15 + extraDrop;
      const textWidth = safeText ? font.widthOfTextAtSize(safeText, size) : 0;
      const rectWidth = Math.max(patch.width + 2, textWidth + 2, 12);

      // White-out only the exact placeholder / cell text area
      page.drawRectangle({
        x: Math.max(0, patch.x - 1),
        y: Math.max(0, patch.y - size * 0.22 - extraDrop),
        width: rectWidth,
        height: rectHeight,
        color: rgb(1, 1, 1),
      });

      if (safeText) {
        page.drawText(safeText, {
          x: patch.x,
          y: patch.y,
          size,
          font,
          color: rgb(0.08, 0.1, 0.14),
        });
      }
    }
  }

  const saved = await outDoc.save();
  return Buffer.from(saved);
}
