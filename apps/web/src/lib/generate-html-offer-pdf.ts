import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

const PAGE_W = 595.28; // A4 width in pt
const PAGE_H = 841.89; // A4 height in pt
const MARGIN_X = 54;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

function sanitizeWinAnsi(text: string): string {
  return text
    .replace(/\u20B9/g, "INR ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "*")
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
  | { kind: "table"; rows: Array<{ isHeader: boolean; cells: TextRun[][] }> };

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

  return { kind: "table", rows };
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
        blocks.push({ kind: "paragraph", runs });
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
 * properly typeset multi-page A4 PDF with real tables, headings, bold spans,
 * and automatic text reflow.
 */
export async function generateHtmlOfferPdf(html: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const blocks = parseHtmlToBlocks(html);
  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let cursorY = PAGE_H - MARGIN_TOP;

  const ensureSpace = (neededH: number) => {
    if (cursorY - neededH < MARGIN_BOTTOM) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      cursorY = PAGE_H - MARGIN_TOP;
    }
  };

  const drawWrappedLines = (
    lines: WrappedLine[],
    x: number,
    fontSize: number,
    lineHeight: number,
    color = rgb(0.1, 0.13, 0.18),
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
    if (block.kind === "heading") {
      const size = block.level === 1 ? 15 : block.level === 2 ? 12.5 : 11;
      const lh = size * 1.45;
      const lines = wrapRuns(block.runs, CONTENT_W, size, regularFont, boldFont);
      cursorY -= 6;
      ensureSpace(lines.length * lh + 6);
      drawWrappedLines(lines, MARGIN_X, size, lh, rgb(0.06, 0.09, 0.16));
      cursorY -= 4;
    } else if (block.kind === "paragraph") {
      const size = 10.5;
      const lh = 15;
      const lines = wrapRuns(block.runs, CONTENT_W, size, regularFont, boldFont);
      drawWrappedLines(lines, MARGIN_X, size, lh);
      cursorY -= 6;
    } else if (block.kind === "list_item") {
      const size = 10.5;
      const lh = 15;
      const indent = 16;
      const lines = wrapRuns(block.runs, CONTENT_W - indent, size, regularFont, boldFont);
      ensureSpace(lh);
      page.drawText(block.bullet, {
        x: MARGIN_X + 4,
        y: cursorY,
        size,
        font: boldFont,
        color: rgb(0.15, 0.2, 0.28),
      });
      drawWrappedLines(lines, MARGIN_X + indent, size, lh);
      cursorY -= 3;
    } else if (block.kind === "table" && block.rows.length > 0) {
      const numCols = Math.max(...block.rows.map((r) => r.cells.length));
      const colW = CONTENT_W / numCols;
      const cellPadX = 6;
      const cellPadY = 6;
      const size = 9.5;
      const lh = 13;

      cursorY -= 4;
      for (const row of block.rows) {
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
          page.drawRectangle({
            x: cellX,
            y: rowBottom,
            width: colW,
            height: rowH,
            color: row.isHeader ? rgb(0.92, 0.95, 0.99) : rgb(1, 1, 1),
            borderColor: rgb(0.82, 0.85, 0.9),
            borderWidth: 0.7,
          });

          const cellLines = wrappedCells[c] ?? [];
          let cellY = rowTop - cellPadY - size * 0.85;
          for (const line of cellLines) {
            let drawX = cellX + cellPadX;
            for (const seg of line.segments) {
              if (!seg.text) continue;
              const font = seg.bold ? boldFont : regularFont;
              page.drawText(seg.text, {
                x: drawX,
                y: cellY,
                size,
                font,
                color: rgb(0.08, 0.1, 0.14),
              });
              drawX += font.widthOfTextAtSize(seg.text, size);
            }
            cellY -= lh;
          }
        }

        cursorY = rowBottom - size * 0.8;
      }
      cursorY -= 8;
    }
  }

  const saved = await pdfDoc.save();
  return Buffer.from(saved);
}
