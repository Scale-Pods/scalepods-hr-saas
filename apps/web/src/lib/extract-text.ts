/**
 * Client-side text extraction for .pdf / .docx / .txt uploads in the campaign
 * builder. Loads heavy parsers lazily so they don't touch the initial bundle.
 */

import { cleanOfferTemplateDirectives, formatPlainTextAsRichHtml } from "./offer-template-utils";

export type ExtractResult = { text: string } | { error: string };
export type ExtractTemplateResult = { text: string; html: string } | { error: string };

export interface PdfTextItem {
  str: string;
  transform: number[];
}

/**
 * Rebuild a page's text with line breaks preserved. pdf.js returns one text
 * run per word/glyph with its baseline y in `transform[5]`; runs on the same
 * baseline belong to the same line, so a y-change becomes a newline. This is
 * what lets the name guesser see "Aqib Firdous Khan" and "Full Stack
 * Developer" as separate lines instead of one run-on paragraph.
 */
export function reconstructPageText(items: PdfTextItem[]): string {
  const parts: string[] = [];
  let lastY: number | null = null;
  for (const item of items) {
    const y = item.transform[5];
    if (parts.length > 0) {
      if (lastY !== null && Math.abs(y - lastY) > 2) parts.push("\n");
      else parts.push(" ");
    }
    parts.push(item.str);
    lastY = y;
  }
  return parts.join("");
}

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".pdf")) return await extractPdf(file);
    if (name.endsWith(".docx") || name.endsWith(".doc")) return await extractDocx(file);
    if (name.endsWith(".txt") || name.endsWith(".md")) return { text: await file.text() };
    return { error: `Unsupported file type: ${file.name}` };
  } catch (err) {
    return { error: `Could not read ${file.name}: ${errorMessage(err)}` };
  }
}

async function extractPdf(file: File): Promise<ExtractResult> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
    } catch {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }
  }

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  const maxPages = Math.min(doc.numPages, 60);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const runs: PdfTextItem[] = [];
    for (const item of content.items) {
      if ("str" in item && "transform" in item) {
        runs.push({ str: item.str, transform: item.transform });
      }
    }
    parts.push(reconstructPageText(runs));
  }
  const text = parts
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  return text ? { text } : { error: "No extractable text found in the PDF (is it scanned?)" };
}

async function extractDocx(file: File): Promise<ExtractResult> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = result.value.trim();
  return text ? { text } : { error: "No extractable text found in the document." };
}

/**
 * Extract both plain text and structured HTML (headings, bold, lists, tables)
 * for offer letter templates. DOCX preserves full document structure via mammoth.
 */
export async function extractOfferTemplateFromFile(file: File): Promise<ExtractTemplateResult> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".docx")) {
    return {
      error:
        "Only Word documents (.docx) are supported. Please upload a .docx offer letter or template.",
    };
  }

  try {
    const mammoth = await import("mammoth");
    const buffer = await file.arrayBuffer();
    const [rawRes, htmlRes] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer: buffer }),
      mammoth.convertToHtml(
        { arrayBuffer: buffer },
        {
          convertImage: mammoth.images.imgElement((element) =>
            element.read("base64").then((imageBuffer) => ({
              src: `data:${element.contentType};base64,${imageBuffer}`,
            })),
          ),
        },
      ),
    ]);
    const rawText = rawRes.value.trim();
    const rawHtml = htmlRes.value.trim();
    if (!rawText && !rawHtml) return { error: "No extractable text found in the document." };

    const text = cleanOfferTemplateDirectives(rawText || rawHtml.replace(/<[^>]+>/g, " ").trim());
    const html = cleanOfferTemplateDirectives(rawHtml || formatPlainTextAsRichHtml(rawText));

    return {
      text,
      html,
    };
  } catch (err) {
    return { error: `Could not read ${file.name}: ${errorMessage(err)}` };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
