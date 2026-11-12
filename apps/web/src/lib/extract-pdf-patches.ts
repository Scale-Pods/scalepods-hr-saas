import type { PdfLinePatch } from "./fill-original-pdf";
import { renderOfferTemplateText } from "./offer-template-utils";

interface RawPdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface PdfLineMetadata {
  key: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  originalText: string;
}

/**
 * Join text runs in a single segment, inserting spaces only when there is an
 * actual horizontal gap between runs (avoids turning "{{VAR}}" into "{{ VAR }}").
 */
function joinRunsSmart(runs: RawPdfTextItem[]): string {
  let out = "";
  for (let i = 0; i < runs.length; i++) {
    const cur = runs[i];
    if (i > 0) {
      const prev = runs[i - 1];
      const prevEnd = prev.transform[4] + (prev.width || 0);
      const gap = cur.transform[4] - prevEnd;
      if (gap > 1.8 && !out.endsWith(" ") && !cur.str.startsWith(" ")) {
        out += " ";
      }
    }
    out += cur.str;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Split a baseline-grouped row into separate column segments wherever there is
 * a horizontal gap > 14pt (preserves table columns cleanly).
 */
function splitRowIntoSegments(row: RawPdfTextItem[]): RawPdfTextItem[][] {
  const sorted = [...row].sort((a, b) => a.transform[4] - b.transform[4]);
  const segments: RawPdfTextItem[][] = [];
  let current: RawPdfTextItem[] = [];

  for (const item of sorted) {
    if (current.length === 0) {
      current.push(item);
      continue;
    }
    const prev = current[current.length - 1];
    const prevEnd = prev.transform[4] + (prev.width || 0);
    const gap = item.transform[4] - prevEnd;
    if (gap > 14) {
      segments.push(current);
      current = [item];
    } else {
      current.push(item);
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * Merge wrapped {{VAR}} placeholders split across 2 or 3 vertical lines in the same
 * narrow column (e.g. "{{BASIC_SALARY}\n}" or "{{SPECIAL_ALLO\nWANCE_ANNUAL}\n}").
 */
export function mergeWrappedPlaceholders(lines: PdfLineMetadata[]): PdfLineMetadata[] {
  const merged: PdfLineMetadata[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    let cur = { ...lines[i] };

    let openCount = (cur.originalText.match(/\{\{/g) || []).length;
    let closeCount = (cur.originalText.match(/\}\}/g) || []).length;

    while (openCount > closeCount) {
      let nextIdx = -1;
      let bestXDist = Infinity;
      for (let j = i + 1; j < lines.length; j++) {
        if (consumed.has(j)) continue;
        const cand = lines[j];
        const xDist = Math.abs(cand.x - cur.x);
        const yDrop = cur.y - cand.y;
        if (cand.pageNumber === cur.pageNumber && xDist <= 40 && yDrop > 0 && yDrop <= 36) {
          if (xDist < bestXDist) {
            bestXDist = xDist;
            nextIdx = j;
          }
          // Stop searching once we pass into lines far below
          if (yDrop > 20 && nextIdx !== -1) break;
        }
      }

      if (nextIdx === -1) break;

      const cont = lines[nextIdx];
      consumed.add(nextIdx);
      const bottomY = Math.min(cur.y, cont.y);
      cur = {
        ...cur,
        width: Math.max(cur.width, cont.width),
        height: cur.y - bottomY + cont.height,
        originalText: `${cur.originalText}${cont.originalText}`.replace(/\s+/g, " ").trim(),
      };
      openCount = (cur.originalText.match(/\{\{/g) || []).length;
      closeCount = (cur.originalText.match(/\}\}/g) || []).length;
    }

    merged.push(cur);
  }

  return merged;
}

/**
 * Extract cell/line-level PDF user-space coordinates and text from an uploaded PDF.
 */
export async function extractPdfLines(pdfBuffer: ArrayBuffer): Promise<PdfLineMetadata[]> {
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

  const doc = await pdfjs.getDocument({ data: pdfBuffer.slice(0) }).promise;
  const numPages = Math.min(doc.numPages, 20);
  const rawSegments: PdfLineMetadata[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const items: RawPdfTextItem[] = [];
    for (const item of content.items) {
      if ("str" in item && "transform" in item && item.str.trim()) {
        items.push({
          str: item.str,
          transform: item.transform,
          width: "width" in item ? Number(item.width) : 0,
          height: "height" in item ? Number(item.height) : 10,
        });
      }
    }

    const rowGroups: RawPdfTextItem[][] = [];
    for (const item of items) {
      const y = item.transform[5];
      const lastGroup = rowGroups[rowGroups.length - 1];
      if (lastGroup && Math.abs(lastGroup[0].transform[5] - y) <= 3) {
        lastGroup.push(item);
      } else {
        rowGroups.push([item]);
      }
    }

    let segIdx = 0;
    for (const row of rowGroups) {
      const segments = splitRowIntoSegments(row);
      for (const seg of segments) {
        const originalText = joinRunsSmart(seg);
        if (!originalText) continue;

        const x = Math.min(...seg.map((g) => g.transform[4]));
        const maxX = Math.max(...seg.map((g) => g.transform[4] + (g.width || 12)));
        const y = seg[0].transform[5];
        const fontSize = Math.max(...seg.map((g) => Math.abs(g.transform[3]) || g.height || 10));

        rawSegments.push({
          key: `p${pageNum}_l${segIdx++}`,
          pageNumber: pageNum,
          x,
          y,
          width: Math.max(8, maxX - x),
          height: fontSize * 1.1,
          fontSize,
          originalText,
        });
      }
    }
  }

  return mergeWrappedPlaceholders(rawSegments);
}

/**
 * Build patches only for segments/cells that have {{VARIABLES}} or were manually edited/deleted.
 * Untouched text and table borders keep their exact original PDF rendering.
 */
export function buildPdfPatches(
  lines: PdfLineMetadata[],
  values: Record<string, string | undefined>,
  overrides: Record<string, string> = {},
  deletedKeys: Record<string, boolean> = {},
): PdfLinePatch[] {
  const patches: PdfLinePatch[] = [];

  for (const line of lines) {
    const isDeleted = Boolean(deletedKeys[line.key]);
    const hasOverride = line.key in overrides && overrides[line.key] !== line.originalText;
    const baseText = hasOverride ? overrides[line.key] : line.originalText;
    const hasPlaceholder = /\{\{[^}]+\}\}/.test(baseText);

    if (!isDeleted && !hasOverride && !hasPlaceholder) continue;

    patches.push({
      pageNumber: line.pageNumber,
      x: line.x,
      y: line.y,
      width: line.width,
      height: line.height,
      fontSize: line.fontSize,
      text: isDeleted ? "" : renderOfferTemplateText(baseText, values),
    });
  }

  return patches;
}
