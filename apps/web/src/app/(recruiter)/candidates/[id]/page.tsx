"use client";

import { formatDateTime } from "@scalepods/core";
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, FileText, Redo2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
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

export default function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { account } = useAccount();
  const tier = account?.tier ?? "free";

  const { data, isPending, isError } = useCandidateProfile(id, tier);
  const candidate = data?.candidate;
  const campaignName = data?.campaignName;
  const resumeUrl = data?.resumeUrl;
  const timeline = data?.timeline ?? [];
  const outreach = data?.outreach ?? [];

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
        source: "manual",
        override_of: overrideTarget || undefined,
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
            <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-primary" />
            <button
              type="button"
              onClick={() => toggle(row.id)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {stageLabel(row.stage)}
                  </span>
                  {row.source === "manual" && (
                    <Badge variant="secondary" className="bg-warning/10 text-warning">
                      Manual override
                    </Badge>
                  )}
                  {row.forRound?.retake_of_round_instance_id && (
                    <Badge variant="secondary" className="bg-warning/10 text-warning">
                      Platform-fault retake
                    </Badge>
                  )}
                  {row.forRound?.status === "no_show" && (
                    <Badge variant="secondary" className="bg-warning/10 text-warning">
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
        <Badge variant="secondary" className="bg-warning/10 text-warning">
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
          ? "bg-success/10 text-success"
          : state === "failed"
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground",
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
