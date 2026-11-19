"use client";

import { type CampaignsRow, TierLimitError } from "@scalepods/core";
import { X } from "lucide-react";
import { useState } from "react";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
import { extractTextFromFile } from "@/lib/extract-text";
import { normalizePhoneNumber, parseResumeContact } from "@/lib/parse-resume";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { type DropFile, UploadDropzone } from "./UploadDropzone";

/** Upload resume files and submit application intake through the n8n gateway. */
export function ResumeUploader({
  campaign,
  accountId,
  accessToken,
  hasVoiceRound: propHasVoiceRound,
  onComplete,
}: {
  campaign: CampaignsRow;
  accountId: string | undefined;
  accessToken: string | undefined;
  hasVoiceRound?: boolean;
  onComplete: () => void;
}) {
  const hasVoiceRound = propHasVoiceRound ?? Boolean(campaign.voice_call_config);
  const [files, setFiles] = useState<DropFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const patch = (file: File, p: Partial<DropFile>) =>
    setFiles((prev) => prev.map((f) => (f.file === file ? { ...f, ...p } : f)));

  const removeFile = (file: File) => setFiles((prev) => prev.filter((f) => f.file !== file));

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
    if (hasVoiceRound) {
      const missingPhone = files.find((f) => !f.phone?.trim());
      if (missingPhone) {
        showErrorToast(
          `Candidate "${missingPhone.name || missingPhone.file.name}" requires a phone number because this campaign includes an AI voice call round.`,
        );
        patch(missingPhone.file, {
          status: "error",
          note: "Phone number required for AI voice screening",
        });
        return;
      }
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
    let successCount = 0;
    try {
      await Promise.all(
        files.map(async (row) => {
          patch(row.file, { status: "uploading", note: "Uploading…" });
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
                candidate_phone: normalizePhoneNumber(row.phone) || null,
                resume_path: filePath,
                resume_text: extracted.text.slice(0, 40000),
                whatsapp_opt_in: true,
              }),
            });

            if (!intakeRes.ok) {
              const errJson = (await intakeRes.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
                code?: string;
                detail?: string;
                reason?: string;
              };
              await supabase.storage.from("resumes").remove([filePath]);
              if (intakeRes.status === 402 || intakeRes.status === 403) {
                showErrorToast(
                  new TierLimitError(
                    "/api/applications/intake",
                    errJson.error || "Plan limit reached",
                    errJson.detail ||
                      "You have reached your monthly resume screening limit. Please upgrade your plan in Billing to screen more candidates.",
                    errJson.reason || "resumes_screened_limit",
                    intakeRes.status,
                  ),
                );
                throw new Error("Plan limit reached: upgrade in Billing to continue screening");
              }
              if (
                intakeRes.status === 409 ||
                errJson.code === "candidate_already_uploaded" ||
                /candidate_already_uploaded|already uploaded|already added|23505/i.test(
                  errJson.error || errJson.message || "",
                )
              ) {
                throw new Error("Candidate already added to this campaign");
              }
              if (
                errJson.code === "phone_required" ||
                /phone_required|phone.*required/i.test(errJson.error || errJson.message || "")
              ) {
                throw new Error("Phone number is required for AI voice screening");
              }
              if (
                errJson.code === "campaign_has_no_rounds" ||
                /campaign_has_no_rounds/i.test(errJson.error || errJson.message || "")
              ) {
                throw new Error("Campaign has no interview rounds configured");
              }
              if (
                errJson.code === "campaign_closed" ||
                /campaign_closed/i.test(errJson.error || errJson.message || "")
              ) {
                throw new Error("This campaign is closed and cannot accept new candidates");
              }
              if (
                errJson.code === "quota_exceeded" ||
                /quota_exceeded|insufficient_quota|rate_limit/i.test(
                  errJson.error || errJson.message || "",
                )
              ) {
                throw new Error("AI screening quota exceeded. Please try again later");
              }
              throw new Error(errJson.error || errJson.message || "Failed to create application");
            }

            successCount++;
            patch(row.file, { status: "done", note: "Added to pipeline" });
            // Candidate is added to the Kanban board
            onComplete();
            // Automatically remove the candidate from upload resumes card once added
            await new Promise((resolve) => setTimeout(resolve, 600));
            removeFile(row.file);
          } catch (err) {
            patch(row.file, {
              status: "error",
              note: err instanceof Error ? err.message : "Failed",
            });
          }
        }),
      );

      if (successCount > 0) {
        showToast(
          `${successCount} candidate${successCount === 1 ? "" : "s"} added to hiring pipeline`,
          { kind: "success" },
        );
      }
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
              className="w-full sm:w-auto sm:flex-1 rounded-lg border border-input bg-card px-2.5 py-1 text-xs"
              placeholder="Name"
              value={f.name ?? ""}
              disabled={f.status !== "idle" && f.status !== "error"}
              onChange={(e) => patch(f.file, { name: e.target.value })}
            />
            <input
              className="w-full sm:w-auto sm:flex-1 rounded-lg border border-input bg-card px-2.5 py-1 text-xs"
              placeholder="Email"
              type="email"
              value={f.email ?? ""}
              disabled={f.status !== "idle" && f.status !== "error"}
              onChange={(e) => patch(f.file, { email: e.target.value })}
            />
            <input
              className="w-full sm:w-auto sm:flex-1 rounded-lg border border-input bg-card px-2.5 py-1 text-xs"
              placeholder={hasVoiceRound ? "Phone (Required for Voice Call)" : "Phone"}
              value={f.phone ?? ""}
              disabled={f.status !== "idle" && f.status !== "error"}
              onChange={(e) => patch(f.file, { phone: e.target.value })}
            />
            <div className="w-full sm:w-auto flex items-center justify-end gap-2">
              <StatusPill f={f} />
              {f.status !== "uploading" && (
                <button
                  type="button"
                  onClick={() => removeFile(f.file)}
                  aria-label={`Remove ${f.file.name}`}
                  className="rounded p-1 text-label-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
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
