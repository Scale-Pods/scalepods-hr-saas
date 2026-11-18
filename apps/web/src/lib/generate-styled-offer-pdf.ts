/**
 * High-Fidelity Branded Offer Letter PDF Generator.
 *
 * Generates corporate, publication-grade PDFs matching the original Word template design:
 * - Clean corporate white-background header with "ScalePods" branding & accent line
 * - Two-column metadata card (Ref No, Issue Date, Candidate Name, Starting Date)
 * - Corporate blue section headings (#1e3a8a) & numbered legal headings
 * - Real vector-drawn Compensation Structure table (for fulltime) & stipend lines (for intern)
 * - Real vector-drawn bullet points (zero encoding glitches, NO '?' characters)
 * - Exact stacked Signatory & Candidate Acceptance blocks matching the Word template
 * - Running headers and footers with dynamic "Page X of Y" numbering on all pages
 *
 * 100% Native TypeScript / Node.js — ZERO external APIs, ZERO Gotenberg, ZERO cloud services.
 */

import * as zlib from "node:zlib";
import { numberToWords } from "./number-to-words";

export { numberToWords } from "./number-to-words";
export { getDefaultLetterheadBuffer } from "./offers/assets/scalepods-letterhead-base64";

const PAGE_W = 595.28; // A4 width (points)
const PAGE_H = 841.89; // A4 height (points)
const MARGIN_L = 50;
const MARGIN_R = 50;
const MARGIN_T = 54;
const MARGIN_B = 50;
const USABLE_W = PAGE_W - MARGIN_L - MARGIN_R; // ~495.28 pt

// Colors (RGB components 0..1)
const COLOR_NAVY = [0.059, 0.09, 0.165]; // #0f172a
const COLOR_BRAND_BLUE = [0.118, 0.227, 0.541]; // #1e3a8a
const COLOR_ACCENT_BLUE = [0.145, 0.388, 0.922]; // #2563eb
const COLOR_BODY_TEXT = [0.118, 0.161, 0.231]; // #1e293b
const COLOR_MUTED_GRAY = [0.392, 0.455, 0.545]; // #64748b
const COLOR_LIGHT_BG = [0.973, 0.98, 0.988]; // #f8fafc
const COLOR_CARD_BORDER = [0.796, 0.835, 0.882]; // #cbd5e1
const COLOR_GRID_BORDER = [0.886, 0.91, 0.941]; // #e2e8f0
const COLOR_WHITE = [1, 1, 1];

/**
 * Escape text for PDF literal strings (...), replacing Unicode characters
 * with standard ASCII equivalents so NO question marks '?' appear.
 */
function esc(s: string): string {
  return String(s || "")
    .replace(/[\u2013\u2014\u2015\u2500\u2012]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, "")
    .replace(/\u2026/g, "...")
    .replace(/\u20B9/g, "INR ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function sanitizeText(text: string): string {
  let cleaned = text
    .replace(/â€¢/g, "•")
    .replace(/\u2022/g, "•")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2015\u2500]/g, "-")
    .replace(/→/g, "->")
    .replace(/\u20B9/g, "INR ")
    .replace(/\r\n/g, "\n");

  // Fix "(0)" in stipend or CTC if it was unpopulated: e.g. "INR 5000 /- (0)" -> "INR 5000 /- (Five Thousand Rupees Only)"
  cleaned = cleaned.replace(/INR\s*(\d[\d,]*)\s*\/?-\s*\((?:0|\s*)\)/gi, (_, amt: string) => {
    const words = numberToWords(amt);
    return `INR ${amt} /- (${words})`;
  });

  return cleaned;
}

const HELVETICA_GLYPH_WIDTHS: Record<string, number> = {
  " ": 278,
  "!": 278,
  '"': 355,
  "#": 556,
  $: 556,
  "%": 889,
  "&": 667,
  "'": 191,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  ":": 278,
  ";": 278,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 556,
  "@": 1015,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  "[": 278,
  "\\": 278,
  "]": 278,
  "^": 469,
  _: 556,
  "`": 222,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
  "{": 334,
  "|": 260,
  "}": 334,
  "~": 584,
  "•": 400,
  "–": 556,
  "—": 1000,
  "’": 191,
  "“": 355,
  "”": 355,
};

function approxTextWidth(text: string, size: number, isBold = false): number {
  let total1000 = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = HELVETICA_GLYPH_WIDTHS[ch] ?? 500;
    total1000 += isBold ? Math.round(w * 1.06) : w;
  }
  return (total1000 / 1000) * size;
}

