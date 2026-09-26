"use client";

import type { RoundType } from "@scalepods/core";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { ResumeUploader } from "@/components/campaigns/ResumeUploader";
import { RoundStepper } from "@/components/campaigns/RoundStepper";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { showErrorToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccount } from "@/features/account/hooks";
import { useSession } from "@/features/auth/hooks";
import { callWorkflow } from "@/lib/webhooks";
import { useCampaignDetail, useToggleCampaignStatus } from "@/features/campaigns/hooks";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { account } = useAccount();
  const { data: session } = useSession();

  const { data, isPending, isError } = useCampaignDetail(id);
  const campaign = data?.campaign;
  const rounds = data?.rounds ?? [];
  const candidates = data?.candidates ?? [];
  const roundStatuses = data?.roundStatuses ?? {};

  const toggleStatus = useToggleCampaignStatus(
    id,
    campaign?.status ?? "on",
    account?.id,
    session?.access_token,
  );

  const roundTypes: Record<number, RoundType> = useMemo(() => {
    const map: Record<number, RoundType> = {};
    for (const r of rounds) map[r.round_number] = r.round_type;
    return map;
  }, [rounds]);

  const roundInterviewers: Record<number, string> = useMemo(() => {
    const map: Record<number, string> = {};
    for (const r of rounds) {
      if (r.interviewer_email) map[r.round_number] = r.interviewer_email;
    }
    return map;
  }, [rounds]);

  const [bulkCutoff, setBulkCutoff] = useState<number>(60);
  const [isBulkSending, setIsBulkSending] = useState(false);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <Card className="py-10 text-center">
        <p className="text-sm text-muted-foreground">Campaign not found.</p>
        <Link
          href="/dashboard"
          className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
        >
          Back to dashboard
        </Link>
      </Card>
    );
  }

  const handleToggle = async () => {
    try {
      await toggleStatus.mutateAsync();
    } catch (err) {
      showErrorToast(err);
    }
  };

  const handleBulkAdvance = async () => {
    if (!account?.id || !session?.access_token || !campaign) return;

    // Find candidates who scored at least the cutoff in resume screening
    const eligibleCandidates = candidates.filter(
      (c) =>
        (c.latest_score ?? 0) >= bulkCutoff &&
        (!c.decision || c.decision === "pending") &&
        (c.current_stage === "resume screening" || c.current_stage === "resume"),
    );

    if (eligibleCandidates.length === 0) {
      showErrorToast("No candidates meet this criteria to advance.");
      return;
    }

    setIsBulkSending(true);
    try {
      let successCount = 0;
      for (const c of eligibleCandidates) {
        await callWorkflow(
          "round-advance",
          {
            account_id: account.id,
            campaign_id: campaign.id,
            candidate_id: c.candidate_id,
            round_number: 1, // Advance to round 1
          },
          session.access_token,
        );
        successCount++;
      }
      showErrorToast(`Successfully dispatched invites for ${successCount} candidates.`);
      queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", id] });
    } catch (err) {
      showErrorToast(err);
    } finally {
      setIsBulkSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All campaigns
      </Link>

      <PageHeader
        title={campaign.name}
        subtitle={
          campaign.jd_text?.slice(0, 120) +
            (campaign.jd_text && campaign.jd_text.length > 120 ? "…" : "") || "No JD"
        }
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {campaign.status === "on" ? "Active" : "Paused"}
            </span>
            <Switch
              checked={campaign.status === "on"}
              onCheckedChange={handleToggle}
              disabled={toggleStatus.isPending}
              aria-label="Campaign status"
            />
          </div>
        }
      />

      <SectionCard title="Round pipeline" subtitle="Same cutoff-check engine for every round type">
        <RoundStepper
          numberOfRounds={campaign.number_of_rounds}
          types={roundTypes}
          statuses={roundStatuses}
          interviewers={roundInterviewers}
        />
      </SectionCard>

      <SectionCard
        title="Upload resumes"
        subtitle="Each file goes through intake, text extraction, and LLM scoring against this JD (workflow 1)."
      >
        <ResumeUploader
          campaign={campaign}
          accountId={account?.id}
          accessToken={session?.access_token}
          onComplete={() =>
            queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", id] })
          }
        />
      </SectionCard>

      <SectionCard
        title="Bulk Candidate Outreach"
        subtitle="Set a score threshold to manually advance and email qualifying candidates."
      >
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1.5 w-1/3">
            <label className="text-sm font-medium">Score Threshold (0-100)</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={bulkCutoff}
              onChange={(e) => setBulkCutoff(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end h-[60px]">
            <Button onClick={handleBulkAdvance} disabled={isBulkSending}>
              {isBulkSending ? "Sending..." : "Send Interview Invites"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Candidates" subtitle={`${candidates.length} in this campaign`}>
        {candidates.length === 0 ? (
          <EmptyState
            title="No candidates yet"
            hint="Upload resumes — each file kicks off screening and the candidate will appear here with a score."
            className="py-6"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Latest score</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => (
                <TableRow
                  key={c.candidate_id}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open candidate ${c.name ?? c.email}`}
                  onClick={() => router.push(`/candidates/${c.candidate_id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/candidates/${c.candidate_id}`);
                    }
                  }}
                  className="cursor-pointer group"
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{c.name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.current_stage ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.latest_score ?? "—"}
                  </TableCell>
                  <TableCell>
                    <DecisionBadge decision={c.decision} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/candidates/${c.candidate_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      Open →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <span className="text-xs text-muted-foreground">Pending</span>;
  const className =
    decision === "pass" || decision === "hired"
      ? "bg-success/15 text-success"
      : decision === "reject" || decision === "failed"
        ? "bg-destructive/15 text-destructive"
        : decision === "no_show"
          ? "bg-warning/15 text-warning"
          : "bg-muted text-muted-foreground";
  return <Badge className={cn("capitalize", className)}>{decision}</Badge>;
}
