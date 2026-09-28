"use client";

import {
  DEFAULT_DIALNEXA_CONFIG,
  DIALNEXA_VOICES,
  type DialnexaVoiceConfig,
  type Json,
  type RoundType,
} from "@scalepods/core";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, Mic, PhoneCall, Settings2, Sparkles, Volume2 } from "lucide-react";
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
import { useCampaignDetail, useToggleCampaignStatus } from "@/features/campaigns/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { callWorkflow } from "@/lib/webhooks";

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

  const savedVoiceConfig = campaign?.voice_call_config as unknown as DialnexaVoiceConfig | null;
  const effectiveVoiceConfig: DialnexaVoiceConfig = useMemo(() => {
    return savedVoiceConfig ?? DEFAULT_DIALNEXA_CONFIG;
  }, [savedVoiceConfig]);

  const [isEditingVoiceConfig, setIsEditingVoiceConfig] = useState(false);
  const [voiceConfigDraft, setVoiceConfigDraft] =
    useState<DialnexaVoiceConfig>(effectiveVoiceConfig);
  const [isSavingVoiceConfig, setIsSavingVoiceConfig] = useState(false);

  useEffect(() => {
    if (!isEditingVoiceConfig) {
      setVoiceConfigDraft(effectiveVoiceConfig);
    }
  }, [effectiveVoiceConfig, isEditingVoiceConfig]);

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
      }
      showErrorToast(`Successfully dispatched invites for ${successCount} candidates.`);
      queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", id] });
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
        title="DialNexa AI Voice Screening Call"
        subtitle="Configure the conversational AI voice agent dispatched by n8n for candidate phone screening"
        action={
          !isEditingVoiceConfig ? (
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
              Configure Voice Agent
            </Button>
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
          <DialnexaConfigEditor
            value={voiceConfigDraft}
            onChange={setVoiceConfigDraft}
            jobTitle={campaign.name}
          />
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
                      {savedVoiceConfig ? "Custom Agent Configured" : "Default Agent Active"}
                    </span>
                    <Badge
                      variant="secondary"
                      className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Dispatched by n8n
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
                  className="gap-1.5 py-1 px-2.5 text-xs font-medium text-muted-foreground"
                >
                  <Clock className="h-3 w-3" />
                  <span>
                    {Math.round((effectiveVoiceConfig.max_duration_seconds || 300) / 60)} min limit
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
