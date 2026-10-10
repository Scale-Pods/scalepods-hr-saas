"use client";

import type { CampaignsRow } from "@scalepods/core";
import { useState } from "react";
import { showErrorToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
import { extractTextFromFile } from "@/lib/extract-text";
import { parseResumeContact } from "@/lib/parse-resume";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { type DropFile, UploadDropzone } from "./UploadDropzone";

/** Upload resume files and submit application intake through the n8n gateway. */
export function ResumeUploader({
  campaign,
  accountId,
  accessToken,
  onComplete,
}: {
  campaign: CampaignsRow;
  accountId: string | undefined;
  accessToken: string | undefined;
  onComplete: () => void;
}) {
  const [files, setFiles] = useState<DropFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const patch = (i: number, p: Partial<DropFile>) =>
    setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...p } : f)));

  /** Read a resume, prefill name/email/phone, and leave them editable. */
  const extractContact = async (file: File) => {
    setFiles((prev) =>
      prev.map((f) => (f.file === file ? { ...f, note: "Extracting contact…" } : f)),
    );
    const parsed = await parseResumeContact(file);
    setFiles((prev) =>
      prev.map((f) =>
        f.file === file
          ? {
              ...f,
              email: f.email || parsed.email || "",
              name: f.name || parsed.name || file.name.replace(/\.[^.]+$/, ""),
              phone: f.phone || parsed.phone || "",
              // Keep the reason visible so a failed read stands out (e.g.
              // scanned PDFs) without blocking the batch upload.
              note: parsed.error ?? undefined,
            }
          : f,
      ),
    );
  };

  const uploadAll = async () => {
    if (!campaign.jd_text || !accountId) {
      showErrorToast("This campaign has no JD yet — add one before screening resumes.");
      return;
    }
    if (files.some((f) => f.status === "rejected")) {
      showErrorToast("Remove invalid files before adding candidates.");
      return;
    }
    const missing = files.find((f) => !f.email?.trim());
    if (missing) {
      showErrorToast(
        `File "${missing.file.name}" is missing a candidate email. Please enter an email before scoring.`,
      );
      return;
    }
    const emailList = files.map((f) => f.email?.trim().toLowerCase());
    const uniqueEmails = new Set(emailList);
    if (uniqueEmails.size !== emailList.length) {
      showErrorToast(
        "Multiple resumes share the same email address. Each candidate must have a unique email address.",
      );
      return;
    }

    setUploading(true);
    try {
      await Promise.all(
        files.map(async (row, i) => {
          patch(i, { status: "uploading", note: "Uploading…" });
          try {
            const extracted = await extractTextFromFile(row.file);
            if ("error" in extracted || !extracted.text.trim()) {
              throw new Error(
                "Could not extract resume text for screening. Upload a text-based PDF, DOCX, or TXT resume.",
              );
            }
            const supabase = supabaseBrowser();
            const filePath = `${accountId}/${campaign.id}/${Date.now()}_${encodeURIComponent(row.file.name)}`;
            const { error: uploadErr } = await supabase.storage
              .from("resumes")
              .upload(filePath, row.file, { upsert: true });

            if (uploadErr) {
              throw uploadErr;
            }

            const intakeRes = await fetch("/api/applications/intake", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
              },
              body: JSON.stringify({
                campaign_id: campaign.id,
                candidate_name: row.name ?? row.file.name.replace(/\.[^.]+$/, ""),
                candidate_email: row.email,
                candidate_phone: row.phone || null,
                resume_path: filePath,
                resume_text: extracted.text.slice(0, 40000),
                whatsapp_opt_in: false,
              }),
            });

            if (!intakeRes.ok) {
              const errJson = await intakeRes.json().catch(() => ({}));
              await supabase.storage.from("resumes").remove([filePath]);
              throw new Error(errJson.error || "Failed to create application");
            }

            patch(i, { status: "done", note: "Resume scored; ready for recruiter review" });
          } catch (err) {
            patch(i, { status: "error", note: err instanceof Error ? err.message : "Failed" });
          }
        }),
      );
      onComplete();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <UploadDropzone
        files={files}
        onFiles={(next) => {
          const added = next.filter((n) => !files.some((p) => p.file.name === n.file.name));
          setFiles(next);
          for (const a of added) void extractContact(a.file);
        }}
        onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
      />
      <div className="mt-4 flex items-center justify-end gap-3">
        <Button
          size="sm"
          onClick={() => void uploadAll()}
          disabled={uploading || files.length === 0}
        >
          {uploading
            ? "Adding candidates…"
            : `Add ${files.length} candidate${files.length === 1 ? "" : "s"}`}
        </Button>
      </div>
      <div className="mt-3 space-y-1.5">
        {files.map((f, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: same filename may be dropped twice
            key={`${f.file.name}-${i}`}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-separator/60 bg-fill-quaternary/50 px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-xs text-label-secondary">
              {f.file.name}
            </span>
            <input
              className="rounded border border-input px-2 py-1 text-xs"
              placeholder="Name"
              value={f.name ?? ""}
              disabled={f.status !== "idle" && f.status !== "error"}
              onChange={(e) => patch(i, { name: e.target.value })}
            />
            <input
              className="rounded border border-input px-2 py-1 text-xs"
              placeholder="Email"
              type="email"
              value={f.email ?? ""}
              disabled={f.status !== "idle" && f.status !== "error"}
              onChange={(e) => patch(i, { email: e.target.value })}
            />
            <input
              className="rounded border border-input px-2 py-1 text-xs"
              placeholder="Phone"
              value={f.phone ?? ""}
              disabled={f.status !== "idle" && f.status !== "error"}
              onChange={(e) => patch(i, { phone: e.target.value })}
            />
            <StatusPill f={f} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ f }: { f: DropFile }) {
  if (f.status === "idle")
    return <span className="text-xs text-label-secondary">{f.note ?? "ready"}</span>;
  if (f.status === "error")
    return <span className="text-xs font-medium text-destructive">{f.note}</span>;
  if (f.status === "done")
    return <span className="text-xs font-medium text-success">{f.note}</span>;
  if (f.status === "rejected")
    return <span className="text-xs font-medium text-destructive">Rejected</span>;
  return <span className={cn("text-xs text-label-secondary")}>{f.note ?? f.status}</span>;
}
