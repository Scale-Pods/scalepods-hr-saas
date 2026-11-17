import {
  type GenerateStyledOfferPdfOptions,
  generateStyledOfferPdf,
} from "./generate-styled-offer-pdf";

export {
  type GenerateStyledOfferPdfOptions,
  generateStyledOfferPdf,
} from "./generate-styled-offer-pdf";

/**
 * Generate a production-grade, publication-quality A4 PDF offer letter.
 * Preserves full visual fidelity with corporate header banner, metadata cards,
 * styled blue headings, vector compensation tables, two-column signature blocks,
 * and running footers with "Page X of Y" pagination.
 */
export function generateTextOfferPdf(
  renderedText: string,
  options?: GenerateStyledOfferPdfOptions,
): Buffer {
  return generateStyledOfferPdf(renderedText, options);
}
