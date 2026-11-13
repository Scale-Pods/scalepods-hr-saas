"use client";

import {
  CheckCircle2,
  FileSignature,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { OfferTemplateEditor } from "@/components/offers/OfferTemplateEditor";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/hooks";
import { extractOfferTemplateFromFile } from "@/lib/extract-text";
import { extractCustomOfferVariables } from "@/lib/offer-template-utils";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface OfferTemplateItem {
  id: string;
  name: string;
  file_name: string;
  storage_path: string;
  raw_text: string;
  html_content?: string | null;
  variables: string[];
  is_default: boolean;
  created_at: string;
}

export function OfferTemplateManager() {
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<OfferTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editHtml, setEditHtml] = useState("");
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadText, setUploadText] = useState("");
  const [uploadHtml, setUploadHtml] = useState("");
  const [uploadVars, setUploadVars] = useState<string[]>([]);
  const [parsingWithAi, setParsingWithAi] = useState(false);
  const [setDefault, setSetDefault] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, [session?.access_token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/offer-templates", { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTemplates(data.templates ?? []);
    } catch (err) {
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".docx")) {
      showErrorToast("Only Word documents (.docx) are supported for offer letters.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploadFile(file);
    if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ""));

    const result = await extractOfferTemplateFromFile(file);
    if ("error" in result) {
      showErrorToast(result.error);
      setUploadText("");
      setUploadHtml("");
      setUploadVars([]);
      return;
    }

    setUploadText(result.text);
    setUploadHtml(result.html);
    setParsingWithAi(true);

    try {
      const res = await fetch("/api/offer-templates/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          raw_text: result.text,
          html_content: result.html,
          file_name: file.name,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUploadText(data.cleaned_text || result.text);
        setUploadHtml(data.cleaned_html || result.html);
        const keys = Array.isArray(data.variables)
          ? data.variables.map((v: { key: string }) => v.key)
          : extractCustomOfferVariables(data.cleaned_html || data.cleaned_text);
        setUploadVars(keys);
        showToast("Claude AI parsed document & extracted dynamic variables.");
      } else {
        setUploadVars(extractCustomOfferVariables(result.html || result.text));
      }
    } catch {
      setUploadVars(extractCustomOfferVariables(result.html || result.text));
    } finally {
      setParsingWithAi(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadText || !uploadName.trim()) {
      showErrorToast("Please pick a file and enter a template name.");
      return;
    }
    if (!session?.access_token) {
      showErrorToast("Session expired — please refresh.");
      return;
    }

    setUploading(true);
    try {
      const supabase = supabaseBrowser();
      const storagePath = `${session.user.id}/${Date.now()}_${encodeURIComponent(uploadFile.name)}`;
      const { error: uploadErr } = await supabase.storage
        .from("offer-templates")
        .upload(storagePath, uploadFile, { upsert: false });
      if (uploadErr) throw uploadErr;

      const res = await fetch("/api/offer-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: uploadName.trim(),
          file_name: uploadFile.name,
          storage_path: storagePath,
          raw_text: uploadText,
          html_content: uploadHtml || undefined,
          is_default: setDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`Template "${uploadName}" saved.`);
      setShowUpload(false);
      setUploadName("");
      setUploadFile(null);
      setUploadText("");
      setUploadHtml("");
      setUploadVars([]);
      setSetDefault(false);
      if (fileRef.current) fileRef.current.value = "";
      void load();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/offer-templates?id=${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast("Template deleted.");
      void load();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (t: OfferTemplateItem) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditText(t.raw_text || "");
    setEditHtml(t.html_content || "");
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    setEditSaving(true);
    try {
      const updates: Record<string, unknown> = { id: editingId };
      if (editName.trim()) updates.name = editName.trim();
      if (editText.trim()) updates.raw_text = editText.trim();
      if (editHtml.trim()) updates.html_content = editHtml.trim();

      const res = await fetch("/api/offer-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast("Template updated.");
      setEditingId(null);
      setEditText("");
      setEditName("");
      void load();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setEditSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch("/api/offer-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id, is_default: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast("Default template updated.");
      void load();
    } catch (err) {
      showErrorToast(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Upload your company offer letter or agreement (.docx). Claude AI auto-detects dynamic
          variables and standardizes the document.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          onClick={() => setShowUpload((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          Upload Template
        </Button>
      </div>

      {showUpload && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5 text-primary" />
              New Template
            </span>
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Template Name</Label>
              <Input
                placeholder="e.g. Standard Engineer Offer"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Word Document (.docx only)</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileChange}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20 cursor-pointer"
              />
            </div>
          </div>

          {parsingWithAi && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-xs text-primary">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>Claude AI is analyzing template & extracting dynamic variables via n8n...</span>
            </div>
          )}

          {uploadVars.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
              <p className="text-[11px] font-medium text-foreground mb-1.5">
                Detected custom variables — recruiter fills these at send time:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {uploadVars.map((v) => (
                  <Badge key={v} variant="secondary" className="font-mono text-[11px]">
                    {`{{${v}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="set-default"
              checked={setDefault}
              onChange={(e) => setSetDefault(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary"
            />
            <label htmlFor="set-default" className="text-xs text-muted-foreground cursor-pointer">
              Set as default template for new offers
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={uploading || !uploadFile || !uploadText || !uploadName.trim()}
              className="gap-1.5"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
          <FileText className="h-7 w-7 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">No offer templates yet</p>
          <p className="text-xs text-muted-foreground/70">
            Upload a template above to enable the custom offer flow.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          {templates.map((t) => (
            <div key={t.id} className="bg-card">
              {editingId === t.id ? (
                <div className="p-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Template Name</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Edit Template</Label>
                    <OfferTemplateEditor
                      value={editText}
                      onChange={setEditText}
                      htmlValue={editHtml}
                      onHtmlChange={setEditHtml}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(null);
                        setEditText("");
                        setEditName("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleEditSave}
                      disabled={editSaving}
                      className="gap-1.5"
                    >
                      {editSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {editSaving ? "Saving…" : "Save Changes"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3 p-3.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40">
                      <FileSignature className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground">{t.name}</span>
                        {t.is_default && (
                          <Badge
                            variant="secondary"
                            className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]"
                          >
                            <Star className="h-2.5 w-2.5" /> Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{t.file_name}</p>
                      {t.variables.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {t.variables.map((v) => (
                            <span
                              key={v}
                              className="inline-block rounded bg-muted/60 border border-border/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            >
                              {`{{${v}}}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!t.is_default && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px] text-muted-foreground gap-1"
                        onClick={() => void handleSetDefault(t.id)}
                        title="Set as default"
                      >
                        <Star className="h-3 w-3" />
                        <span className="hidden sm:inline">Default</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => startEdit(t)}
                      title="Edit template"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                      onClick={() => void handleDelete(t.id)}
                      disabled={deletingId === t.id}
                      title="Delete template"
                    >
                      {deletingId === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
