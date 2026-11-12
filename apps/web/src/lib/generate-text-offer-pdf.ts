/**
 * Generate a clean A4 PDF from a plain-text offer letter string.
 * No external PDF libraries required — uses only Node.js built-ins.
 *
 * The text is assumed to already have all {{VAR}} placeholders substituted.
 * Blank lines become vertical spacing; ALL-CAPS short lines are rendered slightly larger.
 */

// A4 in PDF points (1 pt = 1/72 inch)
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_L = 72; // 1 inch
const MARGIN_R = 72;
const MARGIN_T = 80;
const MARGIN_B = 80;
const TEXT_W = PAGE_W - MARGIN_L - MARGIN_R; // ~451 pts

const BODY_SIZE = 11;
const BODY_LEADING = 16; // line height
const HEADING_SIZE = 12;
const HEADING_LEADING = 18;

// Approximate character width for Helvetica at given size (empirical)
function charsPerLine(fontSize: number): number {
  return Math.floor(TEXT_W / (fontSize * 0.55));
}

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/[ \t]+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (`${cur} ${w}`.length <= maxChars) {
      cur += ` ${w}`;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Escape a string for use inside a PDF literal string (...) */
function esc(s: string): string {
  // Replace non-Latin1 chars with '?' and escape PDF special chars
  return s
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

type DisplayLine =
  | { kind: "text"; text: string; size: number; leading: number }
  | { kind: "blank"; leading: number };

function buildDisplayLines(rawText: string): DisplayLine[] {
  const output: DisplayLine[] = [];
  for (const raw of rawText.split("\n")) {
    if (!raw.trim()) {
      output.push({ kind: "blank", leading: BODY_LEADING });
      continue;
    }
    const isHeading = raw === raw.toUpperCase() && raw.trim().length > 2 && raw.trim().length < 70;
    const size = isHeading ? HEADING_SIZE : BODY_SIZE;
    const leading = isHeading ? HEADING_LEADING : BODY_LEADING;
    const maxChars = charsPerLine(size);
    const wrapped = wrapText(raw.trim(), maxChars);
    for (const line of wrapped) {
      output.push({ kind: "text", text: line, size, leading });
    }
  }
  return output;
}

/** Build a PDF content stream for one page worth of display lines */
function buildPageStream(lines: DisplayLine[]): Buffer {
  const ops: string[] = [];
  ops.push("BT");

  let currentSize = 0;
  let y = PAGE_H - MARGIN_T;

  for (const line of lines) {
    if (line.kind === "blank") {
      y -= line.leading;
      continue;
    }
    if (line.size !== currentSize) {
      ops.push(`/F1 ${line.size} Tf`);
      currentSize = line.size;
    }
    ops.push(`1 0 0 1 ${MARGIN_L} ${y.toFixed(2)} Tm`);
    ops.push(`(${esc(line.text)}) Tj`);
    y -= line.leading;
  }

  ops.push("ET");
  return Buffer.from(ops.join("\n"), "latin1");
}

/** Paginate display lines into pages */
function paginate(lines: DisplayLine[]): DisplayLine[][] {
  const usableH = PAGE_H - MARGIN_T - MARGIN_B;
  const pages: DisplayLine[][] = [];
  let pageBuf: DisplayLine[] = [];
  let usedH = 0;

  for (const line of lines) {
    const h = line.leading;
    if (usedH + h > usableH && pageBuf.length) {
      pages.push(pageBuf);
      pageBuf = [];
      usedH = 0;
    }
    pageBuf.push(line);
    usedH += h;
  }
  if (pageBuf.length) pages.push(pageBuf);
  if (!pages.length) pages.push([]);
  return pages;
}

export function generateTextOfferPdf(renderedText: string): Buffer {
  const displayLines = buildDisplayLines(renderedText);
  const pageGroups = paginate(displayLines);
  const N = pageGroups.length;

  // Object ID plan:
  //  1        = Catalog
  //  2        = Pages
  //  3..N+2   = Page objects
  //  N+3..2N+2 = Content streams
  //  2N+3     = Helvetica font
  const fontId = 3 + 2 * N;

  // --- Serialization helpers ------------------------------------------------
  const chunks: Buffer[] = [];
  const offsets: number[] = new Array(fontId + 1).fill(0);
  let pos = 0;

  function emit(b: Buffer): void {
    chunks.push(b);
    pos += b.length;
  }

  function emitStr(s: string): void {
    emit(Buffer.from(s, "latin1"));
  }

  function beginObj(id: number): void {
    offsets[id] = pos;
    emitStr(`${id} 0 obj\n`);
  }

  function endObj(): void {
    emitStr("endobj\n");
  }

  // --- PDF header -----------------------------------------------------------
  emitStr("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  // 1: Catalog
  beginObj(1);
  emitStr("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();

  // 2: Pages node
  const kidsRef = Array.from({ length: N }, (_, i) => `${3 + i} 0 R`).join(" ");
  beginObj(2);
  emitStr(`<< /Type /Pages /Kids [${kidsRef}] /Count ${N} >>\n`);
  endObj();

  // 3..N+2: Page objects
  for (let i = 0; i < N; i++) {
    const pageId = 3 + i;
    const contentId = 3 + N + i;
    beginObj(pageId);
    emitStr(
      `<< /Type /Page /Parent 2 0 R` +
        ` /MediaBox [0 0 ${PAGE_W} ${PAGE_H}]` +
        ` /Contents ${contentId} 0 R` +
        ` /Resources << /Font << /F1 ${fontId} 0 R >> >> >>\n`,
    );
    endObj();
  }

  // N+3..2N+2: Content streams
  for (let i = 0; i < N; i++) {
    const contentId = 3 + N + i;
    const stream = buildPageStream(pageGroups[i]);
    beginObj(contentId);
    emitStr(`<< /Length ${stream.length} >>\nstream\n`);
    emit(stream);
    emitStr("\nendstream\n");
    endObj();
  }

  // Font
  beginObj(fontId);
  emitStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n");
  endObj();

  // --- Cross-reference table -----------------------------------------------
  const xrefStart = pos;
  const totalObjs = fontId + 1; // IDs 0..fontId
  emitStr(`xref\n0 ${totalObjs}\n`);
  emitStr("0000000000 65535 f \n"); // object 0: free

  for (let i = 1; i < totalObjs; i++) {
    emitStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }

  // --- Trailer -------------------------------------------------------------
  emitStr(`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return Buffer.concat(chunks);
}
