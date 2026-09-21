import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { browserClient } from "../lib/supabase";
import { callWebhook } from "../lib/n8n";
import { parseResumeContact } from "../lib/parse-resume";
import type { CampaignRoundsRow, CampaignsRow } from "../lib/types";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Toggle } from "../components/ui/Toggle";
import { Badge } from "../components/ui/Badge";
import { RoundStepper } from "../components/RoundStepper";
import { UploadDropzone, type DropFile } from "../components/UploadDropzone";
import { Input } from "../components/ui/Input";
import { EmptyState } from "../components/EmptyState";
import { showErrorToast } from "../hooks/useToast";

interface ViewCandidate {
  candidate_id: string;
  name: string | null;
  email: string;
  phone: string | null;
  current_stage: string | null;
  latest_score: number | null;
  decision: string | null;
}

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const supabase = browserClient();

  const [campaign, setCampaign] = useState<CampaignsRow | null>(null);
  const [rounds, setRounds] = useState<CampaignRoundsRow[]>([]);
  const [candidates, setCandidates] = useState<ViewCandidate[]>([]);
  const [roundStatuses, setRoundStatuses] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, r, v, statuses] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", id).maybeSingle(),
        supabase.from("campaign_rounds").select("*").eq("campaign_id", id).order("round_number"),
        supabase.from("campaign_candidates").select("*").eq("campaign_id", id).order("name", { ascending: true }),
        supabase
          .from("round_instances")
          .select("round_number,status")
          .eq("campaign_id", id)
          .in("status", ["passed", "failed", "no_show"]),
      ]);
      if (c.error) showErrorToast(c.error);
      else setCampaign(c.data as CampaignsRow | null);
      if (!r.error && r.data) setRounds(r.data as CampaignRoundsRow[]);
      if (!v.error && v.data) setCandidates(v.data as unknown as ViewCandidate[]);
      if (!statuses.error && statuses.data) {
        // Latest decided outcome per round across the pipeline.
        const byRound: Record<number, string> = {};
        for (const s of statuses.data as { round_number: number; status: string }[]) {
          byRound[s.round_number] = s.status;
        }
        setRoundStatuses(byRound);
      }
    } catch (err) {
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleStatus = async () => {
    if (!campaign || !user) return;
    setToggling(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      await callWebhook("campaigns", {
        body: {
          action: "update",
          account_id: user.id,
          campaign_id: campaign.id,
          status: campaign.status === "on" ? "off" : "on",
        },
        accessToken: token,
      });
      setCampaign({ ...campaign, status: campaign.status === "on" ? "off" : "on" });
    } catch (err) {
      showErrorToast(err);
    } finally {
      setToggling(false);
    }
  };

  const roundTypes: Record<number, CampaignRoundsRow["round_type"]> = {};
  for (const r of rounds) roundTypes[r.round_number] = r.round_type;

  if (loading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading campaign…</div>;
  }
  if (!campaign) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">Campaign not found.</p>
        <Link to="/dashboard" className="mt-2 inline-block text-sm font-medium text-primary">
          Back to dashboard
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/campaigns"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        ← All campaigns
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{campaign.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {campaign.jd_text?.slice(0, 120) || "No JD"}
            {campaign.jd_text && campaign.jd_text.length > 120 ? "…" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{campaign.status === "on" ? "Active" : "Paused"}</span>
          <Toggle checked={campaign.status === "on"} onChange={() => void toggleStatus()} disabled={toggling} label="Campaign status" />
        </div>
      </div>

      <Card>
        <CardHeader title="Round pipeline" subtitle="Same cutoff-check engine for every round type" />
        <RoundStepper numberOfRounds={campaign.number_of_rounds} types={roundTypes} statuses={roundStatuses} />
      </Card>

      <ResumeUploader campaign={campaign} onComplete={load} />

      <Card>
        <CardHeader title="Candidates" subtitle={`${candidates.length} in this campaign`} />
        <CandidateTable candidates={candidates} />
      </Card>
    </div>
  );
}

function CandidateTable({ candidates }: { candidates: ViewCandidate[] }) {
  if (candidates.length === 0) {
    return (
      <EmptyState
        title="No candidates yet"
        hint="Upload resumes above — each file kicks off resume screening and the candidate will start appearing here with a score."
        className="py-8"
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Stage</th>
            <th className="py-2 pr-3 font-medium">Latest score</th>
            <th className="py-2 font-medium">Decision</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {candidates.map((c) => (
            <tr key={c.candidate_id} className="group cursor-pointer hover:bg-muted">
              <td className="py-2.5 pr-3">
                <div>
                  <p className="font-medium text-foreground">{c.name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                </div>
              </td>
              <td className="py-2.5 pr-3 text-muted-foreground">{c.current_stage ?? "—"}</td>
              <td className="py-2.5 pr-3 text-muted-foreground">{c.latest_score ?? "—"}</td>
              <td className="py-2.5">
                <DecisionBadge decision={c.decision} />
              </td>
              <td className="py-2.5 pl-3 text-right">
                <Link
                  to={`/candidates/${c.candidate_id}`}
                  className="text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100"
                >
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <span className="text-xs text-muted-foreground">Pending</span>;
  const tone =
    decision === "pass" || decision === "hired"
      ? "success"
      : decision === "reject" || decision === "failed"
        ? "danger"
        : decision === "no_show"
          ? "warning"
          : "neutral";
  return <Badge tone={tone}>{decision}</Badge>;
}

function ResumeUploader({ campaign, onComplete }: { campaign: CampaignsRow; onComplete: () => void }) {
  const supabase = browserClient();
  const { user } = useAuth();
  const [files, setFiles] = useState<DropFile[]>([]);
  const [resumeCutoff, setResumeCutoff] = useState(60);
  const [uploading, setUploading] = useState(false);

  const patch = (i: number, p: Partial<DropFile>) =>
    setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...p } : f)));

  /** Read a resume, prefill name/email/phone, and leave them editable. */
  const extractContact = async (file: File) => {
    setFiles((prev) =>
      prev.map((f) => (f.file === file ? { ...f, note: "Extracting contact…" } : f))
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
              note: undefined,
            }
          : f
      )
    );
  };

  const uploadAll = async () => {
    if (!campaign.jd_text) {
      showErrorToast("This campaign has no JD yet — add one before screening resumes.");
      return;
    }
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const row = files[i];
        if (!row.email && !row.name) {
          patch(i, { status: "error", note: "Need a name or email" });
          continue;
        }
        patch(i, { status: "uploading", note: "Uploading…" });
        const form = new FormData();
        form.append("resume_file", row.file);
        form.append("account_id", user!.id);
        form.append("campaign_id", campaign.id);
        form.append("jd_text", campaign.jd_text);
        form.append("candidate_email", row.email ?? "");
        form.append("candidate_name", row.name ?? row.file.name.replace(/\.[^.]+$/, ""));
        form.append("candidate_phone", row.phone ?? "");
        form.append("resume_cutoff", String(resumeCutoff));
        try {
          await callWebhook("candidate-intake", { formData: form, accessToken: token });
          patch(i, { status: "screening", note: "Screening…" });
          await pollForScore(row.email ?? "", (score, _note) => {
            if (score != null) patch(i, { status: "done", note: `Scored ${score}` });
          });
        } catch (err) {
          patch(i, { status: "error", note: err instanceof Error ? err.message : "Failed" });
        }
      }
      onComplete();
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Upload resumes"
        subtitle="Each file goes through intake → text extraction → LLM scoring against this JD (workflow 1)."
        action={
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Resume cutoff</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={resumeCutoff}
              onChange={(e) => setResumeCutoff(Math.max(0, Math.min(100, Number(e.target.value))))}
              className="w-20 !py-1 text-xs"
              aria-label="Resume cutoff"
            />
            <Button size="sm" onClick={() => void uploadAll()} loading={uploading} disabled={files.length === 0}>
              Screen {files.length} file{files.length === 1 ? "" : "s"}
            </Button>
          </div>
        }
      />
      <UploadDropzone
        files={files}
        onFiles={(next) => {
          const added = next.filter((n) => !files.some((p) => p.file.name === n.file.name));
          const merged = [...added, ...files.filter((p) => !next.some((n) => n.file.name === p.file.name))];
          setFiles(merged);
          for (const a of added) void extractContact(a.file);
        }}
        onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
      />
      <div className="mt-2 space-y-1.5">
        {files.map((f, i) => (
          <div key={`${f.file.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{f.file.name}</span>
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
    </Card>
  );
}

function StatusPill({ f }: { f: DropFile }) {
  if (f.status === "idle") return <span className="text-xs text-muted-foreground">{f.note ?? "ready"}</span>;
  if (f.status === "error") return <span className="text-xs font-medium text-destructive">{f.note}</span>;
  if (f.status === "done") return <span className="text-xs font-medium text-success">{f.note}</span>;
  if (f.status === "rejected") return <span className="text-xs font-medium text-destructive">Rejected</span>;
  return <span className="text-xs text-muted-foreground">{f.note ?? f.status}</span>;
}

async function pollForScore(
  email: string,
  onProgress: (score: number | null, note: string) => void
): Promise<void> {
  const supabase = browserClient();
  const deadline = Date.now() + 120_000;
  const e = email.trim().toLowerCase();
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from("candidates")
      .select("id")
      .eq("email", e)
      .maybeSingle();
    if (data?.id) {
      const { data: rows } = await supabase
        .from("decision_ledger")
        .select("stage,score,rationale")
        .eq("candidate_id", data.id)
        .eq("stage", "resume")
        .order("decided_at", { ascending: false })
        .limit(1);
      const latest = rows?.[0];
      if (latest) {
        onProgress(latest.score == null ? null : latest.score, latest.rationale ?? "");
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  onProgress(null, "Timed out");
}