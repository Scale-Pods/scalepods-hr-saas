import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

const PAGE_W = 595.28; // A4 width in pt
const PAGE_H = 841.89; // A4 height in pt
const MARGIN_X = 54;
const MARGIN_TOP = 72; // Extra top margin for the header area
const MARGIN_BOTTOM = 60;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

// Navy brand colours (matches the DOCX template)
const NAVY = rgb(0.059, 0.161, 0.259); // #0f2942
const BLUE = rgb(0.078, 0.247, 0.569); // #143f91
const MID_BLUE = rgb(0.118, 0.275, 0.447); // #1e4672
const TEXT_DARK = rgb(0.09, 0.12, 0.18);
const TEXT_GREY = rgb(0.42, 0.49, 0.58);

function sanitizeWinAnsi(text: string): string {
  return text
    .replace(/\u20B9/g, "INR ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "*")
    .replace(/\u00B7/g, "-") // middle dot
    .replace(/\u2019/g, "'")
    .replace(/\u00e2\u20ac\u2122/g, "'") // UTF-8 misread artifacts
    .replace(/\u00e2\u20ac\u201d/g, "-")
    .replace(/\u00e2\u20ac\u00a2/g, "*")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ");
}

function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

interface TextRun {
  text: string;
  bold: boolean;
}

type HtmlBlock =
  | { kind: "heading"; level: 1 | 2 | 3; runs: TextRun[] }
  | { kind: "paragraph"; runs: TextRun[] }
  | { kind: "list_item"; bullet: string; runs: TextRun[] }
  | {
      kind: "table";
      rows: Array<{ isHeader: boolean; cells: TextRun[][] }>;
      isLayoutTable: boolean;
    }
  | { kind: "page_break" };

/**
 * Returns true if this table is a one-row directive/conditional table
 * (e.g. "Show this section only when: LETTER_TYPE = fulltime") or a
 * developer-only legend/notes table. These should be skipped in PDF output.
 */
function isDirectiveTable(tableHtml: string): boolean {
  const textContent = tableHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Conditional directive patterns
  if (/Show this section only when/i.test(textContent)) return true;
  if (/LETTERHEAD\s*\/\s*LOGO\s*AREA/i.test(textContent)) return true;
  if (/Attach client letterhead as background image/i.test(textContent)) return true;
  if (/\{\{VARIABLE\}\}\s*=\s*dynamic field/i.test(textContent)) return true;
  if (/\{\{COMPANY_LOGO_PATH\}\}/i.test(textContent)) return true;
  if (/LETTER_TYPE\s*=\s*(fulltime|intern)/i.test(textContent)) return true;

  // Single-cell, single-row tables that only contain a directive
  const rows = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  if (rows.length === 1) {
    const cells = rows[0].match(/<(?:th|td)[^>]*>[\s\S]*?<\/(?:th|td)>/gi) ?? [];
    if (cells.length === 1) {
      const cellText = cells[0].replace(/<[^>]+>/g, " ").trim();
      // If the single cell contains "Show this section" or similar
      if (
        /Show (this section|incentive line)/i.test(cellText) ||
        /LETTER_TYPE/i.test(cellText) ||
        /LETTERHEAD/i.test(cellText)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns true if this is a simple 2-column layout table used as a header
 * (e.g. "Ref: {{REF_NO}} | Date: {{ISSUE_DATE}}" or "Dear {{NAME}} | Starting Date: {{DATE}}")
 * These should be rendered as a small info-row, not a full data table.
 */
function isLayoutTable(tableHtml: string): boolean {
  const rows = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  if (rows.length !== 1) return false;
  const cells = rows[0].match(/<(?:th|td)[^>]*>[\s\S]*?<\/(?:th|td)>/gi) ?? [];
  if (cells.length < 2 || cells.length > 3) return false;
  // No thead = not a data table
  if (/<thead/i.test(tableHtml)) return false;
  return true;
}

function parseInlineRuns(htmlFragment: string): TextRun[] {
  const normalized = htmlFragment
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:span|em|i|u|a)[^>]*>/gi, "");

  const runs: TextRun[] = [];
  const parts = normalized.split(/(<\/?(?:strong|b)(?:\s[^>]*)?>)/gi);
  let bold = false;

  for (const part of parts) {
    if (!part) continue;
    if (/^<(?:strong|b)(?:\s[^>]*)?>$/i.test(part)) {
      bold = true;
      continue;
    }
    if (/^<\/(?:strong|b)>$/i.test(part)) {
      bold = false;
      continue;
    }
    const clean = sanitizeWinAnsi(decodeEntities(part.replace(/<[^>]+>/g, "")));
    if (clean) runs.push({ text: clean, bold });
  }

  return runs;
}

function parseTableBlock(tableHtml: string): HtmlBlock {
  const rows: Array<{ isHeader: boolean; cells: TextRun[][] }> = [];
  const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  for (let rIdx = 0; rIdx < rowMatches.length; rIdx++) {
    const rowHtml = rowMatches[rIdx];
    const cellMatches = rowHtml.match(/<(?:th|td)[^>]*>[\s\S]*?<\/(?:th|td)>/gi) ?? [];
    const isHeader = rIdx === 0 && /<th[\s>]/i.test(rowHtml);
    const cells = cellMatches.map((cellHtml) => {
      const inner = cellHtml.replace(/^<(?:th|td)[^>]*>/i, "").replace(/<\/(?:th|td)>$/i, "");
      const runs = parseInlineRuns(inner);
      return isHeader ? runs.map((r) => ({ ...r, bold: true })) : runs;
    });
    if (cells.length > 0) rows.push({ isHeader, cells });
  }

  return { kind: "table", rows, isLayoutTable: isLayoutTable(tableHtml) };
}

/**
 * Heuristic: is this paragraph actually a section heading?
 * Mammoth outputs DOCX headings/bold section titles as <p><strong>TEXT</strong></p>
 * We detect these patterns:
 *   - ALL CAPS text (e.g. "APPOINTMENT LETTER", "TERMS OF ENGAGEMENT")
 *   - Numbered headings like "1. Role & Scope", "2. Compensation & Benefits"
 *   - Known fixed headings ("ACKNOWLEDGEMENT", "For {{COMPANY_NAME}}", etc.)
 */
function detectHeadingLevel(runs: TextRun[]): 1 | 2 | 3 | null {
  if (runs.length === 0) return null;

  // Only bold runs qualify as headings
  if (!runs.every((r) => r.bold)) return null;

  const text = runs
    .map((r) => r.text)
    .join("")
    .trim();
  if (!text) return null;

  // Level 1: Major ALL_CAPS headings (no lowercase letters, 3+ chars, not a placeholder alone)
  const hasLowercase = /[a-z]/.test(text);
  if (!hasLowercase && text.length >= 3 && !/^\{\{/.test(text)) {
    // Check it's not just punctuation or numbers
    if (/[A-Z]{2,}/.test(text)) return 1;
  }

  // Level 2: Numbered section headings like "1. Role & Scope", "2. Compensation & Benefits"
  if (/^\d+\.\s+[A-Z]/.test(text)) return 2;

  // Level 2: Known fixed headings
  if (
    /^(ACKNOWLEDGEMENT|For\s+|We look forward to|INTERNSHIP|APPOINTMENT)/i.test(text) ||
    /^(TERMS OF|CODE OF|INTELLECTUAL PROPERTY)/i.test(text)
  ) {
    return 2;
  }

  // Level 3: Short bold phrases that look like subheadings (Title Case, 2-6 words)
  const words = text.split(/\s+/);
  if (
    words.length >= 2 &&
    words.length <= 6 &&
    /^[A-Z]/.test(text) &&
    !text.includes("{{") &&
    !text.includes(":") // labels with colons are not headings
  ) {
    // Only promote if most words are Title Case or uppercase
    const titleCaseCount = words.filter((w) => /^[A-Z]/.test(w)).length;
    if (titleCaseCount >= words.length * 0.7) return 3;
  }

  return null;
}

function parseHtmlToBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];
  // Extract top-level blocks in document order
  const blockRegex =
    /<table[^>]*>[\s\S]*?<\/table>|<h([1-3])[^>]*>[\s\S]*?<\/h\1>|<ul[^>]*>[\s\S]*?<\/ul>|<ol[^>]*>[\s\S]*?<\/ol>|<p[^>]*>[\s\S]*?<\/p>/gi;

  let lastIndex = 0;

  for (const match of html.matchAll(blockRegex)) {
    const matchIndex = match.index ?? 0;
    const gap = html
      .slice(lastIndex, matchIndex)
      .replace(/<[^>]+>/g, "")
      .trim();
    if (gap) {
      blocks.push({ kind: "paragraph", runs: parseInlineRuns(gap) });
    }
    lastIndex = matchIndex + match[0].length;

    const full = match[0];
    if (/^<table/i.test(full)) {
      // Skip directive/conditional tables entirely
      if (isDirectiveTable(full)) continue;

      blocks.push(parseTableBlock(full));
    } else if (/^<h([1-3])/i.test(full)) {
      const level = Number(match[1]) as 1 | 2 | 3;
      const inner = full.replace(/^<h[1-3][^>]*>/i, "").replace(/<\/h[1-3]>$/i, "");
      const runs = parseInlineRuns(inner).map((r) => ({ ...r, bold: true }));
      const text = runs
        .map((r) => r.text)
        .join(" ")
        .trim();
      if (/^2\.\s+Compensation/i.test(text) || /^7\.\s+Termination/i.test(text)) {
        blocks.push({ kind: "page_break" });
      }
      if (runs.length > 0) blocks.push({ kind: "heading", level, runs });
    } else if (/^<(ul|ol)/i.test(full)) {
      const isOrdered = /^<ol/i.test(full);
      const items = full.match(/<li[^>]*>[\s\S]*?<\/li>/gi) ?? [];
      items.forEach((li, idx) => {
        const inner = li.replace(/^<li[^>]*>/i, "").replace(/<\/li>$/i, "");
        const runs = parseInlineRuns(inner);
        if (runs.length > 0) {
          blocks.push({
            kind: "list_item",
            bullet: isOrdered ? `${idx + 1}.` : "*",
            runs,
          });
        }
      });
    } else {
      // <p> element — check if it should be promoted to a heading
      const inner = full.replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "");
      const runs = parseInlineRuns(inner);
      if (runs.some((r) => r.text.trim())) {
        const text = runs
          .map((r) => r.text)
          .join(" ")
          .trim();
        // Section-based page breaks matching the 3-page template structure:
        // Page 1 ends after 1. Role & Scope -> Section 2 starts Page 2
        // Page 2 ends after 6. Code of Conduct -> Section 7 starts Page 3
        if (/^2\.\s+Compensation/i.test(text) || /^7\.\s+Termination/i.test(text)) {
          blocks.push({ kind: "page_break" });
        }

        const headingLevel = detectHeadingLevel(runs);
        if (headingLevel !== null) {
          blocks.push({ kind: "heading", level: headingLevel, runs });
        } else {
          blocks.push({ kind: "paragraph", runs });
        }
      }
    }
  }

  const tail = html
    .slice(lastIndex)
    .replace(/<[^>]+>/g, "")
    .trim();
  if (tail) {
    blocks.push({ kind: "paragraph", runs: parseInlineRuns(tail) });
  }

  return blocks;
}

interface WrappedLine {
  segments: Array<{ text: string; bold: boolean }>;
}

function wrapRuns(
  runs: TextRun[],
  maxWidth: number,
  fontSize: number,
  regularFont: PDFFont,
  boldFont: PDFFont,
): WrappedLine[] {
  const lines: WrappedLine[] = [];
  let currentSegments: Array<{ text: string; bold: boolean }> = [];
  let currentWidth = 0;

  const pushLine = () => {
    lines.push({ segments: currentSegments });
    currentSegments = [];
    currentWidth = 0;
  };

  for (const run of runs) {
    const font = run.bold ? boldFont : regularFont;
    const rawLines = run.text.split("\n");

    for (let li = 0; li < rawLines.length; li++) {
      if (li > 0) pushLine();
      const tokens = rawLines[li].split(/(\s+)/).filter(Boolean);

      for (const tok of tokens) {
        const w = font.widthOfTextAtSize(tok, fontSize);
        if (currentWidth > 0 && currentWidth + w > maxWidth && tok.trim()) {
          pushLine();
        }
        if (currentWidth === 0 && !tok.trim()) continue;
        const last = currentSegments[currentSegments.length - 1];
        if (last && last.bold === run.bold) {
          last.text += tok;
        } else {
          currentSegments.push({ text: tok, bold: run.bold });
        }
        currentWidth += w;
      }
    }
  }

  if (currentSegments.length > 0 || lines.length === 0) {
    lines.push({ segments: currentSegments });
  }
  return lines;
}

/**
 * Draw the company letterhead/header area on Page 1.
 * Mimics the branded ScalePods style: full-width navy top bar, company name, divider.
 */
function drawLetterhead(
  page: PDFPage,
  boldFont: PDFFont,
  regularFont: PDFFont,
  companyName = "ScalePods Technologies",
): void {
  // Full-width top navy bar
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 24,
    width: PAGE_W,
    height: 24,
    color: NAVY,
  });

  // Company name in the bar (white)
  const nameText = sanitizeWinAnsi(companyName);
  page.drawText(nameText, {
    x: MARGIN_X,
    y: PAGE_H - 17,
    size: 11,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  // "CONFIDENTIAL" label right-aligned in the bar
  const confText = "CONFIDENTIAL";
  const confW = regularFont.widthOfTextAtSize(confText, 7);
  page.drawText(confText, {
    x: PAGE_W - MARGIN_X - confW,
    y: PAGE_H - 16,
    size: 7,
    font: regularFont,
    color: rgb(0.8, 0.88, 1.0),
  });

  // Thin blue underline below the bar
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 26,
    width: PAGE_W,
    height: 2,
    color: BLUE,
  });
}

