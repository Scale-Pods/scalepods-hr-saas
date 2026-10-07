"use client";

import {
  DEFAULT_DIALNEXA_CONFIG,
  DIALNEXA_VOICES,
  type DialnexaVoiceConfig,
  type Json,
  type RoundType,
} from "@scalepods/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Flame,
  Loader2,
  Mic,
  PhoneCall,
  PhoneOff,
  Settings2,
  Sliders,
  Sparkles,
  Trash2,
  Volume2,
  XCircle,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DialnexaConfigEditor } from "@/components/campaigns/DialnexaConfigEditor";
import { ResumeUploader } from "@/components/campaigns/ResumeUploader";
import { RoundStepper } from "@/components/campaigns/RoundStepper";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { deleteCampaign, reviewCandidateRound, type ViewCandidate } from "@/features/campaigns/api";
import {
  campaignsKey,
  useCampaignDetail,
  useToggleCampaignStatus,
} from "@/features/campaigns/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { callWorkflow } from "@/lib/webhooks";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { account, accountLoading } = useAccount();
  const { data: session } = useSession();

  const { data, isPending, isError } = useCampaignDetail(id);
  const campaign = data?.campaign;
  const rounds = data?.rounds ?? [];
  const candidates = data?.candidates ?? [];
  const roundStatuses = data?.roundStatuses ?? {};

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const [postRoundCutoff, setPostRoundCutoff] = useState<number>(70);
  const [isApplyingCutoff, setIsApplyingCutoff] = useState(false);
  const [reviewingCandidateId, setReviewingCandidateId] = useState<string | null>(null);

  const awaitingReviewCandidates = useMemo(() => {
    return candidates.filter(
      (c) =>
        c.decision === "awaiting_review" ||
        (Boolean(c.round_instance_id) &&
          (c.decision === "completed" || c.decision === "in_progress")),
    );
  }, [candidates]);

  const handleReviewCandidate = async (
    cand: ViewCandidate,
    decision: "passed" | "failed",
    cutoff: number = postRoundCutoff,
  ) => {
    if (!cand.round_instance_id || !id) return;
    setReviewingCandidateId(cand.candidate_id);
    try {
      await reviewCandidateRound({
        roundInstanceId: cand.round_instance_id,
        reviewerCutoff: cutoff,
        decision,
        campaignId: id,
        candidateId: cand.candidate_id,
        roundNumber: cand.round_number || 1,
        numberOfRounds: campaign?.number_of_rounds || 1,
        score: cand.latest_score,
        accountId: account?.id,
        accessToken: session?.access_token,
      });
      showToast(
        `${cand.name || "Candidate"} marked as ${decision === "passed" ? "Passed" : "Rejected"}.`,
        { kind: "success" },
      );
      await queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", id] });
    } catch (err) {
      showErrorToast(err);
    } finally {
      setReviewingCandidateId(null);
    }
  };

  const handleApplyPostRoundCutoff = async () => {
    if (awaitingReviewCandidates.length === 0 || !id) return;
    setIsApplyingCutoff(true);
    let passedCount = 0;
    let failedCount = 0;
    try {
      for (const cand of awaitingReviewCandidates) {
        if (!cand.round_instance_id) continue;
        const decision = (cand.latest_score ?? 0) >= postRoundCutoff ? "passed" : "failed";
        await reviewCandidateRound({
          roundInstanceId: cand.round_instance_id,
          reviewerCutoff: postRoundCutoff,
          decision,
          campaignId: id,
          candidateId: cand.candidate_id,
          roundNumber: cand.round_number || 1,
          numberOfRounds: campaign?.number_of_rounds || 1,
          score: cand.latest_score,
          accountId: account?.id,
          accessToken: session?.access_token,
        });
        if (decision === "passed") passedCount++;
        else failedCount++;
      }
      showToast(
        `Applied threshold (${postRoundCutoff}): ${passedCount} passed, ${failedCount} rejected.`,
        { kind: "success" },
      );
      await queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", id] });
    } catch (err) {
      showErrorToast(err);
    } finally {
      setIsApplyingCutoff(false);
    }
  };

  const savedVoiceConfig = campaign?.voice_call_config as unknown as DialnexaVoiceConfig | null;
  const hasVoiceConfig = useMemo(() => {
    if (!savedVoiceConfig) return false;
    if (typeof savedVoiceConfig === "object") {
      return Object.keys(savedVoiceConfig).length > 0;
    }
    return false;
  }, [savedVoiceConfig]);

  const effectiveVoiceConfig: DialnexaVoiceConfig = useMemo(() => {
    if (!savedVoiceConfig) return DEFAULT_DIALNEXA_CONFIG;
    return {
      ...DEFAULT_DIALNEXA_CONFIG,
      ...savedVoiceConfig,
      agent_functions:
        savedVoiceConfig.agent_functions && savedVoiceConfig.agent_functions.length > 0
          ? savedVoiceConfig.agent_functions
          : DEFAULT_DIALNEXA_CONFIG.agent_functions,
      post_call_analysis:
        savedVoiceConfig.post_call_analysis && savedVoiceConfig.post_call_analysis.length > 0
          ? savedVoiceConfig.post_call_analysis
          : DEFAULT_DIALNEXA_CONFIG.post_call_analysis,
    };
  }, [savedVoiceConfig]);

  const [isEditingVoiceConfig, setIsEditingVoiceConfig] = useState(false);
  const [voiceConfigDraft, setVoiceConfigDraft] =
    useState<DialnexaVoiceConfig>(effectiveVoiceConfig);
  const [isSavingVoiceConfig, setIsSavingVoiceConfig] = useState(false);
  const [callingCandidateId, setCallingCandidateId] = useState<string | null>(null);
  const [isCallingAll, setIsCallingAll] = useState(false);

  useEffect(() => {
    if (!isEditingVoiceConfig) {
      setVoiceConfigDraft(effectiveVoiceConfig);
    }
  }, [effectiveVoiceConfig, isEditingVoiceConfig]);

  const handleTriggerVoiceCall = async (cand: (typeof candidates)[number]) => {
    if (!cand.phone) {
      showToast(`${cand.name || "Candidate"} does not have a phone number on file.`, {
        kind: "info",
      });
      return;
    }
    setCallingCandidateId(cand.candidate_id);
    try {
      const res = await fetch("/api/voice-screen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          account_id: account?.id,
          plan_tier: account?.tier,
          tier: account?.tier,
          is_enterprise: account?.tier === "enterprise",
          candidate_id: cand.candidate_id,
          candidate_phone: cand.phone,
          candidate_name: cand.name,
          role_title: campaign?.name,
          voice_call_config: effectiveVoiceConfig,
          round_instance_id: cand.round_instance_id || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to trigger voice call");
      }
      showToast(`AI voice screening call initiated for ${cand.name || cand.phone}!`, {
        kind: "success",
      });
    } catch (err) {
      showErrorToast(err);
    } finally {
      setCallingCandidateId(null);
    }
  };

  const handleTriggerVoiceCallAll = async () => {
    if (!hasVoiceConfig) {
      showToast("Voice screening is not enabled for this campaign.", { kind: "info" });
      return;
    }
    const candidatesWithPhone = candidates.filter((c) => !!c.phone);
    if (candidatesWithPhone.length === 0) {
      showToast("No candidates with phone numbers found in this campaign.", { kind: "info" });
      return;
    }

    setIsCallingAll(true);
    let success = 0;
    try {
      for (const cand of candidatesWithPhone) {
        try {
          const res = await fetch("/api/voice-screen", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              account_id: account?.id,
              plan_tier: account?.tier,
              tier: account?.tier,
              is_enterprise: account?.tier === "enterprise",
              candidate_id: cand.candidate_id,
              candidate_phone: cand.phone,
              candidate_name: cand.name,
              role_title: campaign?.name,
              voice_call_config: effectiveVoiceConfig,
              round_instance_id: cand.round_instance_id || undefined,
            }),
          });
          if (res.ok) success++;
        } catch (callErr) {
          console.warn(`Failed to call ${cand.candidate_id}:`, callErr);
        }
      }

      if (success > 0) {
        showToast(
          `AI voice screening call initiated for ${success} candidate${success === 1 ? "" : "s"}!`,
          { kind: "success" },
        );
      } else {
        showToast("Could not initiate calls. Please check DialNexa settings.", { kind: "info" });
      }
    } catch (err) {
      showErrorToast(err);
    } finally {
      setIsCallingAll(false);
    }
  };

  if (isPending || (accountLoading && !data)) {
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
      showToast(campaign?.status === "on" ? "Campaign deactivated" : "Campaign activated", {
        kind: "success",
      });
    } catch (err) {
      showErrorToast(err);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteCampaign(id, account?.id, session?.access_token);
      showToast("Campaign deleted successfully", { kind: "success" });
      await queryClient.invalidateQueries({ queryKey: campaignsKey });
      router.push("/campaigns");
    } catch (err) {
      showErrorToast(err);
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleBulkAdvance = async () => {
    if (!account?.id || !session?.access_token || !campaign) return;

    // Find candidates who scored at least the cutoff in resume screening
    const eligibleCandidates = candidates.filter((c) => {
      const stage = (c.current_stage || "").toLowerCase();
      const isScreeningStage =
        !c.current_stage || stage.includes("resume") || stage.includes("screen") || stage === "—";
      const isPendingDecision = !c.decision || c.decision.toLowerCase() === "pending";
      const hasQualifyingScore = (c.latest_score ?? 0) >= bulkCutoff;

      return hasQualifyingScore && isPendingDecision && isScreeningStage;
    });

    if (eligibleCandidates.length === 0) {
      showToast("No candidates meet this criteria to advance.", { kind: "info" });
      return;
    }

    setIsBulkSending(true);
    try {
      let successCount = 0;
      let voiceCount = 0;
      let lastError: unknown = null;
      for (const c of eligibleCandidates) {
        try {
          await callWorkflow("round-advance", {
            body: {
              account_id: account.id,
              campaign_id: campaign.id,
              candidate_id: c.candidate_id,
              round_number: 1, // Advance to round 1
            },
            accessToken: session.access_token,
          });
          successCount++;

          // Also trigger voice screening call if voice is configured and candidate has phone
          const isVoiceEnabled = Boolean(hasVoiceConfig);
          if (isVoiceEnabled && c.phone) {
            try {
              const vRes = await fetch("/api/voice-screen", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  account_id: account.id,
                  plan_tier: account.tier,
                  tier: account.tier,
                  is_enterprise: account.tier === "enterprise",
                  candidate_id: c.candidate_id,
                  candidate_phone: c.phone,
                  candidate_name: c.name,
                  role_title: campaign.name,
                  voice_call_config: effectiveVoiceConfig,
                  round_instance_id: c.round_instance_id || undefined,
                }),
              });
              if (vRes.ok) voiceCount++;
            } catch (vErr) {
              console.warn(`Voice call trigger failed for candidate ${c.candidate_id}:`, vErr);
            }
          }
        } catch (itemErr) {
          lastError = itemErr;
          console.error(`Failed to advance candidate ${c.candidate_id}:`, itemErr);
        }
      }

      if (successCount > 0) {
        showToast(
          `Successfully dispatched invites for ${successCount} candidate${successCount === 1 ? "" : "s"}${
            voiceCount > 0
              ? ` and placed ${voiceCount} AI voice call${voiceCount === 1 ? "" : "s"}`
              : ""
          }.`,
          { kind: "success" },
        );
        queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", id] });
      } else if (lastError) {
        showErrorToast(lastError);
      }
    } catch (err) {
      showErrorToast(err);
    } finally {
      setIsBulkSending(false);
    }
  };

  const handleSaveVoiceConfig = async () => {
    if (!id || !campaign) return;
    setIsSavingVoiceConfig(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase
        .from("campaigns")
        .update({ voice_call_config: voiceConfigDraft as unknown as Json })
        .eq("id", id);
      if (error) throw error;

      if (account?.id) {
        callWorkflow("campaigns", {
          body: {
            action: "update",
            account_id: account.id,
            campaign_id: id,
            voice_call_config: voiceConfigDraft,
          },
          accessToken: session?.access_token,
        }).catch((err) => {
          console.warn("n8n campaigns update notification skipped/failed:", err);
        });
      }

      showToast("DialNexa voice call configuration updated successfully.", { kind: "success" });
      setIsEditingVoiceConfig(false);
      await queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", id] });
    } catch (err) {
      showErrorToast(err);
    } finally {
      setIsSavingVoiceConfig(false);
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
            <span className="text-sm font-medium text-foreground">
              {campaign.status === "on" ? "Active" : "Paused"}
            </span>
            <Switch
              checked={campaign.status === "on"}
              onCheckedChange={handleToggle}
              disabled={toggleStatus.isPending}
              aria-label="Campaign status"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-semibold border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive dark:text-red-400"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Campaign
            </Button>
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
        subtitle="Each file undergoes automated intake, text extraction, and AI scoring against this job description."
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
            <label htmlFor="score-threshold" className="text-sm font-medium">
              Score Threshold (0-100)
            </label>
            <Input
              id="score-threshold"
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

      <SectionCard
        title="Post-Round Cutoff & Review"
        subtitle={
          awaitingReviewCandidates.length > 0
            ? `${awaitingReviewCandidates.length} candidate${awaitingReviewCandidates.length === 1 ? "" : "s"} completed their round and require threshold evaluation.`
            : "Thresholds are determined post-round. Candidates completing an interview or assignment will appear here for score review."
        }
        action={
          awaitingReviewCandidates.length > 0 ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 gap-1.5 px-2.5 py-1"
            >
              <Sliders className="h-3.5 w-3.5 text-amber-500" />
              {awaitingReviewCandidates.length} Awaiting Review
            </Badge>
          ) : undefined
        }
      >
        {awaitingReviewCandidates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 p-5 text-center">
            <p className="text-xs text-muted-foreground">
              No candidates currently awaiting post-round review. As candidates complete rounds, you
              will set cutoffs and evaluate pass/fail here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border/80 bg-muted/20 p-4">
              <div className="flex items-center gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="post-round-cutoff"
                    className="text-xs font-semibold text-foreground flex items-center gap-1.5"
                  >
                    <Sliders className="h-3.5 w-3.5 text-primary" />
                    Review Cutoff Threshold (0–100)
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="post-round-cutoff"
                      type="number"
                      min={0}
                      max={100}
                      value={postRoundCutoff}
                      onChange={(e) =>
                        setPostRoundCutoff(Math.max(0, Math.min(100, Number(e.target.value))))
                      }
                      className="h-9 w-24 font-mono font-semibold text-center"
                    />
                    <span className="text-xs text-muted-foreground">
                      (
                      {
                        awaitingReviewCandidates.filter(
                          (c) => (c.latest_score ?? 0) >= postRoundCutoff,
                        ).length
                      }{" "}
                      of {awaitingReviewCandidates.length} qualify)
                    </span>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                className="gap-1.5 text-xs font-semibold"
                disabled={isApplyingCutoff}
                onClick={handleApplyPostRoundCutoff}
              >
                {isApplyingCutoff ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                )}
                {isApplyingCutoff
                  ? "Applying Threshold..."
                  : `Apply Cutoff & Advance Qualifying (${postRoundCutoff}+)`}
              </Button>
            </div>

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold">Candidate</TableHead>
                    <TableHead className="text-xs font-semibold">Stage / Round</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Score</TableHead>
                    <TableHead className="text-xs font-semibold text-center">
                      Cutoff Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-right">
                      Decide & Advance
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {awaitingReviewCandidates.map((cand) => {
                    const score = cand.latest_score ?? 0;
                    const meetsCutoff = score >= postRoundCutoff;
                    const isBusy = reviewingCandidateId === cand.candidate_id;

                    return (
                      <TableRow key={cand.candidate_id} className="hover:bg-muted/20">
                        <TableCell>
                          <p className="font-medium text-xs text-foreground">
                            {cand.name || "Unnamed"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{cand.email}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {cand.current_stage || `Round ${cand.round_number || 1}`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-bold text-foreground">
                          {cand.latest_score ?? "—"}/100
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-semibold px-2 py-0.5",
                              meetsCutoff
                                ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10 dark:text-emerald-400"
                                : "border-rose-500/30 text-rose-600 bg-rose-500/10 dark:text-rose-400",
                            )}
                          >
                            {meetsCutoff ? "Meets Cutoff" : "Below Cutoff"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isBusy || isApplyingCutoff}
                              className="h-7 px-2.5 text-xs font-semibold border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
                              onClick={() => handleReviewCandidate(cand, "passed")}
                            >
                              {isBusy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                              Pass
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isBusy || isApplyingCutoff}
                              className="h-7 px-2.5 text-xs font-semibold border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                              onClick={() => handleReviewCandidate(cand, "failed")}
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </SectionCard>

      {!hasVoiceConfig ? (
        <SectionCard
          title="DialNexa AI Voice Screening Call"
          subtitle="Conversational AI voice screening was not enabled during campaign creation"
        >
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 rounded-xl border border-dashed border-border/80 bg-muted/10 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <PhoneOff className="h-6 w-6" />
            </div>
            <div className="max-w-md space-y-1">
              <h4 className="text-sm font-semibold text-foreground">Voice Agent Not Configured</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Voice agent configuration is only available while creating the campaign. This
                campaign was launched without AI phone screening enabled.
              </p>
            </div>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Configuration only available during campaign creation
            </Badge>
          </div>
        </SectionCard>
      ) : (
        <SectionCard
          title="DialNexa AI Voice Screening Call"
          subtitle="Conversational AI voice agent configured during campaign creation"
          action={
            !isEditingVoiceConfig ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs font-semibold border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
                  disabled={isCallingAll || candidates.filter((c) => !!c.phone).length === 0}
                  onClick={handleTriggerVoiceCallAll}
                >
                  {isCallingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PhoneCall className="h-3.5 w-3.5" />
                  )}
                  {isCallingAll ? "Calling Candidates..." : "Call Candidates"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs font-semibold"
                  onClick={() => {
                    setVoiceConfigDraft(effectiveVoiceConfig);
                    setIsEditingVoiceConfig(true);
                  }}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Edit Configuration
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  disabled={isSavingVoiceConfig}
                  onClick={() => {
                    setVoiceConfigDraft(effectiveVoiceConfig);
                    setIsEditingVoiceConfig(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs font-semibold"
                  disabled={isSavingVoiceConfig}
                  onClick={handleSaveVoiceConfig}
                >
                  {isSavingVoiceConfig ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            )
          }
        >
          {isEditingVoiceConfig ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-primary">
                <span className="font-medium">
                  Editing Voice Agent Configuration — all previous settings loaded below. Make
                  changes and click <strong>Save Configuration</strong> to apply updates.
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setVoiceConfigDraft(effectiveVoiceConfig);
                    setIsEditingVoiceConfig(false);
                  }}
                >
                  Cancel Edit
                </Button>
              </div>
              <DialnexaConfigEditor
                value={voiceConfigDraft}
                onChange={setVoiceConfigDraft}
                jobTitle={campaign.name}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <PhoneCall className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        Custom Agent Configured
                      </span>
                      <Badge
                        variant="secondary"
                        className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px]"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Active
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Candidates who qualify past resume review receive this automated telephone
                      screen.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1.5 py-1 px-2.5 text-xs font-medium">
                    <Volume2 className="h-3 w-3 text-cyan-500" />
                    <span>
                      Voice:{" "}
                      {DIALNEXA_VOICES.find((v) => v.id === effectiveVoiceConfig.voice)?.label ||
                        effectiveVoiceConfig.voice}
                    </span>
                  </Badge>
                  <Badge
                    variant="outline"
                    className="gap-1.5 py-1 px-2.5 text-xs font-medium text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5"
                  >
                    <Flame className="h-3 w-3 text-amber-500" />
                    <span>
                      Eagerness:{" "}
                      {Math.round((effectiveVoiceConfig.response_eagerness ?? 0.7) * 100)}%
                    </span>
                  </Badge>
                  <Badge
                    variant="outline"
                    className="gap-1.5 py-1 px-2.5 text-xs font-medium text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/5"
                  >
                    <Zap className="h-3 w-3 text-purple-500" />
                    <span>
                      {(effectiveVoiceConfig.agent_functions?.filter((f) => f.enabled) ?? [])
                        .length || 3}{" "}
                      Tools Active
                    </span>
                  </Badge>
                  <Badge
                    variant="outline"
                    className="gap-1.5 py-1 px-2.5 text-xs font-medium text-muted-foreground"
                  >
                    <Clock className="h-3 w-3" />
                    <span>
                      {Math.round((effectiveVoiceConfig.max_duration_seconds || 300) / 60)} min
                      limit
                    </span>
                  </Badge>
                </div>
              </div>

              {effectiveVoiceConfig.first_message && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5 text-emerald-500" />
                    Opening Greeting
                  </span>
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs italic text-foreground">
                    &ldquo;{effectiveVoiceConfig.first_message}&rdquo;
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Prompt & Telephony Instructions
                </span>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {effectiveVoiceConfig.prompt}
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      )}

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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => (
                <TableRow
                  key={c.candidate_id}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open candidate ${c.name ?? c.email}`}
                  onClick={() => router.push(`/candidates/${c.candidate_id}?campaignId=${id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/candidates/${c.candidate_id}?campaignId=${id}`);
                    }
                  }}
                  className="cursor-pointer group"
                >
                  <TableCell>
                    <p className="font-medium text-foreground">{c.name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                    {c.phone && <p className="text-[11px] text-muted-foreground/80">{c.phone}</p>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.current_stage ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.latest_score ?? "—"}
                  </TableCell>
                  <TableCell>
                    <DecisionBadge decision={c.decision} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {c.decision === "awaiting_review" && c.round_instance_id && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                            disabled={reviewingCandidateId === c.candidate_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReviewCandidate(c, "passed");
                            }}
                          >
                            Pass
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                            disabled={reviewingCandidateId === c.candidate_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReviewCandidate(c, "failed");
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                      {hasVoiceConfig && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
                          title={
                            c.phone
                              ? `Call ${c.name || "candidate"} via DialNexa`
                              : "No phone number available"
                          }
                          disabled={!c.phone || callingCandidateId === c.candidate_id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTriggerVoiceCall(c);
                          }}
                        >
                          {callingCandidateId === c.candidate_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <PhoneCall className="h-3 w-3" />
                          )}
                          <span>
                            {callingCandidateId === c.candidate_id ? "Calling..." : "Call"}
                          </span>
                        </Button>
                      )}
                      <Link
                        href={`/candidates/${c.candidate_id}?campaignId=${id}`}
                        className="text-xs font-semibold text-primary opacity-80 hover:opacity-100"
                      >
                        Open →
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{campaign.name}&rdquo;? This action cannot be
              undone. All candidate applications, scores, and round configurations for this campaign
              will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDeleteCampaign}
            >
              {isDeleting ? "Deleting..." : "Delete Campaign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <span className="text-xs text-muted-foreground">Pending</span>;
  if (decision === "awaiting_review") {
    return (
      <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
        Awaiting Review
      </Badge>
    );
  }
  const className =
    decision === "pass" || decision === "passed" || decision === "hired"
      ? "bg-success/15 text-success"
      : decision === "reject" || decision === "failed"
        ? "bg-destructive/15 text-destructive"
        : decision === "no_show"
          ? "bg-warning/15 text-warning"
          : "bg-muted text-muted-foreground";
  return <Badge className={cn("capitalize", className)}>{decision}</Badge>;
}
