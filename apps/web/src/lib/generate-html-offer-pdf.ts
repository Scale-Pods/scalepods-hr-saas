import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import { cleanOfferTemplateDirectives } from "./offer-template-utils";

const PAGE_W = 595.28; // A4 width in pt
const PAGE_H = 841.89; // A4 height in pt
const MARGIN_X = 54;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 54;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

// Brand colours
const NAVY = rgb(0.059, 0.161, 0.259); // #0f2942
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
 * Returns true if this is a simple 2-column or 3-column layout table used as a header
 * (e.g. "Ref: {{REF_NO}} | Date: {{ISSUE_DATE}}" or "Dear {{NAME}} | Starting Date: {{DATE}}")
 * These should be rendered as a small info-row, not a boxed data table.
 */
function isLayoutTable(tableHtml: string): boolean {
  const rows = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  if (rows.length !== 1) return false;
  const cells = rows[0].match(/<(?:th|td)[^>]*>[\s\S]*?<\/(?:th|td)>/gi) ?? [];
  if (cells.length < 2 || cells.length > 3) return false;
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
 */
function detectHeadingLevel(runs: TextRun[]): 1 | 2 | 3 | null {
  if (runs.length === 0) return null;

  if (!runs.every((r) => r.bold)) return null;

  const text = runs
    .map((r) => r.text)
    .join("")
    .trim();
  if (!text) return null;

  // Level 1: Major ALL_CAPS headings
  const hasLowercase = /[a-z]/.test(text);
  if (!hasLowercase && text.length >= 3 && !/^\{\{/.test(text)) {
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
    !text.includes(":")
  ) {
    const titleCaseCount = words.filter((w) => /^[A-Z]/.test(w)).length;
    if (titleCaseCount >= words.length * 0.7) return 3;
  }

  return null;
}

function parseHtmlToBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];
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
      if (isDirectiveTable(full)) continue;
      blocks.push(parseTableBlock(full));
    } else if (/^<h([1-3])/i.test(full)) {
      const level = Number(match[1]) as 1 | 2 | 3;
      const inner = full.replace(/^<h[1-3][^>]*>/i, "").replace(/<\/h[1-3]>$/i, "");
      const runs = parseInlineRuns(inner).map((r) => ({ ...r, bold: true }));
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
      const inner = full.replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "");
      const runs = parseInlineRuns(inner);
      if (runs.some((r) => r.text.trim())) {
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
 * Render structured HTML (from DOCX/mammoth or HTML templates) into a clean,
 * executive-grade A4 PDF matching the original uploaded Word template.
 *
 * Background: Clean white page background (no artificial navy top banners).
 * Alignment: Proper left/right layout alignment and proportional table column widths.
 * Spacing: Natural content flow without artificial page breaks.
 */
export async function generateHtmlOfferPdf(
  html: string,
  companyName?: string,
  options?: { isIntern?: boolean; letterType?: string },
): Promise<Buffer> {
  const isIntern =
    options?.isIntern ??
    (options?.letterType
      ? options.letterType.toLowerCase().includes("intern")
      : /\b(?:internship|intern|stipend)\b/i.test(html) &&
        !/\b(?:Total CTC|Basic Salary|House Rent Allowance)\b/i.test(html));

  // Ensure directives and duplicate sections are thoroughly cleaned
  const cleanedHtml = cleanOfferTemplateDirectives(html, {
    isIntern,
    letterType: isIntern ? "intern" : "fulltime",
  });

  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const blocks = parseHtmlToBlocks(cleanedHtml);
  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let cursorY = PAGE_H - MARGIN_TOP;

  const addNewPage = () => {
    if (cursorY >= PAGE_H - MARGIN_TOP - 10) return;
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    cursorY = PAGE_H - MARGIN_TOP;
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
      const size = block.level === 1 ? 13.5 : block.level === 2 ? 11 : 10;
      const lh = size * 1.45;
      const headingColor = NAVY;
      const lines = wrapRuns(block.runs, CONTENT_W, size, regularFont, boldFont);
      cursorY -= block.level === 1 ? 10 : 7;
      ensureSpace(lines.length * lh + 6);
      drawWrappedLines(lines, MARGIN_X, size, lh, headingColor);
      cursorY -= 3;
    } else if (block.kind === "paragraph") {
      const size = 9.5;
      const lh = 14;
      const lines = wrapRuns(block.runs, CONTENT_W, size, regularFont, boldFont);
      if (lines.length > 0 && lines.some((l) => l.segments.some((s) => s.text.trim()))) {
        drawWrappedLines(lines, MARGIN_X, size, lh);
        cursorY -= 4;
      }
    } else if (block.kind === "list_item") {
      const size = 9.5;
      const lh = 14;
      const indent = 16;
      const lines = wrapRuns(block.runs, CONTENT_W - indent, size, regularFont, boldFont);
      ensureSpace(lh);
      page.drawText(block.bullet, {
        x: MARGIN_X + 4,
        y: cursorY,
        size,
        font: boldFont,
        color: NAVY,
      });
      drawWrappedLines(lines, MARGIN_X + indent, size, lh);
      cursorY -= 2;
    } else if (block.kind === "table" && block.rows.length > 0) {
      if (block.isLayoutTable) {
        cursorY -= 4;
        const size = 9.5;
        const lh = 14;
        const numCols = block.rows[0].cells.length;
        ensureSpace(lh + 4);

        if (numCols === 2) {
          // Left cell at MARGIN_X, Right cell right-aligned at PAGE_W - MARGIN_X
          const leftRuns = block.rows[0].cells[0] ?? [];
          const rightRuns = block.rows[0].cells[1] ?? [];
          const maxCellW = CONTENT_W * 0.55;
          const leftLines = wrapRuns(leftRuns, maxCellW, size, regularFont, boldFont);
          const rightLines = wrapRuns(rightRuns, maxCellW, size, regularFont, boldFont);
          const totalLines = Math.max(leftLines.length, rightLines.length);

          let cellY = cursorY;
          for (const line of leftLines) {
            let drawX = MARGIN_X;
            for (const seg of line.segments) {
              if (!seg.text) continue;
              const font = seg.bold ? boldFont : regularFont;
              page.drawText(seg.text, { x: drawX, y: cellY, size, font, color: TEXT_DARK });
              drawX += font.widthOfTextAtSize(seg.text, size);
            }
            cellY -= lh;
          }

          cellY = cursorY;
          for (const line of rightLines) {
            const lineWidth = line.segments.reduce((acc, seg) => {
              const font = seg.bold ? boldFont : regularFont;
              return acc + font.widthOfTextAtSize(seg.text, size);
            }, 0);
            let drawX = PAGE_W - MARGIN_X - lineWidth;
            for (const seg of line.segments) {
              if (!seg.text) continue;
              const font = seg.bold ? boldFont : regularFont;
              page.drawText(seg.text, { x: drawX, y: cellY, size, font, color: TEXT_DARK });
              drawX += font.widthOfTextAtSize(seg.text, size);
            }
            cellY -= lh;
          }
          cursorY -= totalLines * lh + 6;
        } else {
          const colW = CONTENT_W / numCols;
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
          cursorY -= lh + 6;
        }
      } else {
        const numCols = Math.max(...block.rows.map((r) => r.cells.length));
        const colWidths =
          numCols === 4 ? [35, 215, 118, 119] : Array(numCols).fill(CONTENT_W / numCols);

        const cellPadX = 6;
        const cellPadY = 5;
        const size = 9;
        const lh = 13;

        cursorY -= 6;
        for (let rIdx = 0; rIdx < block.rows.length; rIdx++) {
          const row = block.rows[rIdx];
          const wrappedCells = row.cells.map((cellRuns, cIdx) =>
            wrapRuns(
              cellRuns,
              (colWidths[cIdx] || 100) - cellPadX * 2,
              size,
              regularFont,
              boldFont,
            ),
          );
          const maxLines = Math.max(1, ...wrappedCells.map((c) => c.length));
          const rowH = maxLines * lh + cellPadY * 2;

          ensureSpace(rowH + 2);

          const rowTop = cursorY + size * 0.8;
          const rowBottom = rowTop - rowH;

          let currentX = MARGIN_X;
          for (let c = 0; c < numCols; c++) {
            const colW = colWidths[c] || 100;
            const isHeader = row.isHeader;
            const isAlternate = !isHeader && rIdx % 2 === 1;

            page.drawRectangle({
              x: currentX,
              y: rowBottom,
              width: colW,
              height: rowH,
              color: isHeader ? NAVY : isAlternate ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1),
              borderColor: isHeader ? NAVY : rgb(0.8, 0.84, 0.9),
              borderWidth: 0.75,
            });

            const cellLines = wrappedCells[c] ?? [];
            let cellY = rowTop - cellPadY - size * 0.85;
            for (const line of cellLines) {
              let drawX = currentX + cellPadX;
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
            currentX += colW;
          }

          cursorY = rowBottom - size * 0.8;
        }
        cursorY -= 8;
      }
    }
  }

  // Draw clean, subtle footer on every page
  const allPages = pdfDoc.getPages();
  const totalPages = allPages.length;
  for (let idx = 0; idx < totalPages; idx++) {
    const curPage = allPages[idx];
    curPage.drawLine({
      start: { x: MARGIN_X, y: 38 },
      end: { x: PAGE_W - MARGIN_X, y: 38 },
      thickness: 0.5,
      color: rgb(0.85, 0.88, 0.92),
    });
    const footerCompany = companyName ? sanitizeWinAnsi(companyName) : "Private & Confidential";
    curPage.drawText(`${footerCompany} - Employment Agreement`, {
      x: MARGIN_X,
      y: 26,
      size: 7.5,
      font: regularFont,
      color: TEXT_GREY,
    });
    const pageNumText = `Page ${idx + 1} of ${totalPages}`;
    const pageNumW = regularFont.widthOfTextAtSize(pageNumText, 7.5);
    curPage.drawText(pageNumText, {
      x: PAGE_W - MARGIN_X - pageNumW,
      y: 26,
      size: 7.5,
      font: regularFont,
      color: TEXT_GREY,
    });
  }

  const saved = await pdfDoc.save();
  return Buffer.from(saved);
}