/**
 * Render structured HTML (from DOCX/mammoth or HTML templates) into a clean,
 * properly typeset multi-page A4 PDF with real tables, headings, bold spans,
 * and automatic text reflow.
 *
 * Key improvements over previous version:
 * - Directive/conditional tables are detected and skipped
 * - <p><strong>ALL CAPS</strong></p> paragraphs promoted to heading blocks
 * - Numbered section headings (1. Role & Scope) promoted to h2
 * - Branded navy letterhead bar on Page 1
 * - Layout tables (Ref/Date header rows) rendered as inline key-value pairs
 */
export async function generateHtmlOfferPdf(html: string, companyName?: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const blocks = parseHtmlToBlocks(html);
  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let cursorY = PAGE_H - MARGIN_TOP;

  // Draw letterhead on Page 1
  drawLetterhead(page, boldFont, regularFont, companyName);

  const addNewPage = () => {
    if (cursorY >= PAGE_H - MARGIN_TOP - 10) return; // Prevent creating empty extra pages
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    cursorY = PAGE_H - MARGIN_TOP;

    // Header bar on continuation pages
    page.drawRectangle({
      x: 0,
      y: PAGE_H - 24,
      width: PAGE_W,
      height: 24,
      color: NAVY,
    });
    const headerCompany = sanitizeWinAnsi(companyName || "ScalePods Technologies");
    page.drawText(`${headerCompany} | Private & Confidential`, {
      x: MARGIN_X,
      y: PAGE_H - 16,
      size: 7.5,
      font: regularFont,
      color: rgb(0.9, 0.94, 1.0),
    });
    page.drawRectangle({
      x: 0,
      y: PAGE_H - 26,
      width: PAGE_W,
      height: 2,
      color: BLUE,
    });
  };

  const ensureSpace = (neededH: number) => {
    if (cursorY - neededH < MARGIN_BOTTOM) {
      addNewPage();
    }
  };

  const drawWrappedLines = (
    lines: WrappedLine[],
    x: number,
    fontSize: number,
    lineHeight: number,
    color = TEXT_DARK,
  ) => {
    for (const line of lines) {
      ensureSpace(lineHeight);
      let drawX = x;
      for (const seg of line.segments) {
        if (!seg.text) continue;
        const font = seg.bold ? boldFont : regularFont;
        page.drawText(seg.text, {
          x: drawX,
          y: cursorY,
          size: fontSize,
          font,
          color,
        });
        drawX += font.widthOfTextAtSize(seg.text, fontSize);
      }
      cursorY -= lineHeight;
    }
  };

  for (const block of blocks) {
    if (block.kind === "page_break") {
      addNewPage();
      continue;
    }

    if (block.kind === "heading") {
      const size = block.level === 1 ? 14 : block.level === 2 ? 11.5 : 10.5;
      const lh = size * 1.5;
      const headingColor = block.level === 1 ? NAVY : block.level === 2 ? BLUE : MID_BLUE;
      const lines = wrapRuns(block.runs, CONTENT_W, size, regularFont, boldFont);
      cursorY -= block.level === 1 ? 10 : 7;
      ensureSpace(lines.length * lh + 10);

      // Draw subtle underline for H1 (major section titles)
      if (block.level === 1) {
        const textH = lines.length * lh;
        // We'll draw the line after rendering text, so track start Y
        const startY = cursorY;
        drawWrappedLines(lines, MARGIN_X, size, lh, headingColor);
        // Underline below heading text
        page.drawLine({
          start: { x: MARGIN_X, y: startY - textH - 1 },
          end: { x: MARGIN_X + CONTENT_W * 0.4, y: startY - textH - 1 },
          thickness: 1.5,
          color: BLUE,
        });
        cursorY -= 5;
      } else {
        drawWrappedLines(lines, MARGIN_X, size, lh, headingColor);
        cursorY -= 3;
      }
    } else if (block.kind === "paragraph") {
      const size = 10;
      const lh = 15;
      const lines = wrapRuns(block.runs, CONTENT_W, size, regularFont, boldFont);
      if (lines.length > 0 && lines.some((l) => l.segments.some((s) => s.text.trim()))) {
        drawWrappedLines(lines, MARGIN_X, size, lh);
        cursorY -= 4;
      }
    } else if (block.kind === "list_item") {
      const size = 10;
      const lh = 15;
      const indent = 18;
      const lines = wrapRuns(block.runs, CONTENT_W - indent, size, regularFont, boldFont);
      ensureSpace(lh);
      // Bullet/number
      page.drawText(block.bullet, {
        x: MARGIN_X + 4,
        y: cursorY,
        size,
        font: boldFont,
        color: BLUE,
      });
      drawWrappedLines(lines, MARGIN_X + indent, size, lh);
      cursorY -= 2;
    } else if (block.kind === "table" && block.rows.length > 0) {
      if (block.isLayoutTable) {
        // Render as a simple key-value info row (no borders, no header style)
        // e.g. "Ref: {{REF_NO}} | Date: {{ISSUE_DATE}}"
        cursorY -= 4;
        const size = 9.5;
        const lh = 14;
        const numCols = block.rows[0].cells.length;
        const colW = CONTENT_W / numCols;
        ensureSpace(lh + 4);

        for (let c = 0; c < numCols; c++) {
          const cellRuns = block.rows[0].cells[c] ?? [];
          const lines = wrapRuns(cellRuns, colW - 8, size, regularFont, boldFont);
          let cellY = cursorY;
          for (const line of lines) {
            let drawX = MARGIN_X + c * colW;
            for (const seg of line.segments) {
              if (!seg.text) continue;
              const font = seg.bold ? boldFont : regularFont;
              page.drawText(seg.text, {
                x: drawX,
                y: cellY,
                size,
                font,
                color: TEXT_DARK,
              });
              drawX += font.widthOfTextAtSize(seg.text, size);
            }
            cellY -= lh;
          }
        }
        cursorY -= lh + 4;
      } else {
        // Full data table with navy headers
        const numCols = Math.max(...block.rows.map((r) => r.cells.length));
        const colW = CONTENT_W / numCols;
        const cellPadX = 7;
        const cellPadY = 6;
        const size = 9.5;
        const lh = 13.5;

        cursorY -= 8;
        for (let rIdx = 0; rIdx < block.rows.length; rIdx++) {
          const row = block.rows[rIdx];
          const wrappedCells = row.cells.map((cellRuns) =>
            wrapRuns(cellRuns, colW - cellPadX * 2, size, regularFont, boldFont),
          );
          const maxLines = Math.max(1, ...wrappedCells.map((c) => c.length));
          const rowH = maxLines * lh + cellPadY * 2;

          ensureSpace(rowH + 2);

          const rowTop = cursorY + size * 0.8;
          const rowBottom = rowTop - rowH;

          for (let c = 0; c < numCols; c++) {
            const cellX = MARGIN_X + c * colW;
            const isHeader = row.isHeader;
            const isAlternate = !isHeader && rIdx % 2 === 1;

            page.drawRectangle({
              x: cellX,
              y: rowBottom,
              width: colW,
              height: rowH,
              color: isHeader ? NAVY : isAlternate ? rgb(0.955, 0.965, 0.98) : rgb(1, 1, 1),
              borderColor: isHeader ? NAVY : rgb(0.78, 0.82, 0.88),
              borderWidth: 0.75,
            });

            const cellLines = wrappedCells[c] ?? [];
            let cellY = rowTop - cellPadY - size * 0.85;
            for (const line of cellLines) {
              let drawX = cellX + cellPadX;
              for (const seg of line.segments) {
                if (!seg.text) continue;
                const font = isHeader || seg.bold ? boldFont : regularFont;
                page.drawText(seg.text, {
                  x: drawX,
                  y: cellY,
                  size,
                  font,
                  color: isHeader ? rgb(1, 1, 1) : TEXT_DARK,
                });
                drawX += font.widthOfTextAtSize(seg.text, size);
              }
              cellY -= lh;
            }
          }

          cursorY = rowBottom - size * 0.8;
        }
        cursorY -= 10;
      }
    }
  }

  // Draw footer on every page
  const allPages = pdfDoc.getPages();
  const totalPages = allPages.length;
  for (let idx = 0; idx < totalPages; idx++) {
    const curPage = allPages[idx];
    // Footer divider line
    curPage.drawLine({
      start: { x: MARGIN_X, y: 42 },
      end: { x: PAGE_W - MARGIN_X, y: 42 },
      thickness: 0.5,
      color: rgb(0.82, 0.86, 0.9),
    });
    // Footer left: Private & Confidential
    curPage.drawText("Private & Confidential - Employment Agreement", {
      x: MARGIN_X,
      y: 28,
      size: 7.5,
      font: regularFont,
      color: TEXT_GREY,
    });
    // Footer right: Page X of Y
    const pageNumText = `Page ${idx + 1} of ${totalPages}`;
    const pageNumW = regularFont.widthOfTextAtSize(pageNumText, 7.5);
    curPage.drawText(pageNumText, {
      x: PAGE_W - MARGIN_X - pageNumW,
      y: 28,
      size: 7.5,
      font: regularFont,
      color: TEXT_GREY,
    });
  }

  const saved = await pdfDoc.save();
  return Buffer.from(saved);
}
