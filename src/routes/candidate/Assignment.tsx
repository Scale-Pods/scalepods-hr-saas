import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { anonClient } from "../../lib/supabase";
import { callEdge } from "../../lib/edge";
import { assignmentContextSchema, type AssignmentContext } from "../../lib/schemas";
import { CandidateShell, ErrorCard, useCandidateToken } from "./shared";

export function AssignmentPage() {
  const { round_instance_id } = useParams();
  const token = useCandidateToken();
  const fileRef = useRef<HTMLInputElement>(null);

  const [ctx, setCtx] = useState<AssignmentContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!round_instance_id || !token) {
      setError("Missing link parameters.");
      return;
    }
    let cancelled = false;
    anonClient()
      .rpc("get_assignment_context", { p_round_instance_id: round_instance_id, p_token: token })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message ?? "Link invalid or expired.");
          return;
        }
        const parsed = assignmentContextSchema.safeParse(data);
        if (!parsed.success) {
          setError("Unrecognised assignment context.");
          return;
        }
        const c = parsed.data;
        setCtx(c);
        if (c.submission?.submitted_at) setSubmitted(true);
        if (new Date(c.round_instance.deadline_at ?? 0).getTime() < Date.now()) setError("This assignment's deadline has passed.");
      });
    return () => { cancelled = true; };
  }, [round_instance_id, token]);

  const deadline = useMemo(() => {
    if (!ctx?.round_instance.deadline_at) return null;
    const ms = new Date(ctx.round_instance.deadline_at).getTime() - Date.now();
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m remaining`;
  }, [ctx]);

  const submit = useCallback(async () => {
    if (!ctx || !round_instance_id) return;
    if (!text.trim() && files.length === 0) return;
    setWorking(true);
    try {
      let filePaths: string[] = [];
      if (files.length > 0) {
        const { uploads } = await callEdge<{ bucket: string; uploads: { name: string; url: string }[] }>("sign-upload", {
          body: {
            token,
            kind: "assignment",
            resource_id: round_instance_id,
            file_names: files.map((f) => f.name),
          },
        });
        const puts = files.map((f) => {
          const target = uploads.find((u) => u.name === f.name.replace(/[^A-Za-z0-9._-]/g, "_"));
          return target ? fetch(target.url, { method: "PUT", body: f }).then(() => target.name) : Promise.resolve<string | null>(null);
        });
        filePaths = (await Promise.all(puts)).filter((p): p is string => !!p);
      }

      setUploading(true);
      const { data, error } = await anonClient().rpc("insert_assignment_submission", {
        p_round_instance_id: round_instance_id,
        p_token: token,
        p_text_response: text,
        p_file_paths: filePaths,
      });
      if (error) throw error;
      const submissionId = data as string;

      // Kick off the thin evaluator (LLM eval -> n8n /round-evaluate for cutoff).
      void callEdge("score-assignment", { body: { round_instance_id, submission_id: submissionId } }).catch(() => {});

      setSubmitted(true);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setUploading(false);
      setWorking(false);
    }
  }, [ctx, files, round_instance_id, text, token]);

  if (error) return <CandidateShell><ErrorCard message={error} /></CandidateShell>;

  if (!ctx) {
    return (
      <CandidateShell>
        <div className="py-20 text-center text-sm text-muted-foreground">Loading assignment…</div>
      </CandidateShell>
    );
  }

  if (submitted) {
    return (
      <CandidateShell>
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl">
            📤
          </div>
          <h1 className="text-lg font-semibold text-foreground">Assignment submitted</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Thanks! We've received your submission for round {ctx.round.round_number}. The recruiter will get back to you
            within a few business days.
          </p>
        </div>
      </CandidateShell>
    );
  }

  return (
    <CandidateShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Take-home assignment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ctx.campaign.name} · Round {ctx.round.round_number} of {ctx.campaign.number_of_rounds}
          </p>
          {deadline && (
            <p className={`mt-1 text-xs font-medium ${deadline.includes("0h") ? "text-destructive" : "text-muted-foreground"}`}>
              {deadline}
            </p>
          )}
        </div>

        {ctx.campaign.jd_text && (
          <details className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Read the job description
            </summary>
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
              {ctx.campaign.jd_text}
            </p>
          </details>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Your answer</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="Write your submission here… (you can also attach files)"
            className="w-full rounded-lg border border-border p-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Attachments (optional)</p>
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {f.name}
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-muted-foreground">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-input bg-card px-3 py-4 text-sm text-muted-foreground hover:border-primary hover:text-primary"
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

        <button
          onClick={() => void submit()}
          disabled={working || (!text.trim() && files.length === 0) || uploading}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary disabled:bg-muted disabled:text-muted-foreground"
        >
          {working ? "Submitting…" : ctx.submission?.submitted_at ? "Update submission" : "Submit assignment"}
        </button>
      </div>
    </CandidateShell>
  );
}