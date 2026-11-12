"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { showErrorToast } from "@/components/shared/TierLimitToast";
import { accessToken as getAccessToken } from "@/lib/supabase/client";

interface PdfLineOverlay {
  key: string;
  pageNumber: number;
  originalText: string;
  /** Percentages relative to rendered page dimensions */
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  fontSizePx: number;
  hasVar: boolean;
}

export interface PdfVisualEditorProps {
  templateId: string;
  value: string;
  onChange: (nextValue: string) => void;
  onPdfEditsChange?: (edits: {
    overrides: Record<string, string>;
    deletedKeys: Record<string, boolean>;
  }) => void;
}

interface RawPdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export function PdfVisualEditor({
  templateId,
  value,
  onChange,
  onPdfEditsChange,
}: PdfVisualEditorProps) {
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(0);
  const [overlays, setOverlays] = useState<PdfLineOverlay[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [deletedKeys, setDeletedKeys] = useState<Record<string, boolean>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const pageSizesRef = useRef<Record<number, { width: number; height: number }>>({});

  // Render PDF pages to canvases and compute text line overlays
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOverrides({});
    setDeletedKeys({});
    setActiveKey(null);

    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/offer-templates/file?id=${encodeURIComponent(templateId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Failed to load uploaded PDF");
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

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

        const doc = await pdfjs.getDocument({ data: buffer }).promise;
        if (cancelled) return;

        const numPages = Math.min(doc.numPages, 20);
        setPageCount(numPages);

        const allOverlays: PdfLineOverlay[] = [];
        const scale = 1.4;

        // Wait one tick so canvas refs mount for numPages
        await new Promise((r) => setTimeout(r, 30));
        if (cancelled) return;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale });
          pageSizesRef.current[pageNum] = { width: viewport.width, height: viewport.height };

          const canvas = canvasRefs.current[pageNum];
          if (canvas) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              await page.render({ canvasContext: ctx, viewport }).promise;
            }
          }

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

          // Group items sharing the same baseline y, then split by horizontal gap > 14pt (table columns)
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
            const sortedRow = [...row].sort((a, b) => a.transform[4] - b.transform[4]);
            const segments: RawPdfTextItem[][] = [];
            let curSeg: RawPdfTextItem[] = [];
            for (const item of sortedRow) {
              if (curSeg.length === 0) {
                curSeg.push(item);
                continue;
              }
              const prev = curSeg[curSeg.length - 1];
              const gap = item.transform[4] - (prev.transform[4] + (prev.width || 0));
              if (gap > 14) {
                segments.push(curSeg);
                curSeg = [item];
              } else {
                curSeg.push(item);
              }
            }
            if (curSeg.length > 0) segments.push(curSeg);

            for (const group of segments) {
              const text = group
                .map((g) => g.str)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
              if (!text) continue;

              const minX = Math.min(...group.map((g) => g.transform[4]));
              const maxX = Math.max(...group.map((g) => g.transform[4] + (g.width || 12)));
              const baseY = group[0].transform[5];
              const fontH = Math.max(
                ...group.map((g) => Math.abs(g.transform[3]) || g.height || 10),
              );

              const [vx1, vy1] = viewport.convertToViewportPoint(minX, baseY + fontH);
              const [vx2, vy2] = viewport.convertToViewportPoint(maxX, baseY - fontH * 0.2);

              const leftPct = Math.max(0, Math.min(98, (vx1 / viewport.width) * 100));
              const topPct = Math.max(0, Math.min(98, (vy1 / viewport.height) * 100));
              const widthPct = Math.max(
                4,
                Math.min(100 - leftPct, ((vx2 - vx1) / viewport.width) * 100 + 1),
              );
              const heightPct = Math.max(2, ((vy2 - vy1) / viewport.height) * 100 + 0.2);

              allOverlays.push({
                key: `p${pageNum}_l${segIdx++}`,
                pageNumber: pageNum,
                originalText: text,
                leftPct,
                topPct,
                widthPct,
                heightPct,
                fontSizePx: Math.max(10, Math.round(fontH * scale * 0.85)),
                hasVar: /\{\{[^}]+\}\}/.test(text),
              });
            }
          }
        }

        if (!cancelled) {
          setOverlays(allOverlays);
        }
      } catch (err) {
        if (!cancelled) showErrorToast(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId]);

  // Sync line edits back into the template text
  const syncTextFromOverlays = (
    nextOverrides: Record<string, string>,
    nextDeleted: Record<string, boolean>,
  ) => {
    if (overlays.length === 0) return;
    const pages: string[] = [];
    for (let p = 1; p <= pageCount; p++) {
      const pageLines = overlays
        .filter((o) => o.pageNumber === p && !nextDeleted[o.key])
        .map((o) => (o.key in nextOverrides ? nextOverrides[o.key] : o.originalText))
        .filter((line) => line.trim().length > 0);
      if (pageLines.length > 0) pages.push(pageLines.join("\n"));
    }
    const rebuilt = pages.join("\n\n");
    if (rebuilt.trim() && rebuilt !== value) {
      onChange(rebuilt);
    }
  };

  const handleLineChange = (key: string, nextVal: string) => {
    const nextOverrides = { ...overrides, [key]: nextVal };
    setOverrides(nextOverrides);
    onPdfEditsChange?.({ overrides: nextOverrides, deletedKeys });
    syncTextFromOverlays(nextOverrides, deletedKeys);
  };

  const handleDeleteLine = (key: string) => {
    const nextDeleted = { ...deletedKeys, [key]: true };
    setDeletedKeys(nextDeleted);
    setActiveKey(null);
    onPdfEditsChange?.({ overrides, deletedKeys: nextDeleted });
    syncTextFromOverlays(overrides, nextDeleted);
  };

  const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="rounded-xl border border-border bg-slate-200/70 dark:bg-slate-900/70 p-3 sm:p-5 h-[62vh] min-h-[480px] overflow-y-auto">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Rendering editable PDF pages...
        </div>
      )}

      <div className="mx-auto max-w-[820px] space-y-5">
        {pageNumbers.map((pageNum) => {
          const pageOverlays = overlays.filter((o) => o.pageNumber === pageNum);
          return (
            <div
              key={pageNum}
              className="relative mx-auto w-full bg-white shadow-lg border border-slate-300 overflow-hidden"
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current[pageNum] = el;
                }}
                className="block w-full h-auto"
              />

              {/* Interactive text overlays positioned directly over the PDF canvas */}
              {pageOverlays.map((ov) => {
                const isDeleted = Boolean(deletedKeys[ov.key]);
                const isModified = ov.key in overrides && overrides[ov.key] !== ov.originalText;
                const isActive = activeKey === ov.key;
                const displayVal = ov.key in overrides ? overrides[ov.key] : ov.originalText;

                if (isDeleted) {
                  return (
                    <div
                      key={ov.key}
                      style={{
                        left: `${ov.leftPct}%`,
                        top: `${ov.topPct}%`,
                        width: `${ov.widthPct}%`,
                        height: `${ov.heightPct}%`,
                      }}
                      className="absolute bg-white/95"
                    />
                  );
                }

                if (isActive) {
                  return (
                    <div
                      key={ov.key}
                      style={{
                        left: `${Math.max(1, ov.leftPct - 0.5)}%`,
                        top: `${Math.max(0.5, ov.topPct - 0.3)}%`,
                        minWidth: `${Math.min(96, ov.widthPct + 6)}%`,
                      }}
                      className="absolute z-20 flex items-center gap-1 rounded bg-white shadow-md ring-2 ring-primary px-1 py-0.5"
                    >
                      <input
                        ref={(el) => {
                          if (el && document.activeElement !== el) {
                            el.focus();
                          }
                        }}
                        type="text"
                        value={displayVal}
                        onChange={(e) => handleLineChange(ov.key, e.target.value)}
                        onBlur={() => setActiveKey(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") {
                            setActiveKey(null);
                          }
                        }}
                        style={{ fontSize: `${Math.max(11, ov.fontSizePx * 0.82)}px` }}
                        className="w-full bg-white text-slate-900 font-sans focus:outline-none"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleDeleteLine(ov.key);
                        }}
                        title="Remove this line"
                        className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={ov.key}
                    type="button"
                    onClick={() => setActiveKey(ov.key)}
                    title="Click to edit this line"
                    style={{
                      left: `${ov.leftPct}%`,
                      top: `${ov.topPct}%`,
                      width: `${ov.widthPct}%`,
                      height: `${ov.heightPct}%`,
                      fontSize: `${Math.max(10, ov.fontSizePx * 0.78)}px`,
                    }}
                    className={`absolute text-left transition-colors rounded-xs cursor-text ${
                      isModified
                        ? "bg-white text-slate-900 px-1 ring-1 ring-emerald-500/70 flex items-center overflow-hidden whitespace-nowrap"
                        : ov.hasVar
                          ? "bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30"
                          : "hover:bg-amber-400/15 hover:ring-1 hover:ring-amber-500/40"
                    }`}
                  >
                    {isModified ? displayVal : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