function wrapText(text: string, maxWidth: number, size: number, isBold = false): string[] {
  const words = text.split(/[ \t]+/);
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    const testLine = cur ? `${cur} ${w}` : w;
    if (approxTextWidth(testLine, size, isBold) <= maxWidth) {
      cur = testLine;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// Visual Document Element Types
type RenderItem =
  | { type: "metadata_card"; leftLines: string[]; rightLines: string[]; height: number }
  | { type: "title"; text: string; height: number }
  | { type: "heading"; text: string; height: number }
  | { type: "paragraph"; lines: string[]; height: number }
  | { type: "bullet"; textLines: string[]; height: number }
  | { type: "signature_image"; height: number }
  | {
      type: "two_column_signatures";
      leftLines: string[];
      rightLines: string[];
      height: number;
    }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
      colWidths: number[];
      height: number;
    }
  | {
      type: "signatory_block";
      companySigner: {
        name: string;
        title: string;
        company: string;
        date?: string;
        signatureBase64?: string;
      };
      candidateName: string;
      role: string;
      height: number;
    }
  | { type: "spacer"; height: number };

function formatSigColLines(rawLines: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawLines) {
    const parts = raw
      .replace(/\\n/g, "\n")
      .split(/\n|(?=Signature:|Full Name:|Date:|\bCC:|\b“CC:”|Authorized Signatory)/i)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Parse structured offer letter text into printable visual items.
 */
function parseOfferText(
  rawText: string,
  extra?: {
    signatoryDate?: string;
    signatureBase64?: string;
    isDefaultTemplate?: boolean;
  },
): RenderItem[] {
  const cleaned = sanitizeText(rawText);
  const hasAckInDoc =
    Boolean(extra?.isDefaultTemplate) ||
    cleaned.toUpperCase().includes("ACKNOWLEDGEMENT") ||
    cleaned.toUpperCase().includes("CANDIDATE ACCEPTANCE");
  const lines = cleaned.split("\n");
  const items: RenderItem[] = [];
  let insertedSigImg = false;

  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = lines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    // Two-column signature block: [SIGNATURE_COLUMNS] ... [/SIGNATURE_COLUMNS]
    if (line.startsWith("[SIGNATURE_COLUMNS]")) {
      const leftLines: string[] = [];
      const rightLines: string[] = [];
      let target: "left" | "right" = "left";
      i++;
      while (i < n && !lines[i].includes("[/SIGNATURE_COLUMNS]")) {
        const curLine = lines[i].trim();
        if (curLine.startsWith("LEFT:")) {
          target = "left";
          const val = curLine.replace(/^LEFT:\s*/, "").trim();
          if (val) leftLines.push(val);
        } else if (curLine.startsWith("RIGHT:")) {
          target = "right";
          const val = curLine.replace(/^RIGHT:\s*/, "").trim();
          if (val) rightLines.push(val);
        } else if (curLine) {
          if (target === "left") leftLines.push(curLine);
          else rightLines.push(curLine);
        }
        i++;
      }
      if (i < n && lines[i].includes("[/SIGNATURE_COLUMNS]")) i++;

      const formattedLeft = formatSigColLines(leftLines);
      const formattedRight = formatSigColLines(rightLines);
      const approxH =
        Math.max(formattedLeft.length, formattedRight.length) * 16 +
        (extra?.signatureBase64 ? 45 : 0) +
        25;

      items.push({
        type: "two_column_signatures",
        leftLines: formattedLeft,
        rightLines: formattedRight,
        height: approxH,
      });
      continue;
    }

    // Two-column metadata on single line: Ref: ... and Date: ...
    const singleLineRefDate = line.match(
      /^(REF:\s*[^D\n]+?)(?:\t|\s{2,}|(?=Date:))\s*(Date:\s*.+)$/i,
    );
    if (singleLineRefDate) {
      items.push({
        type: "metadata_card",
        leftLines: [singleLineRefDate[1].trim()],
        rightLines: [singleLineRefDate[2].trim()],
        height: 20,
      });
      i++;
      continue;
    }

    // Two-column metadata pairing: Ref: ... and Date: ...
    if (
      line.toLowerCase().startsWith("ref:") &&
      i + 1 < n &&
      lines[i + 1].trim().toLowerCase().startsWith("date:")
    ) {
      items.push({
        type: "metadata_card",
        leftLines: [line],
        rightLines: [lines[i + 1].trim()],
        height: 20,
      });
      i += 2;
      continue;
    }

    // Two-column metadata on single line: Dear ... and Starting Date: ...
    const singleLineDearDate = line.match(/^(Dear\s+[^,]+,)\s+(Starting Date:\s*.+)$/i);
    if (singleLineDearDate) {
      items.push({
        type: "metadata_card",
        leftLines: [singleLineDearDate[1].trim()],
        rightLines: [singleLineDearDate[2].trim()],
        height: 20,
      });
      i++;
      continue;
    }

    // Two-column metadata pairing: Dear ... and Starting Date: ...
    if (
      line.toLowerCase().startsWith("dear ") &&
      i + 1 < n &&
      lines[i + 1].trim().toLowerCase().startsWith("starting date:")
    ) {
      items.push({
        type: "metadata_card",
        leftLines: [line],
        rightLines: [lines[i + 1].trim()],
        height: 20,
      });
      i += 2;
      continue;
    }

    // 1. Two-column metadata bar (e.g., | Ref: ... | Date: ... | or | Dear ... | Starting Date: ... |)
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      const isNextLineTable = i + 1 < n && lines[i + 1].trim().startsWith("|");

      if (cells.length === 2 && !isNextLineTable) {
        items.push({
          type: "metadata_card",
          leftLines: [cells[0]],
          rightLines: [cells[1]],
          height: 20,
        });
        i++;
        continue;
      }

      // Check if this is a table (like Compensation Table or Signature table)
      const tableLines: string[] = [];
      while (i < n && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const parsedRows = tableLines.map((row) =>
          row
            .split("|")
            .map((c) => c.trim())
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1),
        );

        const validRows = parsedRows.filter((r) => !r.every((c) => /^[-:]+$/.test(c)));

        if (validRows.length >= 2) {
          const headers = validRows[0];
          const dataRows = validRows.slice(1);
          const colCount = Math.max(headers.length, ...dataRows.map((r) => r.length));

          let colWidths: number[] = [];
          if (colCount === 4 && headers[0].includes("#")) {
            // Standard Compensation Table (# | Component | Monthly | Annual)
            colWidths = [35, 200, 130, 130.28];
          } else if (colCount === 3 && headers[0].toLowerCase().includes("signature")) {
            // Signature table: Signature | Date | Place
            const w = USABLE_W / 3;
            colWidths = [w, w, w];
          } else {
            const w = USABLE_W / colCount;
            colWidths = new Array(colCount).fill(w);
          }

          const tableH = 22 + dataRows.length * 18 + 8;
          items.push({
            type: "table",
            headers,
            rows: dataRows,
            colWidths,
            height: tableH,
          });
          continue;
        }
      }
      continue;
    }

    // 2. Main Title (e.g., APPOINTMENT LETTER / INTERNSHIP APPOINTMENT LETTER / LETTER OF INTENT)
    if (
      line.toUpperCase().includes("APPOINTMENT LETTER") ||
      line.toUpperCase().includes("OFFER OF EMPLOYMENT") ||
      line.toUpperCase().includes("EMPLOYMENT OFFER") ||
      line.toUpperCase().includes("LETTER OF INTENT")
    ) {
      const wrapped = wrapText(line, USABLE_W, 12.5, true);
      items.push({
        type: "title",
        text: line,
        height: wrapped.length * 18 + 8,
      });
      i++;
      continue;
    }

    // 3. Section Heading (TERMS OF ENGAGEMENT, 1. Role & Scope, etc.)
    const isNumberedHeading = /^[0-9]+\.\s+[A-Za-z]/.test(line);
    const isAllCapsHeading =
      line === line.toUpperCase() &&
      line.length > 3 &&
      line.length < 50 &&
      !line.startsWith("•") &&
      !line.includes("INR");

    if (isNumberedHeading || isAllCapsHeading) {
      const wrapped = wrapText(line, USABLE_W, 10.5, true);
      items.push({
        type: "heading",
        text: line,
        height: wrapped.length * 15 + 6,
      });
      i++;
      continue;
    }

    // 4. Signatory section detection
    // Acknowledgement header check:
    const isAckHeader =
      line.toUpperCase().includes("ACKNOWLEDGEMENT") ||
      line.toUpperCase().includes("CANDIDATE ACCEPTANCE") ||
      line.toUpperCase().includes("ACCEPTANCE OF OFFER");

    // Short formal closing salutation (e.g. "Sincerely", "Authorized Signatory", etc.)
    const isClosingSalutation =
      /^(?:sincerely|yours sincerely|yours faithfully|warm regards|with warm regards|regards,|best regards|authorized signatory)/i.test(
        line,
      );

    // "For <Company>" is only a closing signatory header if it is a SHORT heading (< 60 chars)
    // and does NOT contain sentence verbs ("we are pleased", "we offer", "we extend", etc.)
    const isShortForCompany =
      /^for\s+[^,.:;\n]{2,60}$/i.test(line) &&
      !/(?:we|are|pleased|offer|extend|delighted|hereby|training|internship|terms|letter of intent)/i.test(
        line,
      );

    // Only generate the dedicated ScalePods signatory_block (with candidate acknowledgement box)
    // if the template explicitly contains an ACKNOWLEDGEMENT header or is explicitly the default ScalePods template
    const isSignatoryStart =
      hasAckInDoc && (isAckHeader || isClosingSalutation || isShortForCompany);

    if (isSignatoryStart) {
      const sigLines: string[] = [line];
      i++;
      while (i < n && sigLines.length < 25) {
        const next = lines[i].trim();
        if (!next) {
          i++;
          continue;
        }
        // If we hit a new numbered legal section, stop
        if (/^[0-9]+\.\s+[A-Za-z]/.test(next)) {
          break;
        }
        // If we hit a normal body sentence with more than 100 characters, stop
        if (next.length > 100 && /\.\s+[A-Z]/.test(next)) {
          break;
        }
        sigLines.push(next);
        i++;
      }

      let companyName = "ScalePods Partner";
      let signerName = "Authorized Signatory";
      let signerTitle = "Talent Acquisition Lead";
      let candidateName = "Candidate";
      let role = "Team Member";

      const forLine = sigLines.find(
        (l) =>
          (/^for\s+/i.test(l) || /^on behalf of\s+/i.test(l)) &&
          l.length < 60 &&
          !/(?:we|are|pleased|offer|extend|delighted|hereby)/i.test(l),
      );
      if (forLine) {
        const comp = forLine.replace(/^(?:For|on behalf of)\s+/i, "").trim();
        if (comp.length < 60 && !/(?:we|are|pleased|offer|extend)/i.test(comp)) {
          companyName = comp;
        }
      }

      const ackIdx = sigLines.findIndex(
        (l) =>
          l.toUpperCase().includes("ACKNOWLEDGEMENT") || l.toLowerCase().includes("accept the"),
      );
      if (ackIdx !== -1) {
        for (let s = ackIdx; s < sigLines.length; s++) {
          const acceptLine = sigLines[s];
          const match = acceptLine.match(/I,\s*([^,]+),\s*accept.*as\s*([^u]+?)\s*under/i);
          if (match) {
            candidateName = match[1].trim();
            role = match[2].trim();
            break;
          }
        }
      }

      if (forLine) {
        const forIdx = sigLines.indexOf(forLine);
        if (
          forIdx + 1 < sigLines.length &&
          !sigLines[forIdx + 1].toUpperCase().includes("ACKNOWLEDGEMENT")
        ) {
          const l1 = sigLines[forIdx + 1];
          if (!l1.toLowerCase().startsWith("signature") && !l1.toLowerCase().startsWith("date")) {
            signerName = l1;
          }
        }
        if (
          forIdx + 2 < sigLines.length &&
          !sigLines[forIdx + 2].toUpperCase().includes("ACKNOWLEDGEMENT")
        ) {
          const l2 = sigLines[forIdx + 2];
          if (!l2.toLowerCase().startsWith("signature") && !l2.toLowerCase().startsWith("date")) {
            signerTitle = l2;
          }
        }
      }

      items.push({
        type: "signatory_block",
        companySigner: {
          name: signerName,
          title: signerTitle,
          company: companyName,
          date: extra?.signatoryDate,
          signatureBase64: extra?.signatureBase64,
        },
        candidateName,
        role,
        height: 155,
      });
      continue;
    }

    // If the recruiter uploaded a signature image, place it gracefully right above the signature line in custom templates
    if (
      extra?.signatureBase64 &&
      !insertedSigImg &&
      (line.toLowerCase().includes("authorized signatory") ||
        line.toLowerCase().startsWith("signature:") ||
        line.toLowerCase() === "signature" ||
        line.toLowerCase().startsWith("sincerely"))
    ) {
      insertedSigImg = true;
      items.push({
        type: "signature_image",
        height: 48,
      });
    }

    // 5. Bullet items
    if (line.startsWith("•") || line.startsWith("*") || line.startsWith("- ")) {
      const cleanBullet = line.replace(/^[•*\-\s]+/, "").trim();
      const wrapped = wrapText(cleanBullet, USABLE_W - 18, 9.5);
      items.push({
        type: "bullet",
        textLines: wrapped,
        height: wrapped.length * 14 + 3,
      });
      i++;
      continue;
    }

    // 6. Regular Body Paragraph
    const wrapped = wrapText(line, USABLE_W, 9.5);
    items.push({
      type: "paragraph",
      lines: wrapped,
      height: wrapped.length * 14 + 5,
    });
    i++;
  }

  return items;
}

