/**
 * Client-side text extraction for .pdf / .docx / .txt uploads in the campaign
 * builder. Loads heavy parsers lazily so they don't touch the initial bundle.
 */

export type ExtractResult = { text: string } | { error: string };

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
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  const maxPages = Math.min(doc.numPages, 60);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .join(" ");
    parts.push(pageText);
  }
  const text = parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
  return text ? { text } : { error: "No extractable text found in the PDF (is it scanned?)" };
}

async function extractDocx(file: File): Promise<ExtractResult> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = result.value.trim();
  return text ? { text } : { error: "No extractable text found in the document." };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}