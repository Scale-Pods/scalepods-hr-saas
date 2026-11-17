/**
 * High-Fidelity Branded Offer Letter PDF Generator.
 *
 * Generates corporate, publication-grade PDFs matching the original Word template design:
 * - Branded top header banner with "ScalePods CONFIDENTIAL" badge
 * - Two-column metadata card (Ref No, Issue Date, Candidate Name, Starting Date)
 * - Corporate blue section headings (#1e3a8a)
 * - Real vector-drawn Compensation Structure table (dark blue header, grid borders, zebra striping)
 * - Properly indented bullet points with hanging indent
 * - Two-column Signatory & Candidate Acknowledgement acceptance blocks
 * - Running headers and footers with dynamic "Page X of Y" numbering on all pages
 *
 * 100% Native TypeScript / Node.js — ZERO external APIs, ZERO Gotenberg, ZERO cloud services.
 */

const PAGE_W = 595.28; // A4 width (points)
const PAGE_H = 841.89; // A4 height (points)
const MARGIN_L = 50;
const MARGIN_R = 50;
const MARGIN_T = 62;
const MARGIN_B = 54;
const USABLE_W = PAGE_W - MARGIN_L - MARGIN_R; // ~495.28 pt

// Colors (RGB components 0..1)
const COLOR_NAVY_BANNER = [0.059, 0.09, 0.165]; // #0f172a
const COLOR_BRAND_BLUE = [0.118, 0.227, 0.541]; // #1e3a8a
const COLOR_ACCENT_BLUE = [0.145, 0.388, 0.922]; // #2563eb
const COLOR_BODY_TEXT = [0.118, 0.161, 0.231]; // #1e293b
const COLOR_MUTED_GRAY = [0.392, 0.455, 0.545]; // #64748b
const COLOR_LIGHT_BG = [0.973, 0.98, 0.988]; // #f8fafc
const COLOR_CARD_BORDER = [0.796, 0.835, 0.882]; // #cbd5e1
const COLOR_GRID_BORDER = [0.886, 0.91, 0.941]; // #e2e8f0
const COLOR_WHITE = [1, 1, 1];