/**
 * Group items into pages based on available height.
 */
function paginateItems(items: RenderItem[]): RenderItem[][] {
  const pages: RenderItem[][] = [];
  let curPage: RenderItem[] = [];

  // Page 1 has top header
  const page1UsableH = PAGE_H - 105 - MARGIN_B;
  const subsequentUsableH = PAGE_H - MARGIN_T - MARGIN_B;

  let currentUsableH = page1UsableH;
  let usedH = 0;

  for (const item of items) {
    if (usedH + item.height > currentUsableH && curPage.length > 0) {
      pages.push(curPage);
      curPage = [];
      usedH = 0;
      currentUsableH = subsequentUsableH;
    }
    curPage.push(item);
    usedH += item.height;
  }

  if (curPage.length > 0) {
    pages.push(curPage);
  }

  return pages.length ? pages : [[]];
}

function parsePngForPdf(pngBuf: Buffer): {
  width: number;
  height: number;
  rgbStream: Buffer;
  alphaStream?: Buffer;
} | null {
  try {
    if (
      pngBuf.length < 24 ||
      pngBuf[0] !== 0x89 ||
      pngBuf[1] !== 0x50 ||
      pngBuf[2] !== 0x4e ||
      pngBuf[3] !== 0x47
    ) {
      return null;
    }

    const width = pngBuf.readUInt32BE(16);
    const height = pngBuf.readUInt32BE(20);
    const colorType = pngBuf.readUInt8(25);

    const idatChunks: Buffer[] = [];
    let offset = 8;
    while (offset < pngBuf.length) {
      const len = pngBuf.readUInt32BE(offset);
      const type = pngBuf.toString("ascii", offset + 4, offset + 8);
      if (type === "IDAT") {
        idatChunks.push(pngBuf.subarray(offset + 8, offset + 8 + len));
      }
      offset += 12 + len;
    }
    if (idatChunks.length === 0) return null;

    const allIdat = Buffer.concat(idatChunks);
    const rawPixels = zlib.inflateSync(allIdat);

    const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
    const rowBytes = 1 + width * bpp;
    const rgbRows: Buffer[] = [];
    const alphaRows: Buffer[] = [];

    let prevRow = Buffer.alloc(width * bpp);

    for (let y = 0; y < height; y++) {
      const rowStart = y * rowBytes;
      const filterType = rawPixels[rowStart];
      const scanline = Buffer.alloc(width * bpp);

      for (let x = 0; x < width * bpp; x++) {
        const rawVal = rawPixels[rowStart + 1 + x];
        const left = x >= bpp ? scanline[x - bpp] : 0;
        const up = prevRow[x];
        const upLeft = x >= bpp ? prevRow[x - bpp] : 0;

        let recon = 0;
        if (filterType === 0) recon = rawVal;
        else if (filterType === 1) recon = (rawVal + left) & 0xff;
        else if (filterType === 2) recon = (rawVal + up) & 0xff;
        else if (filterType === 3) recon = (rawVal + Math.floor((left + up) / 2)) & 0xff;
        else if (filterType === 4) {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          recon = (rawVal + pr) & 0xff;
        }
        scanline[x] = recon;
      }
      prevRow = scanline;

      if (bpp === 4) {
        const rgbRow = Buffer.alloc(width * 3);
        const alphaRow = Buffer.alloc(width);
        for (let p = 0; p < width; p++) {
          rgbRow[p * 3] = scanline[p * 4];
          rgbRow[p * 3 + 1] = scanline[p * 4 + 1];
          rgbRow[p * 3 + 2] = scanline[p * 4 + 2];
          alphaRow[p] = scanline[p * 4 + 3];
        }
        rgbRows.push(rgbRow);
        alphaRows.push(alphaRow);
      } else if (bpp === 3) {
        rgbRows.push(scanline);
      }
    }

    const rgbStream = zlib.deflateSync(Buffer.concat(rgbRows));
    let alphaStream: Buffer | undefined;
    if (alphaRows.length > 0) {
      alphaStream = zlib.deflateSync(Buffer.concat(alphaRows));
    }

    return { width, height, rgbStream, alphaStream };
  } catch (err) {
    console.warn("[parsePngForPdf] Failed to parse PNG:", err);
    return null;
  }
}

