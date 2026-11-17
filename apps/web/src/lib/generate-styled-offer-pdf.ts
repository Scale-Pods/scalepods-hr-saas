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

import fs from "node:fs";
import path from "node:path";

let cachedDefaultBgBuffer: Buffer | null = null;

export function getDefaultLetterheadBuffer(): Buffer | null {
  if (cachedDefaultBgBuffer) return cachedDefaultBgBuffer;
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), "apps/web/src/lib/offers/assets/scalepods-letterhead.jpg"),
      path.resolve(process.cwd(), "src/lib/offers/assets/scalepods-letterhead.jpg"),
      path.join(__dirname, "offers/assets/scalepods-letterhead.jpg"),
      path.join(__dirname, "assets/scalepods-letterhead.jpg"),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        cachedDefaultBgBuffer = fs.readFileSync(p);
        return cachedDefaultBgBuffer;
      }
    }
  } catch {
    // Non-fatal if fs access is restricted in edge/browser
  }
  return null;
}

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

export function numberToWords(num: number | string): string {
  const n = parseInt(String(num).replace(/[^0-9]/g, ""), 10);
  if (Number.isNaN(n) || n === 0) return "Zero Rupees Only";

  const units = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function convertBelowThousand(val: number): string {
    let str = "";
    if (val >= 100) {
      str += `${units[Math.floor(val / 100)]} Hundred `;
      val %= 100;
    }
    if (val >= 20) {
      str += `${tens[Math.floor(val / 10)]} `;
      val %= 10;
    }
    if (val > 0) {
      str += `${units[val]} `;
    }
    return str.trim();
  }

  let remaining = n;
  let result = "";

  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  if (crore > 0) {
    result += `${convertBelowThousand(crore)} Crore `;
  }

  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  if (lakh > 0) {
    result += `${convertBelowThousand(lakh)} Lakh `;
  }

  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  if (thousand > 0) {
    result += `${convertBelowThousand(thousand)} Thousand `;
  }

  if (remaining > 0) {
    result += `${convertBelowThousand(remaining)} `;
  }

  return `${result.trim()} Rupees Only`.replace(/\s+/g, " ");
}

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

