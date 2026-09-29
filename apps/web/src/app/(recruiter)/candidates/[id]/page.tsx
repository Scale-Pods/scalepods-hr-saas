"use client";

import { formatDateTime } from "@scalepods/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Headphones,
  Loader2,
  MessageSquare,
  MessageSquareText,
  PhoneCall,
  Redo2,
  Sparkles,
  User,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { showErrorToast } from "@/components/shared/TierLimitToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/features/account/hooks";
import type { LedgerView } from "@/features/candidates/api";
import { useCandidateProfile } from "@/features/candidates/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function roundNumberFromStage(stage: string): number | null {
  const m = /^round_(\d+)$/.exec(stage);
  if (m) return Number(m[1]);
  if (stage === "round_undefined" || stage.includes("round") || stage.includes("interview"))
    return 1;
  return null;
}

const STAGE_LABELS: Record<string, string> = {
  resume: "Resume screening",
  "resume screening": "Resume screening",
  voice_screen: "Voice screening",
  round_undefined: "Round 1 interview",
};

function stageLabel(stage: string): string {
  if (stage === "round_undefined") return "Round 1 interview";
  const n = roundNumberFromStage(stage);
  if (n) return `Round ${n} score`;
  if (stage.toLowerCase().includes("resume")) return "Resume screening";
  if (stage.toLowerCase().includes("voice")) return "Voice screening";
  return STAGE_LABELS[stage] ?? stage;
}

