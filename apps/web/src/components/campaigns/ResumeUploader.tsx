"use client";

import type { CampaignsRow } from "@scalepods/core";
import { useState } from "react";
import { showErrorToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseResumeContact } from "@/lib/parse-resume";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { callWorkflow } from "@/lib/webhooks";
import { type DropFile, UploadDropzone } from "./UploadDropzone";

/** Submit a batch of resumes to workflow 1 and surface per-file progress. */
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
    setUploading(true);
    const jdText = campaign.jd_text;
    try {
      await Promise.all(
        files.map(async (row, i) => {
          patch(i, { status: "uploading", note: "Uploading…" });
          const form = new FormData();
          form.append("resume_file", row.file);
          form.append("account_id", accountId);
          form.append("campaign_id", campaign.id);
          form.append("jd_text", jdText);
          form.append("candidate_email", row.email ?? "");
          form.append("candidate_name", row.name ?? row.file.name.replace(/\.[^.]+$/, ""));
          form.append("candidate_phone", row.phone ?? "");
          form.append("resume_cutoff", "0");
          try {
            await callWorkflow("candidate-intake", { formData: form, accessToken });
            patch(i, { status: "screening", note: "Screening…" });
            // Score polling needs the candidate's email; without it the
            // backend still screens the file (it re-extracts contact info
            // server-side) but we can't track the score here.
            if (row.email?.trim()) {
              await pollForScore(row.email, (score, _note) => {
                if (score != null) patch(i, { status: "done", note: `Scored ${score}` });
              });
            } else {
              patch(i, { status: "done", note: "Submitted for screening" });
            }
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
          {uploading ? "Scoring…" : `Score ${files.length} file${files.length === 1 ? "" : "s"}`}
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

/** Poll `decision_ledger` for the resume score of a freshly screened candidate. */
async function pollForScore(
  email: string,
  onProgress: (score: number | null, note: string) => void,
): Promise<void> {
  const supabase = supabaseBrowser();
  const deadline = Date.now() + 120_000;
  const e = email.trim().toLowerCase();
  while (Date.now() < deadline) {
    const { data } = await supabase.from("candidates").select("id").eq("email", e).maybeSingle();
    if (data?.id) {
      const { data: rows } = await (supabase.from("decision_ledger") as any)
        .select("stage,score,rationale,created_at")
        .eq("candidate_id", data.id)
        .order("created_at", { ascending: false });

      const latest =
        (
          (rows ?? []) as any[] as {
            stage: string;
            score: number | null;
            rationale: string | null;
          }[]
        ).find(
          (r) =>
            r.stage.toLowerCase().includes("resume") || r.stage.toLowerCase().includes("screen"),
        ) || rows?.[0];

      if (latest && latest.score != null) {
        onProgress(latest.score, latest.rationale ?? "");
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  onProgress(null, "Timed out");
}