function getJpegDimensions(buf: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    while (buf[i] === 0xff) i++;
    const marker = buf[i];
    i++;
    if (marker === 0xd9 || marker === 0xda) break;
    const len = buf.readUInt16BE(i);
    if (marker >= 0xc0 && marker <= 0xc3 && marker !== 0xc4) {
      const height = buf.readUInt16BE(i + 3);
      const width = buf.readUInt16BE(i + 5);
      return { width, height };
    }
    i += len;
  }
  return { width: 400, height: 150 };
}

/**
 * Draw a single page content stream with high visual fidelity.
 */
function renderPageContent(
  pageItems: RenderItem[],
  pageNum: number,
  totalPages: number,
  companyName = "ScalePods",
  hasBgImg = false,
  companyWebsite = "www.scalepods.com",
  companyEmail = "contact@scalepods.com",
  hasSigImg = false,
  sigImgDims = { width: 400, height: 150 },
  hasLogoImg = false,
  logoDims = { width: 200, height: 50 },
  _isDefaultTemplate = false,
  logoAlignment: "left" | "center" | "right" = "left",
): Buffer {
  const ops: string[] = [];

  const setFill = (rgb: number[]) => ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg`);
  const setStroke = (rgb: number[]) => ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} RG`);
  const setLineWidth = (w: number) => ops.push(`${w} w`);

  const drawRect = (x: number, y: number, w: number, h: number, fill = true, stroke = false) => {
    ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (fill && stroke) ops.push("B");
    else if (fill) ops.push("f");
    else if (stroke) ops.push("s");
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l s`);
  };

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    font = "/F1",
    color = COLOR_BODY_TEXT,
  ) => {
    ops.push("BT");
    ops.push(`${font} ${size} Tf`);
    ops.push(`${color[0]} ${color[1]} ${color[2]} rg`);
    ops.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
    ops.push(`(${esc(text)}) Tj`);
    ops.push("ET");
  };

  if (hasBgImg) {
    // Draw background letterhead image over full A4 page
    ops.push(`q ${PAGE_W.toFixed(2)} 0 0 ${PAGE_H.toFixed(2)} 0 0 cm /BgImg Do Q`);
  }

  // --- HEADER SECTION ---
  if (!hasBgImg) {
    if (pageNum === 1) {
      if (hasLogoImg) {
        // Render real company logo from template cleanly at top of Page 1
        const aspect = logoDims.width / Math.max(1, logoDims.height);
        const maxW = 200;
        const maxH = 46;
        let logoW = maxW;
        let logoH = logoW / aspect;
        if (logoH > maxH) {
          logoH = maxH;
          logoW = logoH * aspect;
        }
        const logoY = PAGE_H - 30 - logoH;
        let logoX = MARGIN_L;
        if (logoAlignment === "right") {
          logoX = PAGE_W - MARGIN_R - logoW;
        } else if (logoAlignment === "center") {
          logoX = MARGIN_L + (USABLE_W - logoW) / 2;
        }
        ops.push(
          `q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${logoX.toFixed(2)} ${logoY.toFixed(2)} cm /LogoImg Do Q`,
        );

        // Subtle divider rule under logo
        setFill([0.88, 0.9, 0.94]);
        drawRect(MARGIN_L, logoY - 8, USABLE_W, 1, true, false);
      } else {
        // Clean Corporate Header matching Template branding
        const headerTop = PAGE_H - 42;
        drawText(companyName, MARGIN_L, headerTop, 18, "/F2", COLOR_NAVY);
        drawText(
          "CONFIDENTIAL EMPLOYMENT AGREEMENT",
          MARGIN_L,
          headerTop - 13,
          8,
          "/F1",
          COLOR_MUTED_GRAY,
        );

        const badgeW = 90;
        const badgeH = 18;
        const badgeX = PAGE_W - MARGIN_R - badgeW;
        const badgeY = headerTop - 7;
        setFill([0.94, 0.96, 0.98]);
        setStroke(COLOR_CARD_BORDER);
        setLineWidth(0.75);
        drawRect(badgeX, badgeY, badgeW, badgeH, true, true);
        drawText("OFFICIAL OFFER", badgeX + 11, badgeY + 5, 7.5, "/F2", COLOR_BRAND_BLUE);

        setFill(COLOR_ACCENT_BLUE);
        drawRect(MARGIN_L, headerTop - 22, USABLE_W, 1.5, true, false);
      }
    } else {
      // Running header on page 2+
      const headerY = PAGE_H - 30;
      const headerTitle = `${companyName} - Private & Confidential`;
      drawText(headerTitle, MARGIN_L, headerY, 8, "/F1", [0.45, 0.5, 0.6]);
      drawText("Official Agreement", PAGE_W - MARGIN_R - 75, headerY, 8, "/F1", [0.45, 0.5, 0.6]);

      setStroke(COLOR_GRID_BORDER);
      setLineWidth(0.75);
      drawLine(MARGIN_L, headerY - 5, PAGE_W - MARGIN_R, headerY - 5);
    }
  }

  // --- RUNNING FOOTER (ALL PAGES) ---
  const footerY = 32;
  setStroke(COLOR_GRID_BORDER);
  setLineWidth(0.75);
  drawLine(MARGIN_L, footerY + 12, PAGE_W - MARGIN_R, footerY + 12);

  if (hasBgImg) {
    const contactParts = [companyName, companyWebsite, companyEmail].filter(Boolean);
    const footerText = contactParts.length > 0 ? contactParts.join("   |   ") : companyName;
    const footerTextW = approxTextWidth(footerText, 7.5);
    const footerX = Math.max(MARGIN_L, (PAGE_W - footerTextW) / 2);
    drawText(footerText, footerX, footerY, 7.5, "/F1", [0.45, 0.45, 0.45]);

    const pageStr = `Page ${pageNum} of ${totalPages}`;
    drawText(pageStr, PAGE_W - MARGIN_R - 45, footerY, 7.5, "/F2", [0.35, 0.35, 0.35]);
  } else {
    const footerTitle = `Private & Confidential - ${companyName} Employment Agreement`;
    drawText(footerTitle, MARGIN_L, footerY, 8, "/F1", COLOR_MUTED_GRAY);
    const pageStr = `Page ${pageNum} of ${totalPages}`;
    drawText(pageStr, PAGE_W - MARGIN_R - 55, footerY, 8.5, "/F2", [0.2, 0.25, 0.35]);
  }

  // --- CONTENT RENDERING ---
  let cursorY =
    pageNum === 1
      ? hasBgImg
        ? PAGE_H - 85
        : hasLogoImg
          ? PAGE_H - 95
          : PAGE_H - 75
      : hasBgImg
        ? PAGE_H - 65
        : PAGE_H - MARGIN_T;

  for (const item of pageItems) {
    if (item.type === "title") {
      cursorY -= 8;
      const wrapped = wrapText(item.text, USABLE_W, 12.5, true);
      for (const tLine of wrapped) {
        drawText(tLine, MARGIN_L, cursorY, 12.5, "/F2", COLOR_NAVY);
        cursorY -= 16;
      }
    } else if (item.type === "metadata_card") {
      cursorY -= 4;
      // Clean borderless metadata row matching Word template with symmetric right margin
      if (item.leftLines.length > 0) {
        drawText(item.leftLines[0], MARGIN_L, cursorY, 9.5, "/F2", COLOR_NAVY);
      }
      if (item.rightLines.length > 0) {
        const rightText = item.rightLines[0];
        const rightW = approxTextWidth(rightText, 9.5, true);
        const rightX = PAGE_W - MARGIN_R - rightW;
        drawText(rightText, rightX, cursorY, 9.5, "/F2", COLOR_NAVY);
      }
      cursorY -= 16;
    } else if (item.type === "heading") {
      cursorY -= 8;
      const wrapped = wrapText(item.text, USABLE_W, 10.5, true);
      for (const hLine of wrapped) {
        drawText(hLine, MARGIN_L, cursorY, 10.5, "/F2", COLOR_NAVY);
        cursorY -= 14;
      }
    } else if (item.type === "paragraph") {
      for (const line of item.lines) {
        drawText(line, MARGIN_L, cursorY, 9.5, "/F1", COLOR_BODY_TEXT);
        cursorY -= 14;
      }
      cursorY -= 3;
    } else if (item.type === "signature_image") {
      if (hasSigImg) {
        const maxSigW = 120;
        const maxSigH = 42;
        let sigW = maxSigW;
        let sigH = (sigW * sigImgDims.height) / (sigImgDims.width || 1);
        if (sigH > maxSigH) {
          sigH = maxSigH;
          sigW = (sigH * (sigImgDims.width || 1)) / (sigImgDims.height || 1);
        }
        cursorY -= sigH;
        ops.push(
          `q ${sigW.toFixed(2)} 0 0 ${sigH.toFixed(2)} ${MARGIN_L.toFixed(2)} ${cursorY.toFixed(2)} cm /SigImg Do Q`,
        );
        cursorY -= 10;
      }
    } else if (item.type === "two_column_signatures") {
      cursorY -= 8;
      const col1X = MARGIN_L;
      const col2X = MARGIN_L + USABLE_W * 0.52;
      const startY = cursorY;

      // Left Column: Candidate Acceptance
      let leftY = startY;
      for (const line of item.leftLines) {
        if (/sincerely|acceptance/i.test(line)) {
          drawText(line, col1X, leftY, 10, "/F2", COLOR_BRAND_BLUE);
          leftY -= 15;
        } else if (/signature:/i.test(line)) {
          drawText(
            line.replace(/signature:\s*/i, "Signature: __________________________"),
            col1X,
            leftY,
            9,
            "/F1",
            COLOR_MUTED_GRAY,
          );
          leftY -= 16;
        } else {
          const isKeyVal = /^(Full Name|Date|Name):\s*/i.test(line);
          drawText(line, col1X, leftY, 9, isKeyVal ? "/F2" : "/F1", COLOR_BODY_TEXT);
          leftY -= 14;
        }
      }

      // Right Column: Company Signatory
      let rightY = startY;
      if (hasSigImg) {
        const maxSigW = 110;
        const maxSigH = 38;
        let sigW = maxSigW;
        let sigH = (sigW * sigImgDims.height) / (sigImgDims.width || 1);
        if (sigH > maxSigH) {
          sigH = maxSigH;
          sigW = (sigH * (sigImgDims.width || 1)) / (sigImgDims.height || 1);
        }
        rightY -= sigH;
        ops.push(
          `q ${sigW.toFixed(2)} 0 0 ${sigH.toFixed(2)} ${col2X.toFixed(2)} ${rightY.toFixed(2)} cm /SigImg Do Q`,
        );
        rightY -= 10;
      }
      for (const line of item.rightLines) {
        if (/authorized signatory/i.test(line)) {
          drawText(line, col2X, rightY, 9.5, "/F2", COLOR_NAVY);
          rightY -= 14;
        } else if (/“?CC:?”?/i.test(line)) {
          drawText(line, col2X, rightY, 8.5, "/F1", COLOR_MUTED_GRAY);
          rightY -= 13;
        } else {
          drawText(line, col2X, rightY, 9, "/F1", COLOR_BODY_TEXT);
          rightY -= 14;
        }
      }

      cursorY = Math.min(leftY, rightY) - 10;
    } else if (item.type === "bullet") {
      // Draw a real round vector bullet dot in dark color (zero font encoding dependency)
      setFill(COLOR_BODY_TEXT);
      const bx = MARGIN_L + 6;
      const by = cursorY + 3.5;
      const br = 1.75;
      const bk = 0.55228 * br;
      ops.push(
        `${bx.toFixed(2)} ${(by + br).toFixed(2)} m ` +
          `${(bx + bk).toFixed(2)} ${(by + br).toFixed(2)} ${(bx + br).toFixed(2)} ${(by + bk).toFixed(2)} ${(bx + br).toFixed(2)} ${by.toFixed(2)} c ` +
          `${(bx + br).toFixed(2)} ${(by - bk).toFixed(2)} ${(bx + bk).toFixed(2)} ${(by - br).toFixed(2)} ${bx.toFixed(2)} ${(by - br).toFixed(2)} c ` +
          `${(bx - bk).toFixed(2)} ${(by - br).toFixed(2)} ${(bx - br).toFixed(2)} ${(by - bk).toFixed(2)} ${(bx - br).toFixed(2)} ${by.toFixed(2)} c ` +
          `${(bx - br).toFixed(2)} ${(by + bk).toFixed(2)} ${(bx - br).toFixed(2)} ${(by + br).toFixed(2)} ${bx.toFixed(2)} ${(by + br).toFixed(2)} c ` +
          `f`,
      );

      for (let idx = 0; idx < item.textLines.length; idx++) {
        drawText(item.textLines[idx], MARGIN_L + 14, cursorY, 9.5, "/F1", COLOR_BODY_TEXT);
        cursorY -= 14;
      }
      cursorY -= 2;
    } else if (item.type === "table") {
      // Real Vector Table
      const headerH = 20;
      const rowH = 17;
      let tableY = cursorY - headerH;

      // 1. Draw Table Header
      setFill(COLOR_BRAND_BLUE);
      drawRect(MARGIN_L, tableY, USABLE_W, headerH, true, false);

      let colX = MARGIN_L;
      for (let c = 0; c < item.headers.length; c++) {
        const cw = item.colWidths[c] || USABLE_W / item.headers.length;
        drawText(item.headers[c], colX + 6, tableY + 6, 8.5, "/F2", COLOR_WHITE);
        colX += cw;
      }

      // 2. Draw Data Rows
      for (let r = 0; r < item.rows.length; r++) {
        tableY -= rowH;
        const row = item.rows[r];
        const isZebra = r % 2 === 1;
        const isTotalRow = row.some((c) => c.toLowerCase().includes("total"));

        if (isTotalRow) {
          setFill([0.9, 0.94, 0.98]);
          setStroke(COLOR_BRAND_BLUE);
          setLineWidth(1);
          drawRect(MARGIN_L, tableY, USABLE_W, rowH, true, true);
        } else if (isZebra) {
          setFill(COLOR_LIGHT_BG);
          drawRect(MARGIN_L, tableY, USABLE_W, rowH, true, false);
        }

        // Horizontal gridline
        setStroke(COLOR_GRID_BORDER);
        setLineWidth(0.5);
        drawLine(MARGIN_L, tableY, MARGIN_L + USABLE_W, tableY);

        colX = MARGIN_L;
        for (let c = 0; c < row.length; c++) {
          const cw = item.colWidths[c] || USABLE_W / row.length;
          const font = isTotalRow ? "/F2" : "/F1";
          const textColor = isTotalRow ? COLOR_NAVY : COLOR_BODY_TEXT;
          drawText(row[c], colX + 6, tableY + 5, 8.5, font, textColor);
          colX += cw;
        }
      }

      // Outer table border
      setStroke(COLOR_CARD_BORDER);
      setLineWidth(0.75);
      const totalTableH = headerH + item.rows.length * rowH;
      drawRect(MARGIN_L, cursorY - totalTableH, USABLE_W, totalTableH, false, true);

      cursorY = cursorY - totalTableH - 12;
    } else if (item.type === "signatory_block") {
      // Stacked Signatory & Acceptance layout matching original Word Template
      cursorY -= 6;

      // 1. Company Signer
      const compLines = wrapText(`For ${item.companySigner.company}`, USABLE_W, 10.5, true);
      for (const cl of compLines) {
        drawText(cl, MARGIN_L, cursorY, 10.5, "/F2", COLOR_NAVY);
        cursorY -= 14;
      }
      drawText(item.companySigner.name, MARGIN_L, cursorY, 9.5, "/F2", COLOR_BODY_TEXT);
      cursorY -= 13;
      drawText(item.companySigner.title, MARGIN_L, cursorY, 9, "/F1", COLOR_MUTED_GRAY);
      cursorY -= 16;

      if (hasSigImg) {
        // Draw the uploaded recruiter signature image cleanly with no redundant text below
        const maxSigW = 120;
        const maxSigH = 42;
        let sigW = maxSigW;
        let sigH = (sigW * sigImgDims.height) / (sigImgDims.width || 1);
        if (sigH > maxSigH) {
          sigH = maxSigH;
          sigW = (sigH * (sigImgDims.width || 1)) / (sigImgDims.height || 1);
        }
        cursorY -= sigH;
        ops.push(
          `q ${sigW.toFixed(2)} 0 0 ${sigH.toFixed(2)} ${MARGIN_L.toFixed(2)} ${cursorY.toFixed(2)} cm /SigImg Do Q`,
        );
        cursorY -= 12;
      } else if (item.companySigner.signatureBase64) {
        drawText(
          `[Digitally Signed: ${item.companySigner.name}]`,
          MARGIN_L,
          cursorY,
          9.5,
          "/F2",
          [0.1, 0.2, 0.45],
        );
        cursorY -= 14;
      } else {
        drawText(
          "Signature: ______________________",
          MARGIN_L,
          cursorY,
          9.5,
          "/F1",
          COLOR_BODY_TEXT,
        );
        cursorY -= 14;
      }

      // Company Signatory Date
      const signDate = item.companySigner.date;
      if (signDate) {
        drawText(`Date: ${signDate}`, MARGIN_L, cursorY, 9, "/F1", COLOR_BODY_TEXT);
        cursorY -= 18;
      } else {
        drawText("Date: ______________________", MARGIN_L, cursorY, 9, "/F1", COLOR_BODY_TEXT);
        cursorY -= 18;
      }

      // 2. Candidate Acknowledgement
      drawText("ACKNOWLEDGEMENT", MARGIN_L, cursorY, 11, "/F2", COLOR_NAVY);
      cursorY -= 15;

      const acceptText = `I, ${item.candidateName}, accept the above terms and agree to work with ${item.companySigner.company} as ${item.role} under the conditions stated herein.`;
      const ackWrapped = wrapText(acceptText, USABLE_W, 9.5);
      for (const ackLine of ackWrapped) {
        drawText(ackLine, MARGIN_L, cursorY, 9.5, "/F1", COLOR_BODY_TEXT);
        cursorY -= 13;
      }
      cursorY -= 6;

      // 3. Three-column Signature Table matching Word template: Signature | Date | Place
      const sigRowH = 24;
      const sigTableY = cursorY - sigRowH;
      if (!hasBgImg) {
        setFill(COLOR_LIGHT_BG);
        setStroke(COLOR_CARD_BORDER);
        setLineWidth(0.75);
        drawRect(MARGIN_L, sigTableY, USABLE_W, sigRowH, true, true);
      } else {
        setStroke(COLOR_CARD_BORDER);
        setLineWidth(0.5);
        drawRect(MARGIN_L, sigTableY, USABLE_W, sigRowH, false, true);
      }

      const col3W = USABLE_W / 3;
      // Column dividers
      setStroke(COLOR_CARD_BORDER);
      setLineWidth(0.5);
      drawLine(MARGIN_L + col3W, sigTableY, MARGIN_L + col3W, sigTableY + sigRowH);
      drawLine(MARGIN_L + 2 * col3W, sigTableY, MARGIN_L + 2 * col3W, sigTableY + sigRowH);

      drawText(
        "Signature: __________________",
        MARGIN_L + 8,
        sigTableY + 8,
        8.5,
        "/F1",
        [0.2, 0.25, 0.35],
      );
      drawText(
        "Date: __________________",
        MARGIN_L + col3W + 8,
        sigTableY + 8,
        8.5,
        "/F1",
        [0.2, 0.25, 0.35],
      );
      drawText(
        "Place: __________________",
        MARGIN_L + 2 * col3W + 8,
        sigTableY + 8,
        8.5,
        "/F1",
        [0.2, 0.25, 0.35],
      );

      cursorY = sigTableY - 14;
    }
  }

  return Buffer.from(ops.join("\n"), "latin1");
}

export interface GenerateStyledOfferPdfOptions {
  companyName?: string;
  companyWebsite?: string;
  companyEmail?: string;
  backgroundImageBuffer?: Buffer | Uint8Array | null;
  logoImage?: {
    buffer: Buffer | Uint8Array;
    format: "png" | "jpeg";
    width: number;
    height: number;
    alignment?: "left" | "center" | "right";
  } | null;
  logoAlignment?: "left" | "center" | "right";
  logoImageBuffer?: Buffer | Uint8Array | null;
  signatoryDate?: string;
  signatureBase64?: string;
  isDefaultTemplate?: boolean;
}

/**
 * Generate a production-grade, publication-quality A4 PDF offer letter.
 * Matching the exact visual layout of the Word template with headers, footers, tables, and branding.
 */
export function generateStyledOfferPdf(
  renderedText: string,
  options?: GenerateStyledOfferPdfOptions,
): Buffer {
  const items = parseOfferText(renderedText, {
    signatoryDate: options?.signatoryDate,
    signatureBase64: options?.signatureBase64,
    isDefaultTemplate: options?.isDefaultTemplate,
  });
  const pages = paginateItems(items);
  const totalPages = pages.length;
  const companyName = options?.companyName || "Company";
  const logoAlignment = options?.logoAlignment || options?.logoImage?.alignment || "left";
  const bgImgBuf = options?.backgroundImageBuffer
    ? Buffer.from(options.backgroundImageBuffer)
    : null;
  const hasBgImg = Boolean(bgImgBuf && bgImgBuf.length > 0);

  interface ImageResource {
    width: number;
    height: number;
    format: "jpeg" | "png";
    rgbStream: Buffer;
    alphaStream?: Buffer;
    id: number;
    maskId?: number;
  }

  let logoRes: ImageResource | null = null;
  const rawLogoBuf = options?.logoImage?.buffer || options?.logoImageBuffer;
  if (rawLogoBuf) {
    const lBuf = Buffer.from(rawLogoBuf);
    if (
      lBuf.length > 24 &&
      lBuf[0] === 0x89 &&
      lBuf[1] === 0x50 &&
      lBuf[2] === 0x4e &&
      lBuf[3] === 0x47
    ) {
      const parsedPng = parsePngForPdf(lBuf);
      if (parsedPng) {
        logoRes = {
          width: parsedPng.width,
          height: parsedPng.height,
          format: "png",
          rgbStream: parsedPng.rgbStream,
          alphaStream: parsedPng.alphaStream,
          id: 0,
        };
      }
    } else if (lBuf.length > 4 && lBuf[0] === 0xff && lBuf[1] === 0xd8) {
      const dims = getJpegDimensions(lBuf);
      logoRes = {
        width: dims.width,
        height: dims.height,
        format: "jpeg",
        rgbStream: lBuf,
        id: 0,
      };
    }
  }

  let sigRes: ImageResource | null = null;
  if (options?.signatureBase64 && typeof options.signatureBase64 === "string") {
    const rawB64 = options.signatureBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
    try {
      const decoded = Buffer.from(rawB64, "base64");
      if (
        decoded.length > 24 &&
        decoded[0] === 0x89 &&
        decoded[1] === 0x50 &&
        decoded[2] === 0x4e &&
        decoded[3] === 0x47
      ) {
        const parsedPng = parsePngForPdf(decoded);
        if (parsedPng) {
          sigRes = {
            width: parsedPng.width,
            height: parsedPng.height,
            format: "png",
            rgbStream: parsedPng.rgbStream,
            alphaStream: parsedPng.alphaStream,
            id: 0,
          };
        }
      } else if (decoded.length > 4 && decoded[0] === 0xff && decoded[1] === 0xd8) {
        const dims = getJpegDimensions(decoded);
        sigRes = {
          width: dims.width,
          height: dims.height,
          format: "jpeg",
          rgbStream: decoded,
          id: 0,
        };
      }
    } catch (e) {
      console.warn("Failed to decode signature image:", e);
    }
  }

  // PDF Object layout:
  // 1: Catalog
  // 2: Pages node
  // 3 .. 3 + totalPages - 1 : Page objects
  // 3 + totalPages .. 3 + 2*totalPages - 1 : Content stream objects
  // Font 1: Helvetica (regular)
  // Font 2: Helvetica-Bold (bold)
  // Dynamic allocation for image XObjects
  const font1Id = 3 + 2 * totalPages;
  const font2Id = font1Id + 1;
  let nextObjId = font2Id + 1;

  const bgImgId = hasBgImg ? nextObjId++ : 0;

  if (logoRes) {
    if (logoRes.alphaStream) {
      logoRes.maskId = nextObjId++;
    }
    logoRes.id = nextObjId++;
  }

  if (sigRes) {
    if (sigRes.alphaStream) {
      sigRes.maskId = nextObjId++;
    }
    sigRes.id = nextObjId++;
  }

  const totalObjs = nextObjId;

  const chunks: Buffer[] = [];
  const offsets: number[] = new Array(totalObjs).fill(0);
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

  // --- PDF Header ---
  emitStr("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  // 1: Catalog
  beginObj(1);
  emitStr("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();

  // 2: Pages Node
  const kidsRef = Array.from({ length: totalPages }, (_, i) => `${3 + i} 0 R`).join(" ");
  beginObj(2);
  emitStr(`<< /Type /Pages /Kids [${kidsRef}] /Count ${totalPages} >>\n`);
  endObj();

  // 3..3+totalPages-1 : Page Objects
  for (let i = 0; i < totalPages; i++) {
    const pageId = 3 + i;
    const contentId = 3 + totalPages + i;
    const xObjects: string[] = [];
    if (hasBgImg) xObjects.push(`/BgImg ${bgImgId} 0 R`);
    if (logoRes) xObjects.push(`/LogoImg ${logoRes.id} 0 R`);
    if (sigRes) xObjects.push(`/SigImg ${sigRes.id} 0 R`);
    const xObjStr = xObjects.length > 0 ? ` /XObject << ${xObjects.join(" ")} >>` : "";

    beginObj(pageId);
    emitStr(
      `<< /Type /Page /Parent 2 0 R` +
        ` /MediaBox [0 0 ${PAGE_W} ${PAGE_H}]` +
        ` /Contents ${contentId} 0 R` +
        ` /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >>` +
        xObjStr +
        ` >> >>\n`,
    );
    endObj();
  }

  // Content Streams
  for (let i = 0; i < totalPages; i++) {
    const contentId = 3 + totalPages + i;
    const pageStream = renderPageContent(
      pages[i],
      i + 1,
      totalPages,
      companyName,
      hasBgImg,
      options?.companyWebsite,
      options?.companyEmail,
      Boolean(sigRes),
      sigRes ? { width: sigRes.width, height: sigRes.height } : { width: 400, height: 150 },
      Boolean(logoRes),
      logoRes ? { width: logoRes.width, height: logoRes.height } : { width: 200, height: 50 },
      Boolean(options?.isDefaultTemplate),
      logoAlignment,
    );
    beginObj(contentId);
    emitStr(`<< /Length ${pageStream.length} >>\nstream\n`);
    emit(pageStream);
    emitStr("\nendstream\n");
    endObj();
  }

  // Font 1: Helvetica
  beginObj(font1Id);
  emitStr("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n");
  endObj();

  // Font 2: Helvetica-Bold
  beginObj(font2Id);
  emitStr(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n",
  );
  endObj();

  // Background Image XObject
  if (hasBgImg && bgImgBuf) {
    beginObj(bgImgId);
    emitStr(
      `<< /Type /XObject /Subtype /Image /Width 2480 /Height 3508 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bgImgBuf.length} >>\nstream\n`,
    );
    emit(bgImgBuf);
    emitStr("\nendstream\n");
    endObj();
  }

  // Logo Image XObject
  if (logoRes) {
    if (logoRes.maskId && logoRes.alphaStream) {
      beginObj(logoRes.maskId);
      emitStr(
        `<< /Type /XObject /Subtype /Image /Width ${logoRes.width} /Height ${logoRes.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${logoRes.alphaStream.length} >>\nstream\n`,
      );
      emit(logoRes.alphaStream);
      emitStr("\nendstream\n");
      endObj();
    }
    beginObj(logoRes.id);
    const maskPart = logoRes.maskId ? ` /SMask ${logoRes.maskId} 0 R` : "";
    const filterPart = logoRes.format === "png" ? "/Filter /FlateDecode" : "/Filter /DCTDecode";
    emitStr(
      `<< /Type /XObject /Subtype /Image /Width ${logoRes.width} /Height ${logoRes.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ${filterPart}${maskPart} /Length ${logoRes.rgbStream.length} >>\nstream\n`,
    );
    emit(logoRes.rgbStream);
    emitStr("\nendstream\n");
    endObj();
  }

  // Signature Image XObject
  if (sigRes) {
    if (sigRes.maskId && sigRes.alphaStream) {
      beginObj(sigRes.maskId);
      emitStr(
        `<< /Type /XObject /Subtype /Image /Width ${sigRes.width} /Height ${sigRes.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${sigRes.alphaStream.length} >>\nstream\n`,
      );
      emit(sigRes.alphaStream);
      emitStr("\nendstream\n");
      endObj();
    }
    beginObj(sigRes.id);
    const maskPart = sigRes.maskId ? ` /SMask ${sigRes.maskId} 0 R` : "";
    const filterPart = sigRes.format === "png" ? "/Filter /FlateDecode" : "/Filter /DCTDecode";
    emitStr(
      `<< /Type /XObject /Subtype /Image /Width ${sigRes.width} /Height ${sigRes.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ${filterPart}${maskPart} /Length ${sigRes.rgbStream.length} >>\nstream\n`,
    );
    emit(sigRes.rgbStream);
    emitStr("\nendstream\n");
    endObj();
  }

  // --- Cross-reference Table ---
  const xrefStart = pos;
  emitStr(`xref\n0 ${totalObjs}\n`);
  emitStr("0000000000 65535 f \n");

  for (let i = 1; i < totalObjs; i++) {
    emitStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }

  // --- Trailer ---
  emitStr(`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return Buffer.concat(chunks);
}