export default function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { account } = useAccount();
  const tier = account?.tier ?? "free";

  const { data, isPending, isError } = useCandidateProfile(id, tier);
  const candidate = data?.candidate;
  const campaignName = data?.campaignName;
  const resumeUrl = data?.resumeUrl;
  const timeline = data?.timeline ?? [];
  const outreach = data?.outreach ?? [];
  const interviewRecordings = data?.interviewRecordings ?? [];
  const interviewTranscripts = data?.interviewTranscripts ?? [];
  const voiceScreenTranscripts = data?.voiceScreenTranscripts ?? [];

  const [dialnexaCalls, setDialnexaCalls] = useState<
    Array<{
      id: string;
      duration: number;
      status: string;
      called_time: string | null;
      end_reason: string | null;
      sentiment: string | null;
      call_successful: string | null;
      recording_url: string | null;
      transcript?: string | null;
      turns?: Array<{ speaker: "agent" | "candidate"; text: string; start: number; end: number }>;
    }>
  >([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  useEffect(() => {
    if (!candidate?.phone) return;
    setLoadingCalls(true);
    fetch(`/api/voice-screen/call-status?phone=${encodeURIComponent(candidate.phone)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.calls) setDialnexaCalls(json.calls);
      })
      .catch((err) => console.warn("Failed to load call status:", err))
      .finally(() => setLoadingCalls(false));
  }, [candidate?.phone]);

  const [overrideTarget, setOverrideTarget] = useState("");
  const [overrideScore, setOverrideScore] = useState(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);

  const handleOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !overrideTarget) {
      showErrorToast("Pick the stage you want to override.");
      return;
    }
    if (!overrideReason.trim()) {
      showErrorToast("Add a reason — it is written to the audit log.");
      return;
    }
    setOverrideBusy(true);
    try {
      if (!account?.id) throw new Error("Account not loaded");
      const supabase = supabaseBrowser();
      const targetRow = timeline.find((r) => r.id === overrideTarget);
      const { error: insErr } = await supabase.from("decision_ledger").insert({
        account_id: account.id,
        candidate_id: id,
        stage: targetRow?.stage ?? "override",
        score: Math.max(0, Math.min(100, overrideScore)),
        rationale: `MANUAL OVERRIDE: ${overrideReason}`,
      });
      if (insErr) throw insErr;
      await supabase.from("audit_log").insert({
        account_id: account.id,
        actor_type: "account_holder",
        actor_id: account.id,
        action: "decision_ledger.override",
        resource_type: "decision_ledger",
        resource_id: overrideTarget || undefined,
        details: { new_score: overrideScore, reason: overrideReason },
      });
      queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
      setOverrideReason("");
    } catch (err) {
      showErrorToast(err);
    } finally {
      setOverrideBusy(false);
    }
  };

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (isError || !candidate) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm text-muted-foreground">Candidate not found.</p>
        <Link
          href="/dashboard"
          className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
        >
          Back to dashboard
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
      </Link>

      <PageHeader
        title={candidate.name || "Unnamed"}
        subtitle={
          <>
            {candidate.email}
            {campaignName ? <> · {campaignName}</> : null}
            {" · added "}
            {formatDateTime(candidate.created_at)}
          </>
        }
      />

      {resumeUrl && (
        <SectionCard title="Resume">
          <a
            href={resumeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-accent-foreground"
          >
            <FileText className="h-4 w-4" aria-hidden /> Open resume{" "}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          <p className="mt-1 text-xs text-muted-foreground">Short-lived signed URL (1 hour)</p>
        </SectionCard>
      )}

      <SectionCard
        title="Candidate timeline"
        subtitle="Every scoring decision, oldest first. Overrides link back to the row they replace."
      >
        <Timeline rows={timeline} />
      </SectionCard>

      <InterviewMediaAndTranscriptSection
        recordings={interviewRecordings}
        transcripts={interviewTranscripts}
      />

      <VoiceScreenCallSection
        calls={dialnexaCalls}
        loadingCalls={loadingCalls}
        transcripts={voiceScreenTranscripts}
        phone={candidate.phone}
      />

      <SectionCard title="Manual override">
        <form onSubmit={handleOverride} className="grid gap-3 sm:grid-cols-4">
          <select
            value={overrideTarget}
            onChange={(e) => setOverrideTarget(e.target.value)}
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
          <Input
            type="number"
            min={0}
            max={100}
            value={overrideScore}
            onChange={(e) => setOverrideScore(Number(e.target.value))}
            aria-label="New score"
          />
          <div className="sm:col-span-2">
            <Textarea
              rows={1}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Reason for the override (goes to audit log)"
            />
          </div>
          <div className="sm:col-start-4">
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={overrideBusy}
              className="w-full"
            >
              <Redo2 className="h-3.5 w-3.5" aria-hidden /> Override
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Outreach history"
        subtitle="Every dispatch attempt (stage / channel / delivery state)"
      >
        <OutreachTable rows={outreach} />
      </SectionCard>
    </div>
  );
}

function Timeline({ rows }: { rows: LedgerView[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (rowId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
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
            <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
            <button
              type="button"
              onClick={() => toggle(row.id)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-fill-tertiary"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {stageLabel(row.stage)}
                  </span>
                  {row.source === "manual" && (
                    <Badge variant="secondary" className="bg-warning/15 text-warning">
                      Manual override
                    </Badge>
                  )}
                  {row.forRound?.retake_of_round_instance_id && (
                    <Badge variant="secondary" className="bg-warning/15 text-warning">
                      Platform-fault retake
                    </Badge>
                  )}
                  {row.forRound?.status === "no_show" && (
                    <Badge variant="secondary" className="bg-warning/15 text-warning">
                      No-show
                    </Badge>
                  )}
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
              <div className="mt-1 rounded-lg bg-fill-quaternary/70 p-3 text-sm">
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
                {row.scorecard && <ScorecardSummary row={row} />}
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
    <div className="mt-3 rounded-lg bg-fill-tertiary/70 p-3">
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
      {row.recordingSignedUrl && (
        <div className="mt-3 rounded-lg border border-border/50 bg-background/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Video className="h-3.5 w-3.5 text-primary" /> Interview Recording
            </span>
            <a
              href={row.recordingSignedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Open video <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <video
            src={row.recordingSignedUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full max-h-72 rounded-md bg-black"
          >
            <track kind="captions" />
          </video>
        </div>
      )}
      {row.recordingExpired ? (
        <p className="mt-2 text-xs text-warning">
          Recording/transcript no longer available (past your plan&apos;s retention window).
        </p>
      ) : null}
    </div>
  );
}

function DeliveryState({ state }: { state: string }) {
  if (state === "held_for_window" || state === "held_for_cap") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge variant="secondary" className="bg-warning/15 text-warning">
          Held — will retry
        </Badge>
        <span className="text-xs text-muted-foreground">
          {state === "held_for_window" ? "quiet hours" : "daily cap"}
        </span>
      </span>
    );
  }
  return (
    <Badge
      variant="secondary"
      className={cn(
        "capitalize",
        state === "delivered" || state === "sent"
          ? "bg-success/15 text-success"
          : state === "failed"
            ? "bg-destructive/15 text-destructive"
            : "bg-fill-tertiary text-secondary-foreground",
      )}
    >
      {state}
    </Badge>
  );
}

function OutreachTable({
  rows,
}: {
  rows: {
    id: string;
    sent_at: string;
    stage: string;
    channel: string;
    delivery_state: string;
    fallback_used: boolean;
  }[];
}) {
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Channel</TableHead>
          <TableHead>Delivery</TableHead>
          <TableHead>Fallback</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="text-muted-foreground">{formatDateTime(r.sent_at)}</TableCell>
            <TableCell className="text-foreground">{r.stage}</TableCell>
            <TableCell className="text-muted-foreground">{r.channel}</TableCell>
            <TableCell>
              <DeliveryState state={r.delivery_state} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {r.fallback_used ? "Yes" : "No"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function InterviewMediaAndTranscriptSection({
  recordings,
  transcripts,
}: {
  recordings: Array<{
    sessionId: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    recordingSignedUrl: string | null;
  }>;
  transcripts: Array<{
    id: string;
    question_text: string;
    question_type?: string;
    interviewer_text?: string | null;
    answer_text: string;
    answered_at: string;
    ai_note?: Record<string, unknown> | null;
  }>;
}) {
  const [activeTab, setActiveTab] = useState<"recording" | "transcript">(
    recordings.some((r) => r.recordingSignedUrl) ? "recording" : "transcript",
  );

  const hasRecordings = recordings.some((r) => !!r.recordingSignedUrl);
  const hasTranscripts = transcripts.length > 0;

  if (!hasRecordings && !hasTranscripts && recordings.length === 0) {
    return (
      <SectionCard
        title="AI Interview Session & Recording"
        subtitle="Video recording and speech-to-text transcript"
      >
        <EmptyState
          title="No interview recording or transcript yet"
          hint="Once the candidate connects to the AI interview room and completes questions, the video recording and dialogue transcript will appear here."
          className="py-4"
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="AI Interview Recording & Transcript"
      subtitle="Full video recording and turn-by-turn question/response transcript"
      action={
        <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-1">
          <Button
            size="sm"
            variant={activeTab === "recording" ? "secondary" : "ghost"}
            className="h-7 px-2.5 text-xs gap-1.5"
            onClick={() => setActiveTab("recording")}
          >
            <Video className="h-3.5 w-3.5 text-primary" />
            Recording {hasRecordings ? "Available" : ""}
          </Button>
          <Button
            size="sm"
            variant={activeTab === "transcript" ? "secondary" : "ghost"}
            className="h-7 px-2.5 text-xs gap-1.5"
            onClick={() => setActiveTab("transcript")}
          >
            <MessageSquareText className="h-3.5 w-3.5 text-emerald-500" />
            Transcript ({transcripts.length})
          </Button>
        </div>
      }
    >
      {activeTab === "recording" ? (
        <div className="space-y-4">
          {hasRecordings ? (
            recordings
              .filter((r) => !!r.recordingSignedUrl)
              .map((rec) => (
                <div
                  key={rec.sessionId}
                  className="rounded-xl border border-border/70 bg-card p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Video className="h-4 w-4 text-primary" />
                        AI Interview Video Recording
                      </span>
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {rec.status}
                      </Badge>
                      {rec.completedAt && (
                        <span className="text-xs text-muted-foreground">
                          · {formatDateTime(rec.completedAt)}
                        </span>
                      )}
                    </div>
                    {rec.recordingSignedUrl && (
                      <a
                        href={rec.recordingSignedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Open video in tab <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <video
                    src={rec.recordingSignedUrl || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full max-h-80 rounded-lg bg-black shadow-inner border border-border/40"
                  >
                    <track kind="captions" />
                  </video>
                </div>
              ))
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-6 text-center">
              <Video className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-medium text-foreground">Interview Video Not Available</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                {recordings.length > 0
                  ? `Interview session is currently ${recordings[0].status}. If the candidate has just submitted, the video is being uploaded to secure storage.`
                  : "No recording was uploaded for this candidate's session."}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {transcripts.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No interview transcript recorded yet for this candidate.
            </div>
          ) : (
            <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
              {transcripts.map((turn, idx) => (
                <div
                  key={turn.id || idx}
                  className="rounded-xl border border-border/60 bg-card p-3.5 space-y-2.5 transition-colors hover:border-border"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-primary flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Question {idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      {turn.question_type && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {turn.question_type}
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateTime(turn.answered_at)}
                      </span>
                    </div>
                  </div>

                  {/* Interviewer Question */}
                  <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-foreground leading-relaxed border border-border/30">
                    <p className="font-medium text-muted-foreground text-[11px] mb-1">
                      AI Interviewer:
                    </p>
                    <p>{turn.question_text || turn.interviewer_text}</p>
                  </div>

                  {/* Candidate Answer */}
                  <div className="rounded-lg bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 p-2.5 text-xs text-foreground leading-relaxed">
                    <p className="font-medium text-emerald-600 dark:text-emerald-400 text-[11px] mb-1 flex items-center gap-1">
                      <User className="h-3 w-3" /> Candidate Response:
                    </p>
                    <p className="italic">
                      {turn.answer_text
                        ? `"${turn.answer_text}"`
                        : "(No spoken answer recorded / candidate timed out)"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function VoiceScreenCallSection({
  calls,
  loadingCalls,
  transcripts,
  phone,
}: {
  calls: Array<{
    id: string;
    duration: number;
    status: string;
    called_time: string | null;
    end_reason: string | null;
    sentiment: string | null;
    call_successful: string | null;
    recording_url: string | null;
    transcript?: string | null;
    turns?: Array<{ speaker: "agent" | "candidate"; text: string; start: number; end: number }>;
  }>;
  loadingCalls: boolean;
  transcripts: Array<{
    id: string;
    score: number | null;
    rationale: string | null;
    transcript: string;
    decided_at: string;
  }>;
  phone?: string | null;
}) {
  const hasCalls = calls.length > 0;
  const hasTranscripts = transcripts.length > 0;

  if (!hasCalls && !hasTranscripts && !loadingCalls) {
    return null;
  }

  return (
    <SectionCard
      title="AI Voice Screening Calls & Transcripts"
      subtitle={`Automated telephone screening history and transcripts ${phone ? `for ${phone}` : ""}`}
    >
      <div className="space-y-4">
        {/* DialNexa Call Recordings & Status */}
        {loadingCalls ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading live call recordings & transcripts from DialNexa…
          </div>
        ) : hasCalls ? (
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <PhoneCall className="h-3.5 w-3.5 text-emerald-600" />
              Telephony Call Recordings ({calls.length})
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              {calls.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[11px] capitalize",
                        c.status === "completed"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-warning/15 text-warning",
                      )}
                    >
                      {c.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums font-mono">
                      {Math.floor(c.duration / 60)}m {c.duration % 60}s
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>{c.called_time ? formatDateTime(c.called_time) : "Recent"}</span>
                    {c.sentiment && (
                      <Badge variant="outline" className="text-[10px]">
                        Sentiment: {c.sentiment}
                      </Badge>
                    )}
                  </div>

                  {c.recording_url ? (
                    <div className="space-y-1.5 pt-1 border-t border-border/50">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-foreground flex items-center gap-1">
                          <Headphones className="h-3 w-3 text-cyan-500" /> Audio Recording
                        </span>
                        <a
                          href={c.recording_url}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="text-primary hover:underline flex items-center gap-1 text-[11px]"
                        >
                          Download MP3 <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <audio
                        controls
                        src={c.recording_url}
                        className="w-full h-8 rounded-md bg-muted/40"
                      >
                        <track kind="captions" />
                      </audio>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/80 italic pt-1">
                      {c.duration > 0
                        ? "Audio recording archived or processing"
                        : "Call was not connected (user busy / missed)"}
                    </p>
                  )}

                  {/* Turn-by-Turn Dialogue Transcript */}
                  {c.turns && c.turns.length > 0 ? (
                    <div className="space-y-1.5 pt-2 border-t border-border/50">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <MessageSquareText className="h-3 w-3 text-primary" /> Dialogue Transcript (
                        {c.turns.length} turns)
                      </span>
                      <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-2.5">
                        {c.turns.map((turn) => (
                          <div
                            key={`candidate-turn-${turn.speaker}-${turn.start}-${turn.end}`}
                            className={cn(
                              "flex flex-col text-xs space-y-0.5",
                              turn.speaker === "candidate" ? "items-end" : "items-start",
                            )}
                          >
                            <span className="text-[10px] text-muted-foreground px-1 font-medium">
                              {turn.speaker === "candidate" ? "Candidate" : "AI Recruiter"} ·{" "}
                              {turn.start.toFixed(1)}s
                            </span>
                            <div
                              className={cn(
                                "rounded-xl px-3 py-1.5 max-w-[85%] text-xs leading-relaxed shadow-2xs",
                                turn.speaker === "candidate"
                                  ? "bg-primary text-primary-foreground rounded-br-xs"
                                  : "bg-card border border-border/80 text-foreground rounded-bl-xs",
                              )}
                            >
                              {turn.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : c.transcript ? (
                    <div className="space-y-1.5 pt-2 border-t border-border/50">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <FileText className="h-3 w-3 text-primary" /> Transcript
                      </span>
                      <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {c.transcript}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Voice Screening Transcript */}
        {hasTranscripts && (
          <div className="space-y-3 pt-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              Voice Screening Dialogue Transcripts
            </span>
            <div className="space-y-3">
              {transcripts.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl border border-border/70 bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        AI Phone Screen Assessment
                      </span>
                      {t.score != null && (
                        <Badge className="bg-primary/15 text-primary font-bold">
                          Score: {t.score}/100
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(t.decided_at)}
                    </span>
                  </div>

                  {t.rationale && (
                    <div className="rounded-lg bg-muted/30 border border-border/40 p-2.5 text-xs text-foreground">
                      <span className="font-semibold text-muted-foreground block mb-0.5">
                        Evaluation Rationale:
                      </span>
                      {t.rationale}
                    </div>
                  )}

                  {t.transcript && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Full Call Transcript
                      </span>
                      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {t.transcript}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
