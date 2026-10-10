"use client";

import {
  type AssignmentsRow,
  formatDateTime,
  type InterviewerFeedbackRow,
  type OffersRow,
} from "@scalepods/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Bot,
  Briefcase,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  ExternalLink,
  FileCheck,
  FileSignature,
  FileText,
  Headphones,
  Layers,
  Loader2,
  Mail,
  MessageSquare,
  MessageSquareText,
  Pause,
  Phone,
  PhoneCall,
  Play,
  Redo2,
  RotateCw,
  Send,
  Sparkles,
  User,
  UserCheck,
  Video,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PrepareOfferModal } from "@/components/campaigns/PrepareOfferModal";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { ViewCandidate } from "@/features/campaigns/api";
import {
  decideApplication,
  type LedgerView,
  type ScorecardRow,
  updateApplicationContact,
} from "@/features/candidates/api";
import { useCandidateProfile } from "@/features/candidates/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function statusBadge(status?: string | null) {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          Active
        </Badge>
      );
    case "on_hold":
      return (
        <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
          On Hold
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="bg-destructive/15 text-destructive border border-destructive/30">
          Rejected
        </Badge>
      );
    case "offer_ready":
      return (
        <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
          Offer Ready
        </Badge>
      );
    case "offer_sent":
      return (
        <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
          Offer Sent
        </Badge>
      );
    default:
      return <Badge variant="outline">{status || "Unknown"}</Badge>;
  }
}

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

