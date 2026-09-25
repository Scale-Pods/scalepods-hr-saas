"use client";

import type { AssignmentContext } from "@scalepods/core";
import { formatCountdown } from "@scalepods/core";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchAssignmentContext,
  insertAssignmentSubmission,
  scoreAssignment,
  signUploads,
} from "@/features/candidate/api";

function ErrorCard({ message }: { message?: string }) {
  return (
    <Card className="w-full">
      <CardContent className="py-10 text-center">
        <h1 className="text-sm font-semibold text-foreground">This link isn&apos;t working</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {message ?? "The link may have expired. Ask the recruiter for a fresh link."}
        </p>
      </CardContent>
    </Card>
  );
}

export default function AssignmentPage() {
  const { id: roundInstanceId } = useParams<{ id: string }>();
  const token = useSearchParams().get("tok") ?? "";
  const fileRef = useRef<HTMLInputElement>(null);

  const [ctx, setCtx] = useState<AssignmentContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!roundInstanceId || !token) {
      setError("Missing link parameters.");
      return;
    }
    let cancelled = false;
    fetchAssignmentContext(roundInstanceId, token)
      .then((c) => {
        if (cancelled) return;
        setCtx(c);
        if (c.submission?.submitted_at) setSubmitted(true);
        if (new Date(c.round_instance.deadline_at ?? 0).getTime() < Date.now())
          setError("This assignment's deadline has passed.");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Link invalid or expired.");
      });
    return () => {
      cancelled = true;
    };
  }, [roundInstanceId, token]);

  const deadline = useMemo(() => {
    if (!ctx?.round_instance.deadline_at) return null;
    const ms = new Date(ctx.round_instance.deadline_at).getTime() - Date.now();
    if (ms <= 0) return null;
    return formatCountdown(ctx.round_instance.deadline_at);
  }, [ctx]);

  const submit = useCallback(async () => {
    if (!ctx || !roundInstanceId) return;
    if (!text.trim() && files.length === 0) return;
    setWorking(true);
    try {
      let filePaths: string[] = [];
      if (files.length > 0) {
        const { uploads } = await signUploads(
          "assignment",
          roundInstanceId,
          files.map((f) => f.name),
          token,
        );
        const puts = files.map((f) => {
          const target = uploads.find((u) => u.name === f.name.replace(/[^A-Za-z0-9._-]/g, "_"));
          return target
            ? fetch(target.url, { method: "PUT", body: f }).then(() => target.name)
            : Promise.resolve<string | null>(null);
        });
        filePaths = (await Promise.all(puts)).filter((p): p is string => !!p);
      }
      setUploading(true);
      const submissionId = await insertAssignmentSubmission(
        roundInstanceId,
        token,
        text,
        filePaths,
      );
      void scoreAssignment(roundInstanceId, submissionId);
      setSubmitted(true);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setUploading(false);
      setWorking(false);
    }
  }, [ctx, files, roundInstanceId, text, token]);

  if (error) return <ErrorCard message={error} />;
  if (!ctx) {
    return (
      <div className="py-20 text-center text-sm text-label-secondary">Loading assignment…</div>
    );
  }

  if (submitted) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fill-quaternary/70 text-2xl">
          📤
        </div>
        <h1 className="text-2xl font-bold tracking-[-0.022em] text-foreground">
          Assignment submitted
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-label-secondary">
          Thanks! We&apos;ve received your submission for round {ctx.round.round_number}. The
          recruiter will get back to you within a few business days.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.022em] text-foreground">
          Take-home assignment
        </h1>
        <p className="mt-1.5 text-sm text-label-secondary">
          {ctx.campaign.name} · Round {ctx.round.round_number} of {ctx.campaign.number_of_rounds}
        </p>
        {deadline && (
          <p
            className={`mt-4 text-[34px] font-light leading-none tracking-[-0.03em] tabular-nums ${
              deadline.includes("0h") ? "text-destructive" : "text-foreground"
            }`}
          >
            {deadline}
          </p>
        )}
      </div>

      {ctx.campaign.jd_text && (
        <details className="rounded-[20px] border border-border/60 bg-glass/70 p-4 backdrop-blur">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Read the job description
          </summary>
          <p className="mt-2 whitespace-pre-wrap rounded-[14px] bg-fill-quaternary/70 p-3 text-xs leading-relaxed text-label-secondary">
            {ctx.campaign.jd_text}
          </p>
        </details>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-label-secondary">Your answer</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="Write your submission here… (you can also attach files)"
          className="w-full rounded-[14px] border border-border/70 bg-fill-quaternary/70 p-3 text-sm text-foreground placeholder:text-label-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-label-secondary">Attachments (optional)</p>
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span
                key={f.name}
                className="inline-flex items-center gap-1 rounded-[14px] bg-fill-quaternary/70 px-3 py-2 text-xs text-foreground"
              >
                {f.name}
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-[14px] border border-dashed border-border/70 bg-fill-quaternary/70 px-3 py-4 text-sm text-label-secondary transition-colors hover:border-primary hover:bg-fill-secondary hover:text-primary"
        >
          + Add files (PDF, DOCX, images)
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.zip"
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      <Button
        className="w-full"
        onClick={submit}
        disabled={working || (!text.trim() && files.length === 0) || uploading}
      >
        {working
          ? "Submitting…"
          : ctx.submission?.submitted_at
            ? "Update submission"
            : "Submit assignment"}
      </Button>
    </div>
  );
}
