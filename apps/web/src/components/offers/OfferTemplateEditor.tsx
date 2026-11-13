"use client";

import { Code2, Eye, FileText, Loader2, Plus, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  cleanOfferTemplateDirectives,
  extractAllOfferVariables,
  formatPlainTextAsRichHtml,
} from "@/lib/offer-template-utils";
import { accessToken as getAccessToken } from "@/lib/supabase/client";

export interface OfferTemplateEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  htmlValue?: string;
  onHtmlChange?: (nextHtml: string) => void;
}

export function OfferTemplateEditor({
  value,
  onChange,
  htmlValue,
  onHtmlChange,
}: OfferTemplateEditorProps) {
  const [mode, setMode] = useState<"rich" | "pdf" | "raw">("rich");
  const [newVar, setNewVar] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiEditing, setAiEditing] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef<string>("");

  const effectiveHtml = useMemo(
    () => (htmlValue?.trim() ? htmlValue : formatPlainTextAsRichHtml(value)),
    [htmlValue, value],
  );

  const detectedVariables = useMemo(
    () => extractAllOfferVariables(htmlValue?.trim() ? `${value}\n${htmlValue}` : value),
    [value, htmlValue],
  );

  // Hydrate rich editor when mounting, switching into "rich" mode, or when template changes externally
  useEffect(() => {
    if (mode !== "rich" || !editorRef.current) return;
    if (!editorRef.current.innerHTML || lastHtmlRef.current !== effectiveHtml) {
      editorRef.current.innerHTML = effectiveHtml;
      lastHtmlRef.current = effectiveHtml;
    }
  }, [mode, effectiveHtml]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const loadPdfView = useCallback(async () => {
    if (!effectiveHtml.trim() && !value.trim()) return;
    setLoadingPdf(true);
    try {
      const res = await fetch("/api/offers/pdf?preview=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rendered_html: effectiveHtml,
          rendered_text: value,
          candidate_name: "Template_Preview",
        }),
      });
      if (!res.ok) throw new Error("Failed to render PDF preview");
      const blob = await res.blob();
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      showErrorToast(err);
    } finally {
      setLoadingPdf(false);
    }
  }, [effectiveHtml, value]);

  const handleRichInput = () => {
    if (!editorRef.current) return;
    const nextHtml = editorRef.current.innerHTML;
    const nextText = editorRef.current.innerText.replace(/\r\n/g, "\n");
    lastHtmlRef.current = nextHtml;
    onHtmlChange?.(nextHtml);
    onChange(nextText);
  };

  const insertToken = (tokenName: string) => {
    const clean = tokenName.trim().toUpperCase().replace(/[{}]/g, "").replace(/\s+/g, "_");
    if (!clean) return;
    const token = `{{${clean}}}`;

    if (mode === "rich" && editorRef.current) {
      editorRef.current.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(token);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        handleRichInput();
        return;
      }
    }

    const next = value ? `${value}\n${token}` : token;
    onChange(next);
    if (onHtmlChange) {
      onHtmlChange(`${effectiveHtml}\n<p>${token}</p>`);
    }
  };

  const handleAddAndInsert = () => {
    const clean = newVar.trim().toUpperCase().replace(/[{}]/g, "").replace(/\s+/g, "_");
    if (!clean) return;
    insertToken(clean);
    setNewVar("");
  };

  const handleAiEdit = async () => {
    if (!aiInstruction.trim()) {
      showErrorToast(
        "Enter an instruction for AI (e.g. 'Remove template notes and format table').",
      );
      return;
    }
    setAiEditing(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/offer-templates/ai-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          raw_text: value,
          html_content: effectiveHtml,
          instruction: aiInstruction.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update template with AI");

      if (typeof data.updated_text === "string" && data.updated_text.trim()) {
        onChange(data.updated_text.trim());
      }
      if (typeof data.updated_html === "string" && data.updated_html.trim()) {
        onHtmlChange?.(data.updated_html.trim());
        if (editorRef.current) {
          editorRef.current.innerHTML = data.updated_html.trim();
          lastHtmlRef.current = data.updated_html.trim();
        }
      }
      setAiInstruction("");
      showToast("Template updated via n8n AI! Review changes and click Save.");
    } catch (err) {
      showErrorToast(err);
    } finally {
      setAiEditing(false);
    }
  };

  const handleCleanDirectives = () => {
    const cleanedText = cleanOfferTemplateDirectives(value);
    const cleanedHtml = cleanOfferTemplateDirectives(effectiveHtml);
    onChange(cleanedText);
    onHtmlChange?.(cleanedHtml);
    if (editorRef.current) {
      editorRef.current.innerHTML = cleanedHtml;
      lastHtmlRef.current = cleanedHtml;
    }
    showToast("Cleaned template directives and notes.");
  };

  return (
    <div className="space-y-3">
      {/* AI Template Assistant (Claude via n8n) */}
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Wand2 className="h-3.5 w-3.5 text-primary" />
          Edit Template with Claude AI (via n8n)
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAiEdit();
              }
            }}
            placeholder="e.g. Remove instruction notes, keep only Internship section, format salary table..."
            className="h-8 text-xs bg-background"
            disabled={aiEditing}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void handleAiEdit()}
            disabled={aiEditing || !aiInstruction.trim()}
            className="h-8 px-3 text-xs shrink-0 gap-1.5"
          >
            {aiEditing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            {aiEditing ? "Updating..." : "Apply AI Edit"}
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Detected Variables ({detectedVariables.length})
          </span>
        </div>

        <div className="inline-flex flex-wrap items-center rounded-lg border border-border bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setMode("rich")}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              mode === "rich"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-3 w-3" /> Document Editor
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("pdf");
              void loadPdfView();
            }}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              mode === "pdf"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Eye className="h-3 w-3" /> Output PDF
          </button>
          <button
            type="button"
            onClick={() => setMode("raw")}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              mode === "raw"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Code2 className="h-3 w-3" /> Plain Text
          </button>
        </div>
      </div>

      {/* Detected variable chips */}
      <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto">
          {detectedVariables.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertToken(v)}
              title={`Click to insert {{${v}}} at cursor`}
              className="inline-flex items-center rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
            >
              {`{{${v}}}`}
            </button>
          ))}
          {detectedVariables.length === 0 && (
            <span className="text-[11px] text-muted-foreground italic">
              No {"{{VARIABLE}}"} placeholders detected yet.
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
          <Input
            value={newVar}
            onChange={(e) => setNewVar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddAndInsert();
              }
            }}
            placeholder="Insert new variable (e.g. BONUS_AMOUNT)..."
            className="h-7 text-xs font-mono bg-background"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 text-xs shrink-0 gap-1"
            onClick={handleAddAndInsert}
          >
            <Plus className="h-3 w-3" /> Insert
          </Button>
        </div>
      </div>

      {/* Editor / Preview Surface */}
      {mode === "rich" ? (
        <div className="rounded-xl border border-border bg-slate-200/70 dark:bg-slate-900/70 p-3 sm:p-5 h-[62vh] min-h-[460px] overflow-y-auto">
          <div className="mx-auto w-full max-w-[820px] rounded-md bg-white text-slate-900 shadow-md border border-slate-200 overflow-hidden">
            {/* Top letterhead decorative brand accent bar */}
            <div className="h-2 w-full bg-gradient-to-r from-[#0f2942] via-[#1e40af] to-[#2563eb]" />
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-2 text-[11px] text-slate-500 bg-slate-50/70">
              <span className="font-medium text-slate-700">
                Official Document Preview · Original Tables &amp; Executive Layout
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCleanDirectives}
                  className="h-6 px-2 text-[10px] text-primary hover:bg-primary/10 gap-1 font-normal"
                  title="Strip template developer notes and conditional markers"
                >
                  <Sparkles className="h-2.5 w-2.5" /> Clean Directives
                </Button>
                <Badge
                  variant="outline"
                  className="text-[10px] font-normal border-slate-200 text-slate-600 bg-white"
                >
                  DOCX / Rich Editor
                </Badge>
              </div>
            </div>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleRichInput}
              style={{ color: "#0f172a", backgroundColor: "#ffffff" }}
              className="min-h-[400px] px-8 py-7 text-[13px] leading-relaxed text-slate-900 font-sans focus:outline-none [&_h1]:text-[#0f2942] [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-[#0f2942] [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-slate-200 [&_h2]:pb-1 [&_h3]:text-[#1e40af] [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2.5 [&_li]:mb-1 [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_table]:shadow-sm [&_th]:border [&_th]:border-[#0f2942] [&_th]:bg-[#0f2942] [&_th]:text-white [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-1.5 [&_tr:nth-child(even)]:bg-slate-50/70 [&_img]:max-h-20 [&_img]:object-contain"
            />
          </div>
        </div>
      ) : mode === "pdf" ? (
        <div className="rounded-xl border border-border overflow-hidden bg-muted/20 h-[62vh] min-h-[460px] flex items-center justify-center">
          {loadingPdf ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Rendering A4 PDF preview...
            </div>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} title="Template PDF Preview" className="w-full h-full border-0" />
          ) : (
            <span className="text-xs text-muted-foreground">PDF preview unavailable</span>
          )}
        </div>
      ) : (
        <Textarea
          rows={22}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onHtmlChange?.(formatPlainTextAsRichHtml(e.target.value));
          }}
          className="font-mono text-xs leading-relaxed bg-background h-[62vh] min-h-[460px]"
        />
      )}
    </div>
  );
}