function offerField(offer: OffersRow, key: string): string | null {
  const fields = offer.field_values;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  const value = fields[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

export default function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCampaignId = searchParams.get("campaignId");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(urlCampaignId);

  useEffect(() => {
    if (urlCampaignId) {
      setSelectedCampaignId(urlCampaignId);
    }
  }, [urlCampaignId]);

  const queryClient = useQueryClient();
  const { account, accountLoading } = useAccount();
  const tier = account?.tier ?? "free";

  const { data, isPending, isError, refetch } = useCandidateProfile(
    id,
    tier,
    selectedCampaignId,
    account?.id,
  );
  const candidate = data?.candidate;
  const application = data?.application;
  const campaign = data?.campaign;
  const assignments = data?.assignments ?? [];
  const interviewerFeedback = data?.interviewerFeedback ?? [];
  const offers = data?.offers ?? [];
  const campaignName = data?.campaignName;
  const candidateCampaigns = data?.candidateCampaigns ?? [];
  const resumeUrl = data?.resumeUrl;
  const timeline = data?.timeline ?? [];
  const outreach = data?.outreach ?? [];
  const interviewRecordings = data?.interviewRecordings ?? [];
  const interviewTranscripts = data?.interviewTranscripts ?? [];
  const voiceScreenTranscripts = data?.voiceScreenTranscripts ?? [];
  const latestScorecard = data?.latestScorecard;

  // Application Decision & Action States
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("Unqualified");
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);

  // Application Contact Editing States
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);

  // Offer Modal State
  const [offerModalOpen, setOfferModalOpen] = useState(false);

  useEffect(() => {
    if (application) {
      setContactName(application.candidate_name || candidate?.name || "");
      setContactEmail(application.candidate_email || candidate?.email || "");
      setContactPhone(application.candidate_phone || candidate?.phone || "");
      setContactWhatsapp(!!application.whatsapp_opt_in);
    } else if (candidate) {
      setContactName(candidate.name || "");
      setContactEmail(candidate.email || "");
      setContactPhone(candidate.phone || "");
      setContactWhatsapp(false);
    }
  }, [application, candidate]);

  const handleAdvance = async () => {
    if (!application?.id) return;
    setDecisionBusy(true);
    try {
      await decideApplication({ applicationId: application.id, action: "advance" });
      showToast("Application advanced successfully", { kind: "success" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
    } catch (err: any) {
      showErrorToast(err?.message || "Failed to advance application");
    } finally {
      setDecisionBusy(false);
    }
  };

  const handleHoldToggle = async () => {
    if (!application?.id) return;
    const isHold = application.status === "on_hold";
    setDecisionBusy(true);
    try {
      await decideApplication({
        applicationId: application.id,
        action: isHold ? "resume" : "hold",
      });
      showToast(isHold ? "Application resumed" : "Application placed on hold", { kind: "success" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
    } catch (err: any) {
      showErrorToast(err?.message || "Failed to update hold status");
    } finally {
      setDecisionBusy(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!application?.id) return;
    setRejectBusy(true);
    try {
      const fullReason = rejectionNotes.trim()
        ? `${rejectionReason}: ${rejectionNotes.trim()}`
        : rejectionReason;
      await decideApplication({
        applicationId: application.id,
        action: "reject",
        rejectionReason: fullReason,
      });
      showToast("Candidate application rejected", { kind: "info" });
      setRejectModalOpen(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
    } catch (err: any) {
      showErrorToast(err?.message || "Failed to reject application");
    } finally {
      setRejectBusy(false);
    }
  };

  const handleSaveContact = async () => {
    if (!application?.id) return;
    if (!contactName.trim() || !contactEmail.trim()) {
      showErrorToast("Candidate name and email are required.");
      return;
    }
    setContactSaving(true);
    try {
      await updateApplicationContact({
        applicationId: application.id,
        candidateName: contactName.trim(),
        candidateEmail: contactEmail.trim(),
        candidatePhone: contactPhone.trim() || null,
        whatsappOptIn: contactWhatsapp,
      });
      showToast("Application contact details updated", { kind: "success" });
      setContactModalOpen(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
    } catch (err: any) {
      showErrorToast(err?.message || "Failed to update contact details");
    } finally {
      setContactSaving(false);
    }
  };

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
    const params = new URLSearchParams();
    params.set("phone", candidate.phone);
    if (account?.id) params.set("account_id", account.id);
    if (selectedCampaignId) params.set("campaign_id", selectedCampaignId);
    if (id) params.set("candidate_id", id);

    fetch(`/api/voice-screen/call-status?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.calls) setDialnexaCalls(json.calls);
      })
      .catch((err) => console.warn("Failed to load call status:", err))
      .finally(() => setLoadingCalls(false));
  }, [candidate?.phone, account?.id, selectedCampaignId, id]);

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

  if (isPending || (accountLoading && !data)) {
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

      {candidateCampaigns.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-card/60 backdrop-blur-sm border border-border/80 rounded-xl shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center p-1.5 rounded-lg bg-primary/10 text-primary">
              <Layers className="h-4 w-4" />
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="text-xs font-semibold text-foreground">Campaign Application:</span>
              <select
                value={data?.selectedCampaignId || candidateCampaigns[0]?.id || ""}
                onChange={(e) => {
                  const newCampId = e.target.value;
                  setSelectedCampaignId(newCampId);
                  router.replace(`/candidates/${id}?campaignId=${newCampId}`);
                }}
                className="text-xs rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-foreground cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-primary"
              >
                {candidateCampaigns.map((camp) => (
                  <option key={camp.id} value={camp.id}>
                    {camp.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground italic">
            Displaying rounds, transcripts, and evaluation scorecards for this specific campaign
            only
          </span>
        </div>
      )}

      {/* Application Control & Status Card */}
      {application ? (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-card/80 backdrop-blur-sm border border-border rounded-2xl shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">Application Status:</span>
                {statusBadge(application.status)}
                {application.current_round_number && (
                  <Badge variant="outline" className="text-xs">
                    Round {application.current_round_number}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {application.status === "rejected" && application.rejection_reason
                  ? `Rejection recorded: ${application.rejection_reason}`
                  : `Active application for ${campaignName || "Campaign"}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {application.status !== "rejected" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decisionBusy}
                  onClick={handleHoldToggle}
                  className="rounded-xl text-xs gap-1.5"
                >
                  {application.status === "on_hold" ? (
                    <>
                      <Play className="h-3.5 w-3.5 text-emerald-500" /> Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5 text-amber-500" /> Put on Hold
                    </>
                  )}
                </Button>

                {application.status !== "offer_sent" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decisionBusy}
                    onClick={handleAdvance}
                    className="rounded-xl text-xs gap-1.5 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Advance
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOfferModalOpen(true)}
                  className="rounded-xl text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                >
                  <FileSignature className="h-3.5 w-3.5 text-primary" /> Prepare & Send Offer
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={decisionBusy}
                  onClick={() => setRejectModalOpen(true)}
                  className="rounded-xl text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="h-3.5 w-3.5 text-destructive" /> Reject
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Application Contact Details Card */}
      <SectionCard
        title="Application Contact Details"
        subtitle="Application-scoped contact information. As per recruitment policy, candidate resumes cannot be replaced once submitted."
        action={
          application && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setContactModalOpen(true)}
              className="rounded-xl text-xs gap-1.5"
            >
              <Edit2 className="h-3.5 w-3.5" /> Edit Contact Info
            </Button>
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-muted/20 border border-border/50 p-3">
            <span className="text-[11px] font-medium text-muted-foreground block">Name</span>
            <span className="text-sm font-semibold text-foreground">
              {application?.candidate_name || candidate.name || "—"}
            </span>
          </div>
          <div className="rounded-xl bg-muted/20 border border-border/50 p-3">
            <span className="text-[11px] font-medium text-muted-foreground block">Email</span>
            <span className="text-sm font-semibold text-foreground truncate block">
              {application?.candidate_email || candidate.email || "—"}
            </span>
          </div>
          <div className="rounded-xl bg-muted/20 border border-border/50 p-3">
            <span className="text-[11px] font-medium text-muted-foreground block">Phone</span>
            <span className="text-sm font-semibold text-foreground">
              {application?.candidate_phone || candidate.phone || "Not provided"}
            </span>
          </div>
          <div className="rounded-xl bg-muted/20 border border-border/50 p-3">
            <span className="text-[11px] font-medium text-muted-foreground block">
              WhatsApp Status
            </span>
            <span className="text-sm font-semibold text-foreground">
              {application?.whatsapp_opt_in ? (
                <span className="text-emerald-500 font-medium">Opted in</span>
              ) : (
                <span className="text-muted-foreground font-normal">Not opted in</span>
              )}
            </span>
          </div>
        </div>
      </SectionCard>

      {/* Offers History */}
      {offers.length > 0 && <OffersHistorySection offers={offers} />}

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

      {/* Take-Home Assignments */}
      {assignments.length > 0 && <TakeHomeAssignmentsSection assignments={assignments} />}

      {/* Human Interviewer Feedback */}
      {interviewerFeedback.length > 0 && (
        <InterviewerFeedbackSection feedback={interviewerFeedback} />
      )}

      <InterviewMediaAndTranscriptSection
        recordings={interviewRecordings}
        transcripts={interviewTranscripts}
        scorecard={latestScorecard}
        sessionId={interviewRecordings[0]?.sessionId}
        onRefresh={() => refetch()}
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

      {/* Rejection Confirmation Modal */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" /> Reject Candidate Application
            </DialogTitle>
            <DialogDescription>
              This action is permanent and transitions this application to Rejected. An optional
              feedback reason can be recorded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rejection-reason" className="text-xs font-semibold">
                Rejection Reason *
              </Label>
              <select
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
              >
                <option value="Unqualified">Unqualified / Skills Mismatch</option>
                <option value="Culture / Team fit">Culture / Team fit</option>
                <option value="Compensation mismatch">Compensation mismatch</option>
                <option value="Declined assessment">Declined assessment / No show</option>
                <option value="Offer declined">Offer declined by candidate</option>
                <option value="Other">Other reason</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rejection-notes" className="text-xs font-semibold">
                Internal Feedback / Audit Notes (Optional)
              </Label>
              <Textarea
                id="rejection-notes"
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                placeholder="Specific notes or candidate feedback..."
                rows={3}
                className="rounded-xl text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectModalOpen(false)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={rejectBusy}
              onClick={handleConfirmReject}
              className="rounded-xl gap-1.5"
            >
              {rejectBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Info Modal */}
      <Dialog open={contactModalOpen} onOpenChange={setContactModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" /> Edit Application Contact Info
            </DialogTitle>
            <DialogDescription>
              Update candidate contact details for this specific application. Per hiring policy,
              submitted resumes cannot be replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label htmlFor="contact-name" className="text-xs font-semibold">
                Candidate Name *
              </Label>
              <Input
                id="contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Full name"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact-email" className="text-xs font-semibold">
                Candidate Email *
              </Label>
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="candidate@example.com"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contact-phone" className="text-xs font-semibold">
                Candidate Phone
              </Label>
              <Input
                id="contact-phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+1..."
                className="rounded-xl"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="contact-whatsapp"
                type="checkbox"
                checked={contactWhatsapp}
                onChange={(e) => setContactWhatsapp(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <Label
                htmlFor="contact-whatsapp"
                className="text-xs text-foreground font-medium cursor-pointer"
              >
                Candidate opted into WhatsApp outreach & reminders
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setContactModalOpen(false)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={contactSaving}
              onClick={handleSaveContact}
              className="rounded-xl gap-1.5"
            >
              {contactSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prepare & Send Offer Modal */}
      {application && (
        <PrepareOfferModal
          open={offerModalOpen}
          onOpenChange={setOfferModalOpen}
          candidate={
            candidate
              ? {
                  candidate_id: candidate.id,
                  name: application.candidate_name || candidate.name || "Candidate",
                  email: application.candidate_email || candidate.email || "",
                  phone: application.candidate_phone || candidate.phone || null,
                  current_stage: "offer",
                  current_round_number: application.current_round_number ?? 1,
                  application_id: application.id,
                  status: application.status,
                  latest_score: null,
                  decision: null,
                }
              : null
          }
          campaign={
            campaign || {
              id: application.campaign_id,
              name: campaignName || "Role",
              account_id: account?.id || "",
              jd_text: "",
              number_of_rounds: 1,
              status: "open",
              number_of_openings: 1,
              opening_date: new Date().toISOString().split("T")[0],
              closing_date: new Date().toISOString().split("T")[0],
              created_at: new Date().toISOString(),
              location: "Remote",
              work_arrangement: "remote",
              salary_min: null,
              salary_max: null,
              salary_currency: "USD",
              salary_period: null,
              closed_at: null,
              retention_days_snapshot: null,
              retention_remaining_seconds: null,
              retention_purge_at: null,
              voice_call_config: null,
              cadence_config: null,
            }
          }
          recruiterEmail={account?.email || ""}
          onComplete={() => {
            refetch();
            queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
          }}
        />
      )}
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
  scorecard,
  sessionId,
  onRefresh,
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
  scorecard?: ScorecardRow | null;
  sessionId?: string;
  onRefresh?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"scorecard" | "recording" | "transcript">(
    scorecard ? "scorecard" : transcripts.length > 0 ? "transcript" : "recording",
  );
  const [scoringBusy, setScoringBusy] = useState(false);

  const handleTriggerScoring = async () => {
    if (!sessionId) return;
    setScoringBusy(true);
    try {
      const res = await fetch("/api/interview/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "score", sessionId }),
      });
      if (res.ok) {
        onRefresh?.();
      }
    } catch (err) {
      console.warn("Failed to trigger scoring:", err);
    } finally {
      setScoringBusy(false);
    }
  };

  const hasRecordings = recordings.some((r) => !!r.recordingSignedUrl);
  const hasTranscripts = transcripts.length > 0;
  const hasScorecard = !!scorecard;

  if (!hasRecordings && !hasTranscripts && recordings.length === 0 && !hasScorecard) {
    return (
      <SectionCard
        title="AI Interview Session & Recording"
        subtitle="Video recording, evaluation scorecard, and dialogue transcript"
      >
        <EmptyState
          title="No interview recording or transcript yet"
          hint="Once the candidate connects to the AI interview room and completes questions, the video recording, scorecard, and dialogue transcript will appear here."
          className="py-4"
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="AI Interview Evaluation, Recording & Transcript"
      subtitle="Comprehensive AI scoring breakdown, full session video, and turn-by-turn dialogue transcript"
      action={
        <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-1">
          <Button
            size="sm"
            variant={activeTab === "scorecard" ? "secondary" : "ghost"}
            className="h-7 px-2.5 text-xs gap-1.5"
            onClick={() => setActiveTab("scorecard")}
          >
            <Award className="h-3.5 w-3.5 text-primary" />
            Scorecard {scorecard?.overall_score != null ? `(${scorecard.overall_score}/100)` : ""}
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
          <Button
            size="sm"
            variant={activeTab === "recording" ? "secondary" : "ghost"}
            className="h-7 px-2.5 text-xs gap-1.5"
            onClick={() => setActiveTab("recording")}
          >
            <Video className="h-3.5 w-3.5 text-blue-500" />
            Recording {hasRecordings ? "Available" : ""}
          </Button>
        </div>
      }
    >
      {activeTab === "scorecard" ? (
        <div className="space-y-4">
          {scorecard ? (
            <div className="space-y-4">
              {/* Scorecard Hero Banner */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        Overall AI Evaluation Score
                      </span>
                      {scorecard.recommendation && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "capitalize text-xs font-semibold px-2.5 py-0.5",
                            scorecard.recommendation === "hire"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : scorecard.recommendation === "advance"
                                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                                : scorecard.recommendation === "no_go"
                                  ? "bg-destructive/15 text-destructive border border-destructive/30"
                                  : "bg-warning/15 text-warning border border-warning/30",
                          )}
                        >
                          {scorecard.recommendation.replace("_", " ")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Evaluated on {formatDateTime(scorecard.evaluated_at)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-extrabold text-foreground tracking-tight">
                    {scorecard.overall_score ?? "—"}
                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                  </div>
                </div>
              </div>

              {/* 5 Competency Score Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: "Technical", score: scorecard.technical_score },
                  { label: "Communication", score: scorecard.communication_score },
                  { label: "Problem Solving", score: scorecard.problem_solving_score },
                  { label: "Cultural Fit", score: scorecard.cultural_fit_score },
                  { label: "Authenticity", score: scorecard.authenticity_score },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center space-y-1"
                  >
                    <span className="text-[11px] font-medium text-muted-foreground block truncate">
                      {item.label}
                    </span>
                    <span className="text-lg font-bold text-foreground">
                      {item.score != null ? `${item.score}` : "—"}
                      <span className="text-xs font-normal text-muted-foreground">/100</span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Strengths & Weaknesses */}
              {((Array.isArray(scorecard.strengths) && scorecard.strengths.length > 0) ||
                (Array.isArray(scorecard.weaknesses) && scorecard.weaknesses.length > 0)) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {Array.isArray(scorecard.strengths) && scorecard.strengths.length > 0 && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-2">
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" /> Demonstrated Strengths
                      </span>
                      <ul className="text-xs text-foreground space-y-1 list-disc list-inside">
                        {(scorecard.strengths as any[]).map((s: any) => (
                          <li key={String(s)}>{String(s)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(scorecard.weaknesses) && scorecard.weaknesses.length > 0 && (
                    <div className="rounded-xl border border-warning/20 bg-warning/5 p-3.5 space-y-2">
                      <span className="text-xs font-semibold text-warning flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4" /> Areas of Concern / Weaknesses
                      </span>
                      <ul className="text-xs text-foreground space-y-1 list-disc list-inside">
                        {(scorecard.weaknesses as any[]).map((w: any) => (
                          <li key={String(w)}>{String(w)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Red Flags */}
              {Array.isArray(scorecard.red_flags) && scorecard.red_flags.length > 0 && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 space-y-2">
                  <span className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" /> Critical Evaluation Flags
                  </span>
                  <ul className="text-xs text-destructive space-y-1 list-disc list-inside">
                    {(scorecard.red_flags as any[]).map((flag: any) => (
                      <li key={String(flag)}>{String(flag)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Evaluation Rationale */}
              {scorecard.rationale && (
                <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Evaluation Rationale
                  </span>
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                    {scorecard.rationale}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-6 text-center space-y-3">
              <Sparkles className="mx-auto h-8 w-8 text-primary/60" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Interview Completed — Scoring In Progress
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  The candidate has finished their interview session. The AI scoring engine
                  evaluates their responses across technical, communication, problem-solving, and
                  authenticity signals.
                </p>
              </div>
              {sessionId && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={scoringBusy}
                  onClick={handleTriggerScoring}
                  className="rounded-xl text-xs gap-1.5"
                >
                  {scoringBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="h-3.5 w-3.5 text-primary" />
                  )}
                  {scoringBusy ? "Running Evaluation..." : "Generate AI Scorecard Now"}
                </Button>
              )}
            </div>
          )}
        </div>
      ) : activeTab === "recording" ? (
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
                  ? `Interview session is currently ${recordings[0].status}. No video stream recording was captured (e.g. camera permission was not granted by candidate browser, or device lacked camera input).`
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

                  {/* Interviewer Acknowledgment (if present and distinct) */}
                  {turn.interviewer_text &&
                    turn.interviewer_text.trim() !== turn.question_text.trim() && (
                      <div className="rounded-lg bg-muted/20 p-2.5 text-xs text-muted-foreground italic border border-border/20 flex items-start gap-2">
                        <Bot className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0 not-italic" />
                        <div>
                          <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground/80 block not-italic">
                            Interviewer Acknowledgment
                          </span>
                          <span>"{turn.interviewer_text}"</span>
                        </div>
                      </div>
                    )}

                  {/* Interviewer Question */}
                  <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-foreground leading-relaxed border border-border/30">
                    <p className="font-semibold text-primary text-[11px] mb-1 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3" /> Interview Question:
                    </p>
                    <p className="font-medium text-foreground">{turn.question_text}</p>
                  </div>

                  {/* Candidate Answer */}
                  <div className="rounded-lg bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 p-2.5 text-xs text-foreground leading-relaxed">
                    <p className="font-medium text-emerald-600 dark:text-emerald-400 text-[11px] mb-1 flex items-center gap-1">
                      <User className="h-3 w-3" /> Candidate Response:
                    </p>
                    {turn.answer_text?.trim() ? (
                      <p className="italic">"{turn.answer_text}"</p>
                    ) : (
                      <p className="text-muted-foreground italic">
                        (Candidate did not provide a verbal or typed response to this question)
                      </p>
                    )}
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
            Loading call recordings & transcripts…
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

function TakeHomeAssignmentsSection({ assignments }: { assignments: AssignmentsRow[] }) {
  if (assignments.length === 0) return null;
  return (
    <SectionCard
      title="Practical Take-Home Assignments"
      subtitle="Candidate brief, submission status, and reviewer evaluation scores"
    >
      <div className="space-y-4">
        {assignments.map((a) => (
          <div key={a.id} className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Take-Home Assignment</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[11px] capitalize",
                    a.status === "submitted"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : a.status === "issued"
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                        : "bg-destructive/15 text-destructive",
                  )}
                >
                  {a.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Deadline: {formatDateTime(a.deadline_at)}
              </div>
            </div>

            <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-xs space-y-1">
              <span className="font-semibold text-muted-foreground block text-[11px] uppercase tracking-wide">
                Assignment Prompt / Brief:
              </span>
              <p className="text-foreground whitespace-pre-wrap">{a.brief_text}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function InterviewerFeedbackSection({ feedback }: { feedback: InterviewerFeedbackRow[] }) {
  if (feedback.length === 0) return null;
  return (
    <SectionCard
      title="Human Interviewer Evaluations & Feedback"
      subtitle="Evaluations, recommendations, and structured feedback from panel interviewers"
    >
      <div className="space-y-4">
        {feedback.map((f) => (
          <div key={f.id} className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  Interviewer · {f.team_member_id.slice(0, 8)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {f.overall_score != null && (
                  <span className="text-sm font-bold text-foreground">
                    {f.overall_score}
                    <span className="text-xs font-normal text-muted-foreground">/100</span>
                  </span>
                )}
                {f.submitted_at && (
                  <span className="text-xs text-muted-foreground">
                    · {formatDateTime(f.submitted_at)}
                  </span>
                )}
              </div>
            </div>

            {f.notes && (
              <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-xs space-y-1">
                <span className="font-semibold text-muted-foreground block text-[11px] uppercase tracking-wide">
                  Feedback Notes:
                </span>
                <p className="text-foreground whitespace-pre-wrap">{f.notes}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function OffersHistorySection({ offers }: { offers: OffersRow[] }) {
  if (offers.length === 0) return null;
  return (
    <SectionCard
      title="Candidate Offers"
      subtitle="Formal employment offers generated and dispatched via SignWell e-signature"
    >
      <div className="space-y-3">
        {offers.map((o) => (
          <div
            key={o.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
                <FileSignature className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {offerField(o, "position_title") || "Employment Offer"}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[11px] capitalize",
                      o.status === "sent_to_candidate"
                        ? "bg-purple-500/15 text-purple-600"
                        : o.status === "awaiting_company_signature"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {o.status === "awaiting_company_signature"
                      ? "Awaiting recruiter signature"
                      : o.status === "sent_to_candidate"
                        ? "Sent to candidate"
                        : "Voided"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Compensation: {offerField(o, "currency") || ""} {offerField(o, "salary") || "—"} ·{" "}
                  {o.sent_to_candidate_at ? "Sent" : "Created"}{" "}
                  {formatDateTime(o.sent_to_candidate_at || o.created_at)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2"></div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