function approxTextWidth(text: string, size: number, isBold = false): number {
  const avgFactor = isBold ? 0.57 : 0.52;
  return text.length * size * avgFactor;
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
  | {
      type: "table";
      headers: string[];
      rows: string[][];
      colWidths: number[];
      height: number;
    }
  | {
      type: "signatory_block";
      companySigner: { name: string; title: string; company: string };
      candidateName: string;
      role: string;
      height: number;
    }
  | { type: "spacer"; height: number };

/**
 * Parse structured offer letter text into printable visual items.
 */
function parseOfferText(rawText: string): RenderItem[] {
  const cleaned = sanitizeText(rawText);
  const lines = cleaned.split("\n");
  const items: RenderItem[] = [];

  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = lines[i].trim();

    if (!line) {
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
        height: 26,
      });
      i += 2;
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
        height: 26,
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
          height: 30,
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

    // 2. Main Title (e.g., APPOINTMENT LETTER / INTERNSHIP APPOINTMENT LETTER)
    if (
      line.toUpperCase().includes("APPOINTMENT LETTER") ||
      line.toUpperCase().includes("OFFER OF EMPLOYMENT") ||
      line.toUpperCase().includes("EMPLOYMENT OFFER")
    ) {
      items.push({
        type: "title",
        text: line,
        height: 30,
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
      items.push({
        type: "heading",
        text: line,
        height: 22,
      });
      i++;
      continue;
    }

    // 4. Signatory section detection
    if (line.startsWith("For ") || line.includes("ACKNOWLEDGEMENT")) {
      const sigLines: string[] = [line];
      i++;
      while (i < n && !lines[i].trim().startsWith("|") && sigLines.length < 15) {
        if (lines[i].trim()) {
          sigLines.push(lines[i].trim());
        }
        i++;
      }

      let companyName = "ScalePods Partner";
      let signerName = "Authorized Signatory";
      let signerTitle = "Talent Acquisition Lead";
      let candidateName = "Candidate";
      let role = "Team Member";

      const forLine = sigLines.find((l) => l.startsWith("For "));
      if (forLine) {
        companyName = forLine.replace(/^For\s+/, "").trim();
      }

      const ackIdx = sigLines.findIndex((l) => l.includes("ACKNOWLEDGEMENT"));
      if (ackIdx !== -1 && ackIdx + 1 < sigLines.length) {
        const acceptLine = sigLines[ackIdx + 1];
        const match = acceptLine.match(/I,\s*([^,]+),\s*accept.*as\s*([^u]+)\s*under/i);
        if (match) {
          candidateName = match[1].trim();
          role = match[2].trim();
        }
      }

      if (forLine) {
        const forIdx = sigLines.indexOf(forLine);
        if (forIdx + 1 < sigLines.length && !sigLines[forIdx + 1].includes("ACKNOWLEDGEMENT")) {
          signerName = sigLines[forIdx + 1];
        }
        if (forIdx + 2 < sigLines.length && !sigLines[forIdx + 2].includes("ACKNOWLEDGEMENT")) {
          signerTitle = sigLines[forIdx + 2];
        }
      }

      items.push({
        type: "signatory_block",
        companySigner: {
          name: signerName,
          title: signerTitle,
          company: companyName,
        },
        candidateName,
        role,
        height: 145,
      });
      continue;
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
    const wrapped = wrapText(line, USABLE_W, 10);
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
      // Clean Corporate White Header matching Word Template
      const headerTop = PAGE_H - 42;

      // Brand Name: ScalePods
      drawText(companyName, MARGIN_L, headerTop, 18, "/F2", COLOR_NAVY);
      // Subtitle
      drawText(
        "CONFIDENTIAL EMPLOYMENT AGREEMENT",
        MARGIN_L,
        headerTop - 13,
        8,
        "/F1",
        COLOR_MUTED_GRAY,
      );

      // Right pill badge
      const badgeW = 90;
      const badgeH = 18;
      const badgeX = PAGE_W - MARGIN_R - badgeW;
      const badgeY = headerTop - 7;
      setFill([0.94, 0.96, 0.98]);
      setStroke(COLOR_CARD_BORDER);
      setLineWidth(0.75);
      drawRect(badgeX, badgeY, badgeW, badgeH, true, true);
      drawText("OFFICIAL OFFER", badgeX + 11, badgeY + 5, 7.5, "/F2", COLOR_BRAND_BLUE);

      // Clean blue accent divider rule underneath header
      setFill(COLOR_ACCENT_BLUE);
      drawRect(MARGIN_L, headerTop - 22, USABLE_W, 1.5, true, false);
    } else {
      // Running header on page 2+
      const headerY = PAGE_H - 30;
      drawText(
        "ScalePods Partner - Private & Confidential",
        MARGIN_L,
        headerY,
        8,
        "/F1",
        [0.45, 0.5, 0.6],
      );
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
    const footerText = `${companyName}   |   ${companyWebsite || "www.scalepods.com"}   |   ${companyEmail || "contact@scalepods.com"}`;
    const footerTextW = approxTextWidth(footerText, 7.5);
    const footerX = Math.max(MARGIN_L, (PAGE_W - footerTextW) / 2);
    drawText(footerText, footerX, footerY, 7.5, "/F1", [0.45, 0.45, 0.45]);

    const pageStr = `Page ${pageNum} of ${totalPages}`;
    drawText(pageStr, PAGE_W - MARGIN_R - 45, footerY, 7.5, "/F2", [0.35, 0.35, 0.35]);
  } else {
    drawText(
      "Private & Confidential - ScalePods Employment Agreement",
      MARGIN_L,
      footerY,
      8,
      "/F1",
      COLOR_MUTED_GRAY,
    );
    const pageStr = `Page ${pageNum} of ${totalPages}`;
    drawText(pageStr, PAGE_W - MARGIN_R - 55, footerY, 8.5, "/F2", [0.2, 0.25, 0.35]);
  }

  // --- CONTENT RENDERING ---
  let cursorY =
    pageNum === 1
      ? hasBgImg
        ? PAGE_H - 85
        : PAGE_H - 85
      : hasBgImg
        ? PAGE_H - 75
        : PAGE_H - MARGIN_T;

  for (const item of pageItems) {
    if (item.type === "title") {
      cursorY -= 8;
      drawText(item.text, MARGIN_L, cursorY, 13.5, "/F2", COLOR_NAVY);

      // Blue accent line under title
      const titleWidth = approxTextWidth(item.text, 13.5, true);
      setFill(COLOR_BRAND_BLUE);
      drawRect(MARGIN_L, cursorY - 4, Math.min(titleWidth, USABLE_W), 2, true, false);
      cursorY -= 15;
    } else if (item.type === "metadata_card") {
      const cardH = item.height;
      const cardY = cursorY - cardH;

      // Card Background & Border
      setFill(COLOR_LIGHT_BG);
      setStroke(COLOR_CARD_BORDER);
      setLineWidth(0.75);
      drawRect(MARGIN_L, cardY, USABLE_W, cardH, true, true);

      // Left column
      if (item.leftLines.length > 0) {
        drawText(
          item.leftLines[0],
          MARGIN_L + 12,
          cardY + cardH / 2 - 3,
          9.5,
          "/F2",
          [0.1, 0.15, 0.25],
        );
      }
      // Right column
      if (item.rightLines.length > 0) {
        drawText(
          item.rightLines[0],
          MARGIN_L + USABLE_W / 2 + 10,
          cardY + cardH / 2 - 3,
          9.5,
          "/F2",
          [0.1, 0.15, 0.25],
        );
      }

      cursorY = cardY - 9;
    } else if (item.type === "heading") {
      cursorY -= 7;
      drawText(item.text, MARGIN_L, cursorY, 11, "/F2", COLOR_BRAND_BLUE);
      cursorY -= 14;
    } else if (item.type === "paragraph") {
      for (const line of item.lines) {
        drawText(line, MARGIN_L, cursorY, 9.5, "/F1", COLOR_BODY_TEXT);
        cursorY -= 14;
      }
      cursorY -= 3;
    } else if (item.type === "bullet") {
      // Draw a real vector dot (zero font encoding dependency, NO '?')
      setFill(COLOR_BRAND_BLUE);
      drawRect(MARGIN_L + 4, cursorY + 2.5, 3.5, 3.5, true, false);

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
      drawText(`For ${item.companySigner.company}`, MARGIN_L, cursorY, 10.5, "/F2", COLOR_NAVY);
      cursorY -= 14;
      drawText(item.companySigner.name, MARGIN_L, cursorY, 9.5, "/F2", COLOR_BODY_TEXT);
      cursorY -= 13;
      drawText(item.companySigner.title, MARGIN_L, cursorY, 9, "/F1", COLOR_MUTED_GRAY);
      cursorY -= 16;
      drawText(
        "Signature: ______________________     Date: _______________",
        MARGIN_L,
        cursorY,
        9.5,
        "/F1",
        COLOR_BODY_TEXT,
      );
      cursorY -= 20;

      // 2. Candidate Acknowledgement
      drawText("ACKNOWLEDGEMENT", MARGIN_L, cursorY, 11, "/F2", COLOR_NAVY);
      const ackWidth = approxTextWidth("ACKNOWLEDGEMENT", 11, true);
      setFill(COLOR_BRAND_BLUE);
      drawRect(MARGIN_L, cursorY - 3, ackWidth, 1.5, true, false);
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
      setFill(COLOR_LIGHT_BG);
      setStroke(COLOR_CARD_BORDER);
      setLineWidth(0.75);
      drawRect(MARGIN_L, sigTableY, USABLE_W, sigRowH, true, true);

      const col3W = USABLE_W / 3;
      // Column dividers
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
  backgroundImageBuffer?: Buffer | Uint8Array;
}

/**
 * Generate a production-grade, publication-quality A4 PDF offer letter.
 * Matching the exact visual layout of the Word template with headers, footers, tables, and branding.
 */
export function generateStyledOfferPdf(
  renderedText: string,
  options?: GenerateStyledOfferPdfOptions,
): Buffer {
  const items = parseOfferText(renderedText);
  const pages = paginateItems(items);
  const totalPages = pages.length;
  const companyName = options?.companyName || "ScalePods Partner";
  const bgImgBuf = options?.backgroundImageBuffer
    ? Buffer.from(options.backgroundImageBuffer)
    : null;
  const hasBgImg = Boolean(bgImgBuf && bgImgBuf.length > 0);

  // PDF Object layout:
  // 1: Catalog
  // 2: Pages node
  // 3 .. 3 + totalPages - 1 : Page objects
  // 3 + totalPages .. 3 + 2*totalPages - 1 : Content stream objects
  // Font 1: Helvetica (regular)
  // Font 2: Helvetica-Bold (bold)
  // [Optional] Background Image XObject
  const font1Id = 3 + 2 * totalPages;
  const font2Id = font1Id + 1;
  const bgImgId = hasBgImg ? font2Id + 1 : 0;
  const totalObjs = hasBgImg ? bgImgId + 1 : font2Id + 1;

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
    beginObj(pageId);
    emitStr(
      `<< /Type /Page /Parent 2 0 R` +
        ` /MediaBox [0 0 ${PAGE_W} ${PAGE_H}]` +
        ` /Contents ${contentId} 0 R` +
        ` /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >>` +
        (hasBgImg ? ` /XObject << /BgImg ${bgImgId} 0 R >>` : "") +
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