function esc(s: string): string {
  return String(s || "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function sanitizeText(text: string): string {
  return text
    .replace(/\u2022/g, "•")
    .replace(/â€¢/g, "•")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/→/g, "->")
    .replace(/\r\n/g, "\n");
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

    // 1. Two-column metadata bar (e.g., | Ref: ... | Date: ... | or | Dear ... | Starting Date: ... |)
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      // Check if this is the start of a multi-row table or a 2-column metadata card
      const isNextLineTable = i + 1 < n && lines[i + 1].trim().startsWith("|");

      if (cells.length === 2 && !isNextLineTable) {
        items.push({
          type: "metadata_card",
          leftLines: [cells[0]],
          rightLines: [cells[1]],
          height: 32,
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

        // Filter out markdown divider rows (| --- | --- |)
        const validRows = parsedRows.filter((r) => !r.every((c) => /^[-:]+$/.test(c)));

        if (validRows.length >= 2) {
          const headers = validRows[0];
          const dataRows = validRows.slice(1);
          const colCount = Math.max(headers.length, ...dataRows.map((r) => r.length));

          // Calculate column widths
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
        height: 32,
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
        height: 24,
      });
      i++;
      continue;
    }

    // 4. Signatory section detection
    if (line.startsWith("For ") || line.includes("ACKNOWLEDGEMENT")) {
      // Gather lines for signature block
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
        height: 125,
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
        height: wrapped.length * 14 + 4,
      });
      i++;
      continue;
    }

    // 6. Regular Body Paragraph
    const wrapped = wrapText(line, USABLE_W, 10);
    items.push({
      type: "paragraph",
      lines: wrapped,
      height: wrapped.length * 14 + 6,
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

  // Page 1 has top banner (52pt) and extra top padding
  const page1UsableH = PAGE_H - 120 - MARGIN_B;
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
): Buffer {
  const ops: string[] = [];

  // Helper operators
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

  // --- HEADER SECTION ---
  if (pageNum === 1) {
    // 1. Top Branded Navy Banner
    const bannerH = 52;
    const bannerY = PAGE_H - bannerH;

    setFill(COLOR_NAVY_BANNER);
    drawRect(0, bannerY, PAGE_W, bannerH, true, false);

    // Accent line below banner
    setFill(COLOR_ACCENT_BLUE);
    drawRect(0, bannerY - 3, PAGE_W, 3, true, false);

    // Brand Name: ScalePods
    drawText(companyName, MARGIN_L, bannerY + 26, 17, "/F2", COLOR_WHITE);
    // Subtitle
    drawText(
      "CONFIDENTIAL EMPLOYMENT AGREEMENT",
      MARGIN_L,
      bannerY + 12,
      7.5,
      "/F1",
      [0.6, 0.7, 0.85],
    );

    // Pill Badge on right
    const badgeW = 95;
    const badgeH = 20;
    const badgeX = PAGE_W - MARGIN_R - badgeW;
    const badgeY = bannerY + 16;
    setFill([0.15, 0.25, 0.45]);
    drawRect(badgeX, badgeY, badgeW, badgeH, true, false);
    drawText("OFFICIAL OFFER", badgeX + 11, badgeY + 6, 8, "/F2", COLOR_WHITE);
  } else {
    // Running header on page 2+
    const headerY = PAGE_H - 30;
    drawText(
      "ScalePods Partner — Private & Confidential",
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

  // --- RUNNING FOOTER (ALL PAGES) ---
  const footerY = 38;
  setStroke(COLOR_GRID_BORDER);
  setLineWidth(0.75);
  drawLine(MARGIN_L, footerY + 12, PAGE_W - MARGIN_R, footerY + 12);

  drawText(
    "Private & Confidential — ScalePods Employment Agreement",
    MARGIN_L,
    footerY,
    8,
    "/F1",
    COLOR_MUTED_GRAY,
  );
  const pageStr = `Page ${pageNum} of ${totalPages}`;
  drawText(pageStr, PAGE_W - MARGIN_R - 55, footerY, 8.5, "/F2", [0.2, 0.25, 0.35]);

  // --- CONTENT RENDERING ---
  let cursorY = pageNum === 1 ? PAGE_H - 78 : PAGE_H - MARGIN_T;

  for (const item of pageItems) {
    if (item.type === "title") {
      cursorY -= 12;
      drawText(item.text, MARGIN_L, cursorY, 13.5, "/F2", COLOR_NAVY_BANNER);

      // Blue accent line under title
      const titleWidth = approxTextWidth(item.text, 13.5, true);
      setFill(COLOR_BRAND_BLUE);
      drawRect(MARGIN_L, cursorY - 4, Math.min(titleWidth, USABLE_W), 2, true, false);
      cursorY -= 16;
    } else if (item.type === "metadata_card") {
      const cardH = item.height;
      const cardY = cursorY - cardH;

      // Card Background
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

      cursorY = cardY - 10;
    } else if (item.type === "heading") {
      cursorY -= 8;
      drawText(item.text, MARGIN_L, cursorY, 11, "/F2", COLOR_BRAND_BLUE);
      cursorY -= 15;
    } else if (item.type === "paragraph") {
      for (const line of item.lines) {
        drawText(line, MARGIN_L, cursorY, 9.5, "/F1", COLOR_BODY_TEXT);
        cursorY -= 14;
      }
      cursorY -= 4;
    } else if (item.type === "bullet") {
      // Draw bullet point symbol
      drawText("•", MARGIN_L + 4, cursorY, 10, "/F2", COLOR_BRAND_BLUE);
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
          const textColor = isTotalRow ? COLOR_NAVY_BANNER : COLOR_BODY_TEXT;
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
      const blockH = item.height;
      const blockY = cursorY - blockH;

      // Two side-by-side signature cards
      const colW = (USABLE_W - 14) / 2;

      // --- Left Box: Company Signatory ---
      setFill(COLOR_LIGHT_BG);
      setStroke(COLOR_CARD_BORDER);
      setLineWidth(0.75);
      drawRect(MARGIN_L, blockY, colW, blockH, true, true);

      // Header inside left box
      drawText(
        `For ${item.companySigner.company}`,
        MARGIN_L + 10,
        blockY + blockH - 18,
        9.5,
        "/F2",
        COLOR_NAVY_BANNER,
      );
      drawText(
        item.companySigner.name,
        MARGIN_L + 10,
        blockY + blockH - 33,
        9,
        "/F2",
        COLOR_BODY_TEXT,
      );
      drawText(
        item.companySigner.title,
        MARGIN_L + 10,
        blockY + blockH - 46,
        8.5,
        "/F1",
        COLOR_MUTED_GRAY,
      );

      // Signature line
      setStroke(COLOR_CARD_BORDER);
      setLineWidth(0.75);
      drawLine(MARGIN_L + 10, blockY + 36, MARGIN_L + colW - 10, blockY + 36);
      drawText("Authorized Signature", MARGIN_L + 10, blockY + 24, 7.5, "/F1", COLOR_MUTED_GRAY);
      drawText(
        "Date: ____________________",
        MARGIN_L + 10,
        blockY + 10,
        8,
        "/F1",
        [0.3, 0.35, 0.4],
      );

      // --- Right Box: Candidate Acceptance ---
      const rightX = MARGIN_L + colW + 14;
      setFill(COLOR_LIGHT_BG);
      setStroke(COLOR_CARD_BORDER);
      setLineWidth(0.75);
      drawRect(rightX, blockY, colW, blockH, true, true);

      drawText(
        "ACKNOWLEDGEMENT & ACCEPTANCE",
        rightX + 10,
        blockY + blockH - 18,
        9,
        "/F2",
        [0.1, 0.3, 0.6],
      );
      drawText(
        `I, ${item.candidateName}, accept this offer`,
        rightX + 10,
        blockY + blockH - 33,
        8.5,
        "/F1",
        COLOR_BODY_TEXT,
      );
      drawText(
        `Position: ${item.role}`,
        rightX + 10,
        blockY + blockH - 46,
        8,
        "/F1",
        COLOR_MUTED_GRAY,
      );

      // Signature line
      drawLine(rightX + 10, blockY + 36, rightX + colW - 10, blockY + 36);
      drawText("Candidate Signature", rightX + 10, blockY + 24, 7.5, "/F1", COLOR_MUTED_GRAY);
      drawText(
        "Date: ____________   Place: ____________",
        rightX + 10,
        blockY + 10,
        7.5,
        "/F1",
        [0.3, 0.35, 0.4],
      );

      cursorY = blockY - 14;
    }
  }

  return Buffer.from(ops.join("\n"), "latin1");
}

export interface GenerateStyledOfferPdfOptions {
  companyName?: string;
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

  // PDF Object layout:
  // 1: Catalog
  // 2: Pages node
  // 3 .. 3 + totalPages - 1 : Page objects
  // 3 + totalPages .. 3 + 2*totalPages - 1 : Content stream objects
  // Font 1: Helvetica (regular)
  // Font 2: Helvetica-Bold (bold)
  const font1Id = 3 + 2 * totalPages;
  const font2Id = font1Id + 1;
  const totalObjs = font2Id + 1;

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
        ` /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >> >>\n`,
    );
    endObj();
  }

  // Content Streams
  for (let i = 0; i < totalPages; i++) {
    const contentId = 3 + totalPages + i;
    const pageStream = renderPageContent(pages[i], i + 1, totalPages, companyName);
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
