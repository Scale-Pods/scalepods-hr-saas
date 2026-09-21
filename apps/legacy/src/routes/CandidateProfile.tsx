import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronDown, ChevronUp, ExternalLink, FileText, Redo2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { browserClient } from "../lib/supabase";
import { TIER_LIMITS } from "../lib/tier";
import { BUCKETS } from "../lib/storage";
import { formatDateTime } from "../lib/format";
import type {
  CandidatesRow,
  DecisionLedgerRow,
  InterviewSessionRow,
  OutreachLogRow,
  RoundInstancesRow,
  ScorecardRow,
} from "../lib/types";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import { EmptyState } from "../components/EmptyState";
import { showErrorToast } from "../hooks/useToast";

interface LedgerView extends DecisionLedgerRow {
  session?: InterviewSessionRow;
  scorecard?: ScorecardRow;
  forRound?: RoundInstancesRow;
  recordingExpired?: boolean;
}

export function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { account } = useAuth();
  const supabase = browserClient();

  const [candidate, setCandidate] = useState<CandidatesRow | null>(null);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<LedgerView[]>([]);
  const [outreach, setOutreach] = useState<OutreachLogRow[]>([]);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: cand, error: candErr } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (candErr || !cand) {
      setError(true);
      return;
    }
    setCandidate(cand as CandidatesRow);

    const [ledger, rounds, sessions, logs] = await Promise.all([
      supabase
        .from("decision_ledger")
        .select("*")
        .eq("candidate_id", id)
        .order("decided_at", { ascending: true }),
      supabase.from("round_instances").select("*").eq("candidate_id", id).order("round_number"),
      supabase
        .from("interview_sessions")
        .select("id,round_instance_id,candidate_id,status,invite_link,expires_at,created_at,account_id")
        .eq("candidate_id", id),
      supabase
        .from("outreach_log")
        .select("*")
        .eq("candidate_id", id)
        .order("sent_at", { ascending: true }),
    ]);

    const roundRows = (rounds.data ?? []) as RoundInstancesRow[];
    const sessionRows = (sessions.data ?? []) as InterviewSessionRow[];

    const campaignIds = Array.from(new Set(roundRows.map((r) => r.campaign_id)));
    if (campaignIds.length > 0) {
      const { data: camps } = await supabase
        .from("campaigns")
        .select("id,name")
        .in("id", campaignIds)
        .limit(5);
      const names = ((camps ?? []) as { id: string; name: string }[])
        .map((c) => c.name)
        .join(", ");
      if (names) setCampaignName(names);
    }

    const scorecardBySession = new Map<string, ScorecardRow>();
    if (sessionRows.length) {
      const ids = sessionRows.map((s) => s.id);
      const { data: cards } = await supabase
        .from("scorecards")
        .select("*")
        .in("session_id", ids);
      for (const sc of (cards ?? []) as ScorecardRow[]) scorecardBySession.set(sc.session_id, sc);
    }

    const retentionDays = TIER_LIMITS[account?.tier ?? "free"].retentionDays;
    const now = Date.now();

    const view = ((ledger.data ?? []) as DecisionLedgerRow[]).map((row) => {
      const roundNumber = roundNumberFromStage(row.stage);
      const forRound = roundNumber ? roundRows.find((r) => r.round_number === roundNumber) : undefined;
      const session =
        (forRound ? sessionRows.find((s) => s.round_instance_id === forRound.id) : undefined) ??
        (roundNumber === 1 ? sessionRows[0] : undefined);
      const scorecard = session ? scorecardBySession.get(session.id) : undefined;
      let recordingExpired = false;
      if (scorecard) {
        const evaluated = new Date(scorecard.evaluated_at).getTime();
        recordingExpired = now - evaluated > retentionDays * 86_400_000;
      }
      return { ...row, session, scorecard, forRound, recordingExpired };
    });

    setTimeline(view);
    setOutreach((logs.data ?? []) as OutreachLogRow[]);

    if (cand.resume_url) {
      const { data } = await supabase.storage
        .from(BUCKETS.resumes)
        .createSignedUrl(cand.resume_url, 3600);
      // Fall back to the raw path if the file/bucket isn't set up yet.
      setResumeUrl(data?.signedUrl ?? cand.resume_url);
    }
  }, [id, account?.tier, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">Candidate not found.</p>
        <Link to="/dashboard" className="mt-2 inline-block text-sm font-medium text-primary">
          Back to dashboard
        </Link>
      </Card>
    );
  }
  if (!candidate) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading candidate…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard" className="text-xs font-medium text-primary">
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          {candidate.name || "Unnamed"} <span className="text-sm font-normal text-muted-foreground">· {candidate.email}</span>
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {campaignName ?? ""} · added {formatDateTime(candidate.created_at)}
        </p>
      </div>

      {resumeUrl && (
        <Card>
          <CardHeader title="Resume" subtitle="Short-lived signed URL (1 hour)" />
          <a
            href={resumeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-accent-foreground"
          >
            <FileText className="h-4 w-4" aria-hidden /> Open resume{" "}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Candidate timeline"
          subtitle="Every scoring decision, oldest first. Overrides link back to the row they replace."
        />
        <Timeline rows={timeline} />
      </Card>

      <Overrides candidateId={candidate.id} timeline={timeline} onChanged={load} />

      <Card>
        <CardHeader title="Outreach history" subtitle="Every dispatch attempt (stage / channel / delivery state)" />
        <OutreachTable rows={outreach} />
      </Card>
    </div>
  );
}

function roundNumberFromStage(stage: string): number | null {
  const m = /^round_(\d+)$/.exec(stage);
  return m ? Number(m[1]) : null;
}

const STAGE_LABELS: Record<string, string> = {
  resume: "Resume screening",
  voice_screen: "Voice screening",
};

function stageLabel(stage: string): string {
  const n = roundNumberFromStage(stage);
  if (n) return `Round ${n} score`;
  return STAGE_LABELS[stage] ?? stage;
}

function Timeline({ rows }: { rows: LedgerView[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No scored stages yet"
        hint="Scores from resume screening, voice screens and interview rounds will appear here, oldest first."
      />
    );
  }

  return (
    <ol className="relative space-y-3 border-l-2 border-border pl-4">
      {rows.map((row) => {
        const isOpen = open.has(row.id);
        return (
          <li key={row.id} className="relative">
            <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-primary" />
            <button
              onClick={() => toggle(row.id)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{stageLabel(row.stage)}</span>
                  {row.source === "manual" && <Badge tone="warning">Manual override</Badge>}
                  {row.forRound?.retake_of_round_instance_id && (
                    <Badge tone="warning">Platform-fault retake</Badge>
                  )}
                  {row.forRound?.status === "no_show" && <Badge tone="warning">No-show</Badge>}
                  {row.override_of && (
                    <span className="text-xs text-muted-foreground">replaces an earlier entry</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{formatDateTime(row.decided_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-foreground">{row.score ?? "—"}</span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                )}
              </div>
            </button>
            {isOpen && (
              <div className="mt-1 rounded-lg bg-muted p-3 text-sm">
                {row.rationale ? (
                  <p className="whitespace-pre-wrap text-muted-foreground">{row.rationale}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">No rationale recorded.</p>
                )}
                {row.forRound?.fault_reason && (
                  <p className="mt-2 text-xs text-warning">
                    Platform fault recorded — the retake link was sent automatically. Reason:{" "}
                    {row.forRound.fault_reason}
                  </p>
                )}
                {row.scorecard && (
                  <ScorecardSummary row={row} />
                )}
                <p className="mt-2 text-xs text-muted-foreground">{row.id}</p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ScorecardSummary({ row }: { row: LedgerView }) {
  if (!row.scorecard) return null;
  const sc = row.scorecard;
  const dims = [
    ["Technical", sc.technical_score],
    ["Communication", sc.communication_score],
    ["Problem solving", sc.problem_solving_score],
    ["Cultural fit", sc.cultural_fit_score],
    ["Authenticity", sc.authenticity_score],
  ] as const;
  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        AI scorecard
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {dims.map(([label, v]) => (
          <div key={label} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-foreground">{v ?? "—"}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs col-span-2 sm:col-span-3">
          <span className="font-medium text-foreground">Overall</span>
          <span className="font-semibold text-accent-foreground">{sc.overall_score ?? "—"}</span>
        </div>
      </div>
      {sc.recommendation && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium">Recommendation:</span> {sc.recommendation}
        </p>
      )}
      {row.recordingExpired ? (
        <p className="mt-2 text-xs text-warning">
          Recording/transcript no longer available (past your plan's retention window).
        </p>
      ) : null}
    </div>
  );
}

function Overrides({
  candidateId,
  timeline,
  onChanged,
}: {
  candidateId: string;
  timeline: LedgerView[];
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const supabase = browserClient();
  const [target, setTarget] = useState("");
  const [score, setScore] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!target) {
      showErrorToast("Pick the stage you want to override.");
      return;
    }
    if (!reason.trim()) {
      showErrorToast("Add a reason — it is written to the audit log.");
      return;
    }
    setBusy(true);
    try {
      const targetRow = timeline.find((r) => r.id === target);
      const { error: insErr } = await supabase.from("decision_ledger").insert({
        account_id: user.id,
        candidate_id: candidateId,
        stage: targetRow?.stage ?? "override",
        score: Math.max(0, Math.min(100, score)),
        rationale: `MANUAL OVERRIDE: ${reason}`,
        source: "manual",
        override_of: target || undefined,
      });
      if (insErr) throw insErr;
      await supabase.from("audit_log").insert({
        account_id: user.id,
        actor_type: "account_holder",
        actor_id: user.id,
        action: "decision_ledger.override",
        resource_type: "decision_ledger",
        resource_id: target || undefined,
        details: { new_score: score, reason },
      });
      setReason("");
      onChanged();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Manual override"
        subtitle="Override a cutoff decision. Writes to decision_ledger + audit_log; the real pipeline re-runs via the round engine server-side."
      />
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
          aria-label="Stage to override"
        >
          <option value="">Stage to override…</option>
          {timeline.map((r) => (
            <option key={r.id} value={r.id}>
              {stageLabel(r.stage)} · {r.score ?? "—"} · {formatDateTime(r.decided_at)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            aria-label="New score"
          />
        </div>
        <div className="sm:col-span-2">
          <Textarea
            rows={1}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for the override (goes to audit log)"
          />
        </div>
        <div className="sm:col-start-4">
          <Button type="submit" size="sm" variant="secondary" loading={busy} className="w-full">
            <Redo2 className="h-3.5 w-3.5" aria-hidden /> Override
          </Button>
        </div>
      </form>
    </Card>
  );
}

function DeliveryState({ state }: { state: string }) {
  if (state === "held_for_window") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone="warning">Held — will retry</Badge>
        <span className="text-xs text-muted-foreground">quiet hours</span>
      </span>
    );
  }
  if (state === "held_for_cap") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone="warning">Held — will retry</Badge>
        <span className="text-xs text-muted-foreground">daily cap reached</span>
      </span>
    );
  }
  return (
    <Badge tone={state === "delivered" || state === "sent" ? "success" : "neutral"}>
      {state}
    </Badge>
  );
}

function OutreachTable({ rows }: { rows: OutreachLogRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No outreach dispatched yet"
        hint="Emails, WhatsApp messages and fallbacks routed to this candidate appear here with their delivery state."
        className="py-4"
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-3 font-medium">When</th>
            <th className="py-2 pr-3 font-medium">Stage</th>
            <th className="py-2 pr-3 font-medium">Channel</th>
            <th className="py-2 pr-3 font-medium">Delivery</th>
            <th className="py-2 font-medium">Fallback</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(r.sent_at)}</td>
              <td className="py-2 pr-3 text-foreground">{r.stage}</td>
              <td className="py-2 pr-3 text-muted-foreground">{r.channel}</td>
              <td className="py-2 pr-3">
                <DeliveryState state={r.delivery_state} />
              </td>
              <td className="py-2 text-muted-foreground">{r.fallback_used ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}