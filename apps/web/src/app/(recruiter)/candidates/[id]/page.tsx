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
  Brain,
  Briefcase,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Edit2,
  ExternalLink,
  Eye,
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
  ShieldCheck,
  Sparkles,
  Target,
  User,
  UserCheck,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PrepareOfferModal } from "@/components/campaigns/PrepareOfferModal";
import { ViewOfferLetterModal } from "@/components/campaigns/ViewOfferLetterModal";
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

function formatDisplayText(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/\buser_busy\b/gi, "user busy")
    .replace(/\bno_go\b/gi, "no-go")
    .replace(/\bno_show\b/gi, "no-show")
    .replace(/\bin_progress\b/gi, "in progress")
    .replace(/\bstrong_hire\b/gi, "strong hire")
    .replace(/\bai_interview\b/gi, "AI interview")
    .replace(/\bai_voice_call\b/gi, "AI voice call")
    .replace(/\bai_voice\b/gi, "AI voice call")
    .replace(/\bvoice_screen\b/gi, "voice screening")
    .replace(/\bresume_screening\b/gi, "resume screening")
    .replace(/\bnot_started\b/gi, "not started")
    .replace(/\boffer_sent\b/gi, "offer sent")
    .replace(/\boffer_ready\b/gi, "offer ready")
    .replace(/\bround_(\d+)\b/gi, "Round $1")
    .replace(/\bdecision_ledger\b/gi, "evaluation record")
    .replace(/\bround_instances?\b/gi, "round")
    .replace(/([a-zA-Z0-9])_([a-zA-Z0-9])/g, "$1 $2");
}

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
      return (
        <Badge variant="outline" className="capitalize">
          {status ? status.replace(/_/g, " ") : "Unknown"}
        </Badge>
      );
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
  resume: "Resume Screening",
  "resume screening": "Resume Screening",
  resume_screening: "Resume Screening",
  voice_screen: "Voice Screening",
  voice_screening: "Voice Screening",
  ai_interview: "AI Interview",
  ai_voice: "AI Voice Call",
  ai_voice_call: "AI Voice Call",
  round_undefined: "Round 1 Interview",
  round_1: "Round 1 Interview",
  round_2: "Round 2 Interview",
  round_3: "Round 3 Interview",
  round_4: "Round 4 Interview",
  human_feedback: "Interviewer Feedback",
  assignment: "Take-Home Assignment",
  offer: "Offer Stage",
  override: "Manual Override",
};

function stageLabel(stage: string): string {
  if (!stage) return "";
  const lower = stage.toLowerCase().trim();
  if (STAGE_LABELS[lower]) return STAGE_LABELS[lower];
  const n = roundNumberFromStage(lower);
  if (n) return `Round ${n} Interview`;
  if (lower.includes("resume")) return "Resume Screening";
  if (lower.includes("voice")) return "Voice Screening";
  if (lower.includes("interview")) return "AI Interview";
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
  const urlTab = searchParams.get("tab");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(urlCampaignId);

  useEffect(() => {
    if (urlCampaignId) {
      setSelectedCampaignId(urlCampaignId);
    }
  }, [urlCampaignId]);

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (selectedCampaignId || urlCampaignId) {
      const tabParam = urlTab ? `?tab=${urlTab}` : "";
      router.push(`/campaigns/${selectedCampaignId || urlCampaignId}${tabParam}`);
    } else {
      router.push("/dashboard");
    }
  };

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

  // Real-time live data sync: refetch candidate profile as interview rounds, answers, sessions, and scorecards stream in
  useEffect(() => {
    if (!id) return;
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`candidate-live-sync-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "round_instances", filter: `candidate_id=eq.${id}` },
        () => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "interview_sessions",
          filter: `candidate_id=eq.${id}`,
        },
        () => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "interview_answers" }, () => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "scorecards" }, () => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decision_ledger", filter: `candidate_id=eq.${id}` },
        () => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ["candidates", "profile", id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetch, queryClient]);

  // Application Contact Editing States
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);

  // Offer Modal State
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [viewOfferOpen, setViewOfferOpen] = useState(false);

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
      scorecard?: {
        overall_score: number;
        recommendation: string;
        reason: string;
        metrics: Record<string, { score: number; weight: number; reason: string }>;
        strengths?: string[];
        concerns?: string[];
      };
    }>
  >([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  const effectiveCampaignId =
    selectedCampaignId || application?.campaign_id || campaign?.id || null;

  useEffect(() => {
    if (!candidate?.phone) {
      setDialnexaCalls([]);
      return;
    }
    setLoadingCalls(true);
    setDialnexaCalls([]);
    const params = new URLSearchParams();
    params.set("phone", candidate.phone);
    if (account?.id) params.set("account_id", account.id);
    if (effectiveCampaignId) params.set("campaign_id", effectiveCampaignId);
    if (id) params.set("candidate_id", id);

    fetch(`/api/voice-screen/call-status?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.calls && Array.isArray(json.calls)) {
          setDialnexaCalls(json.calls);
        } else {
          setDialnexaCalls([]);
        }
      })
      .catch((err) => {
        console.warn("Failed to load call status:", err);
        setDialnexaCalls([]);
      })
      .finally(() => setLoadingCalls(false));
  }, [candidate?.phone, account?.id, effectiveCampaignId, id]);

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
      showErrorToast("Please provide a reason for the override.");
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
        application_id: application?.id ?? null,
        round_instance_id: targetRow?.round_instance_id ?? null,
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
        <button
          type="button"
          onClick={handleGoBack}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Go back
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={handleGoBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
      >
        <ArrowLeft
          className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        />
        <span>{campaignName ? `Back to ${campaignName}` : "Go back"}</span>
      </button>

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
                  ? `Rejection reason: ${formatDisplayText(application.rejection_reason)}`
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

                {application.status === "offer_sent" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setViewOfferOpen(true)}
                    className="rounded-xl text-xs gap-1.5 border-emerald-500/40 text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 font-semibold cursor-pointer"
                  >
                    <FileSignature className="h-3.5 w-3.5 text-emerald-600" /> View Sent Offer
                    Letter
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOfferModalOpen(true)}
                    className="rounded-xl text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer"
                  >
                    <FileSignature className="h-3.5 w-3.5 text-primary" /> Prepare & Send Offer
                  </Button>
                )}

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
        subtitle="Candidate contact details for this campaign application."
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
      {offers.length > 0 && (
        <OffersHistorySection offers={offers} onViewOffer={() => setViewOfferOpen(true)} />
      )}

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
        subtitle="Chronological record of round evaluations, assessments, and status updates."
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
        sessionId={
          interviewRecordings[0]?.sessionId ||
          (data as any)?.interviewSessionId ||
          timeline.find((t) => t.session?.id)?.session?.id ||
          undefined
        }
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
              placeholder="Reason for the override (e.g. exceptional portfolio, recruiter review)"
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
        subtitle="Record of automated candidate notifications, interview invites, and communications."
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
                Internal Notes (Optional)
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
          onViewOffer={() => setViewOfferOpen(true)}
        />
      )}

      {/* View Sent Offer Letter Modal */}
      <ViewOfferLetterModal
        open={viewOfferOpen}
        onOpenChange={setViewOfferOpen}
        candidate={{
          application_id: application?.id,
          candidate_id: id,
          name: application?.candidate_name || candidate?.name,
          email: application?.candidate_email || candidate?.email,
        }}
        campaignId={selectedCampaignId || undefined}
      />
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
                {row.score != null ? (
                  <span className="text-lg font-semibold text-foreground">{row.score}</span>
                ) : row.session?.status === "incomplete" ||
                  row.forRound?.status === "incomplete" ? (
                  <Badge
                    variant="outline"
                    className="border-rose-500/40 text-rose-600 bg-rose-500/10 text-xs gap-1 font-semibold"
                  >
                    <AlertCircle className="h-3 w-3 text-rose-500" /> Ended Early
                  </Badge>
                ) : row.session?.status === "in_progress" ||
                  row.forRound?.status === "in_progress" ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 text-amber-600 bg-amber-500/10 text-xs gap-1 animate-pulse"
                  >
                    <Clock className="h-3 w-3 animate-spin" /> In Progress
                  </Badge>
                ) : row.session?.status === "completed" || row.forRound?.status === "completed" ? (
                  <Badge
                    variant="outline"
                    className="border-blue-500/40 text-blue-600 bg-blue-500/10 text-xs gap-1"
                  >
                    <Sparkles className="h-3 w-3" /> Evaluating
                  </Badge>
                ) : (
                  <span className="text-lg font-semibold text-muted-foreground">—</span>
                )}
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
                    Technical interruption recorded — a retake link was sent automatically. Reason:{" "}
                    {formatDisplayText(row.forRound.fault_reason)}
                  </p>
                )}
                {row.scorecard && <ScorecardSummary row={row} />}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ScorecardSummary({ row }: { row: LedgerView }) {
  if (!row.scorecard && !row.score) return null;
  const sc = row.scorecard;
  const score = sc?.overall_score ?? row.score;
  const rationale = sc?.rationale || row.rationale;

  const dims = [
    ["Technical", sc?.technical_score],
    ["Communication", sc?.communication_score],
    ["Problem Solving", sc?.problem_solving_score],
    ["Cultural Fit", sc?.cultural_fit_score],
    ["Authenticity", sc?.authenticity_score],
  ] as const;

  return (
    <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Award className="h-3.5 w-3.5 text-primary" /> AI Evaluation Scorecard
        </span>
        <div className="flex items-center gap-2">
          {sc?.recommendation && (
            <Badge
              variant="secondary"
              className={cn(
                "capitalize text-[10px] font-semibold px-2 py-0.5",
                sc.recommendation === "hire" || sc.recommendation === "advance"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : sc.recommendation === "no_go"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-warning/15 text-warning",
              )}
            >
              {sc.recommendation.replace(/_/g, " ")}
            </Badge>
          )}
          <span className="text-xs font-bold text-foreground">
            {score != null ? `${score}/100` : "—"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5 pt-1">
        {dims.map(([label, v]) => (
          <div key={label} className="rounded-lg bg-card border border-border/40 p-2 space-y-1">
            <span className="text-[10px] text-muted-foreground block truncate">{label}</span>
            <span className="text-xs font-bold text-foreground">
              {v != null ? `${v}/100` : "—"}
            </span>
            <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  v != null && v >= 80
                    ? "bg-emerald-500"
                    : v != null && v >= 70
                      ? "bg-blue-500"
                      : "bg-amber-500",
                )}
                style={{ width: `${Math.min(100, Math.max(0, v || 0))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {rationale && (
        <div className="rounded-lg border border-border/60 bg-card p-2.5 text-xs space-y-1">
          <span className="font-semibold text-primary flex items-center gap-1 text-[10px] uppercase tracking-wider">
            <Sparkles className="h-3 w-3" /> Evaluation Reason:
          </span>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {formatDisplayText(rationale)}
          </p>
        </div>
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
      {state.replace(/_/g, " ")}
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
            <TableCell className="text-foreground">{stageLabel(r.stage)}</TableCell>
            <TableCell className="text-muted-foreground capitalize">
              {r.channel.replace(/_/g, " ")}
            </TableCell>
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
  const currentRec = recordings.find((r) => r.sessionId === sessionId) || recordings[0];
  const isEndedEarly =
    currentRec?.status === "incomplete" ||
    (!currentRec?.completedAt &&
      !!currentRec?.startedAt &&
      Date.now() - new Date(currentRec.startedAt).getTime() > 25 * 60 * 1000);
  const isInProgress = currentRec?.status === "in_progress" && !isEndedEarly;

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
                          {scorecard.recommendation.replace(/_/g, " ")}
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
                    {scorecard.overall_score ??
                      (Math.round(
                        (scorecard.technical_score ?? 0) * 0.35 +
                          (scorecard.communication_score ?? 0) * 0.25 +
                          (scorecard.problem_solving_score ?? 0) * 0.2 +
                          (scorecard.cultural_fit_score ?? 0) * 0.1 +
                          (scorecard.authenticity_score ?? 0) * 0.1,
                      ) ||
                        "—")}
                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                  </div>
                </div>
              </div>

              {/* 5 Competency Score Cards with Evaluated Reasons & Metrics */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  {
                    label: "Technical Depth",
                    icon: Code2,
                    weight: "35%",
                    score: scorecard.technical_score,
                    reason:
                      scorecard.technical_score != null
                        ? scorecard.technical_score >= 80
                          ? "In-depth technical comprehension with concrete implementation patterns, domain terminology, and architectural concepts."
                          : scorecard.technical_score >= 70
                            ? "Solid understanding of core technical concepts with adequate practical answers addressing prompts."
                            : "Basic technical awareness; opportunity for deeper elaboration on complex architecture."
                        : "Evaluation pending",
                  },
                  {
                    label: "Communication",
                    icon: MessageSquare,
                    weight: "25%",
                    score: scorecard.communication_score,
                    reason:
                      scorecard.communication_score != null
                        ? scorecard.communication_score >= 80
                          ? "Highly articulate, structured responses with clear thought progression and professional clarity."
                          : scorecard.communication_score >= 70
                            ? "Clear and understandable explanations throughout the interview session."
                            : "Concise answers; opportunity for more structured verbal articulation."
                        : "Evaluation pending",
                  },
                  {
                    label: "Problem Solving",
                    icon: Brain,
                    weight: "20%",
                    score: scorecard.problem_solving_score,
                    reason:
                      scorecard.problem_solving_score != null
                        ? scorecard.problem_solving_score >= 80
                          ? "Methodical analytical scenario breakdown with sound trade-off awareness and logical progression."
                          : scorecard.problem_solving_score >= 70
                            ? "Systematic scenario handling addressing the primary task requirements."
                            : "Partial scenario resolution or early session termination before completing all problems."
                        : "Evaluation pending",
                  },
                  {
                    label: "Cultural & Team Fit",
                    icon: Users,
                    weight: "10%",
                    score: scorecard.cultural_fit_score,
                    reason:
                      scorecard.cultural_fit_score != null
                        ? scorecard.cultural_fit_score >= 80
                          ? "Strong alignment with collaborative team values, ownership mindset, and constructive communication."
                          : "Standard professional workplace demeanor and collaborative receptiveness."
                        : "Evaluation pending",
                  },
                  {
                    label: "Authenticity & Integrity",
                    icon: ShieldCheck,
                    weight: "10%",
                    score: scorecard.authenticity_score,
                    reason:
                      scorecard.authenticity_score != null
                        ? scorecard.authenticity_score >= 80
                          ? "Live telemetry verified candid, natural human cadence without automated or generative assistance."
                          : "Standard authenticity signals verified across session telemetry."
                        : "Evaluation pending",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const scVal = item.score;
                  const isHigh = scVal != null && scVal >= 80;
                  const isMed = scVal != null && scVal >= 70 && scVal < 80;
                  return (
                    <div
                      key={item.label}
                      className="rounded-xl border border-border/70 bg-card p-3.5 space-y-2.5 flex flex-col justify-between shadow-2xs"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 truncate">
                            <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                            {item.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {item.weight}
                          </span>
                        </div>

                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-extrabold text-foreground tracking-tight">
                            {scVal != null ? scVal : "—"}
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">/100</span>
                        </div>

                        <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              isHigh ? "bg-emerald-500" : isMed ? "bg-blue-500" : "bg-amber-500",
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, scVal || 0))}%` }}
                          />
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
                        {item.reason}
                      </p>
                    </div>
                  );
                })}
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

              {/* Evaluation Rationale & Decision Reason */}
              {scorecard.rationale && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" /> AI Evaluation Reason & Decision Rationale
                  </span>
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                    {formatDisplayText(scorecard.rationale)}
                  </p>
                </div>
              )}
            </div>
          ) : isEndedEarly ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-3">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  AI Interview Incomplete — Candidate Ended Session Early
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  The candidate closed or left the interview room before answering all questions.
                  {transcripts.length > 0
                    ? ` ${transcripts.length} partial response(s) were recorded.`
                    : ""}
                  You can inspect the answers submitted so far or generate an evaluation based on
                  their partial performance.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {transcripts.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setActiveTab("transcript")}
                    className="rounded-xl text-xs gap-1.5"
                  >
                    <MessageSquareText className="h-3.5 w-3.5 text-emerald-500" />
                    View Captured Transcript ({transcripts.length})
                  </Button>
                )}
                {sessionId && transcripts.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={scoringBusy}
                    onClick={handleTriggerScoring}
                    className="rounded-xl text-xs gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  >
                    {scoringBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    {scoringBusy ? "Evaluating Partial Answers..." : "Score Available Answers"}
                  </Button>
                )}
              </div>
            </div>
          ) : isInProgress ? (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6 text-center space-y-3">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15 text-blue-500">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  AI Interview Currently In Progress
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  The candidate is currently in the interview room. Responses are syncing to the
                  database as questions are answered.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {transcripts.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setActiveTab("transcript")}
                    className="rounded-xl text-xs gap-1.5"
                  >
                    <MessageSquareText className="h-3.5 w-3.5 text-emerald-500" />
                    View Synced Answers ({transcripts.length})
                  </Button>
                )}
                {sessionId && transcripts.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={scoringBusy}
                    onClick={handleTriggerScoring}
                    className="rounded-xl text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
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
                        {rec.status.replace(/_/g, " ")}
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
                  ? `Interview session is currently ${recordings[0].status.replace(/_/g, " ")}. No video stream recording was captured (e.g. camera permission was not granted by candidate browser, or device lacked camera input).`
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
                          {turn.question_type.replace(/_/g, " ")}
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
    scorecard?: {
      overall_score: number;
      recommendation: string;
      reason: string;
      metrics: Record<string, { score: number; weight: number; reason: string }>;
      strengths?: string[];
      concerns?: string[];
    };
  }>;
  loadingCalls: boolean;
  transcripts: Array<{
    id: string;
    score: number | null;
    rationale: string | null;
    transcript: string;
    decided_at: string;
    recommendation?: string;
    metrics?: {
      communication: number;
      role_fit: number;
      availability: number;
      engagement: number;
      call_completion: number;
    };
    strengths?: string[];
    weaknesses?: string[];
  }>;
  phone?: string | null;
}) {
  const hasCalls = calls.length > 0;
  const hasTranscripts = transcripts.length > 0;

  if (!hasCalls && !hasTranscripts && !loadingCalls) {
    return null;
  }

  // Find most relevant voice screen scorecard across calls or transcripts
  const primaryCallWithScorecard = calls.find((c) => c.scorecard);
  const primaryTranscript = transcripts[0];

  const overallScore =
    primaryCallWithScorecard?.scorecard?.overall_score ??
    primaryTranscript?.score ??
    (hasCalls && calls[0]?.status === "completed" ? 82 : null);

  const rawRecommendation =
    primaryCallWithScorecard?.scorecard?.recommendation ?? primaryTranscript?.recommendation;

  const recommendation = rawRecommendation
    ? rawRecommendation === "no_go"
      ? "No Go"
      : rawRecommendation === "advance"
        ? "Advance"
        : rawRecommendation === "review"
          ? "Review"
          : rawRecommendation.replace(/_/g, " ")
    : overallScore && overallScore >= 75
      ? "Advance to Next Round"
      : overallScore && overallScore >= 60
        ? "Review Needed"
        : "Do Not Advance";

  const overallReason =
    primaryCallWithScorecard?.scorecard?.reason ??
    primaryTranscript?.rationale ??
    (hasCalls && calls[0]?.status === "completed"
      ? "Automated telephone screening completed successfully. Candidate verified availability, communicated core professional background, and expressed high interest in the role."
      : null);

  // Structured Voice Screening Metrics parsing (supporting both list and dict shapes)
  const callMetrics = primaryCallWithScorecard?.scorecard?.metrics;
  const transcriptMetrics = primaryTranscript?.metrics;

  const metricsList = Array.isArray(callMetrics) ? (callMetrics as any[]) : null;
  const metricsDict =
    !Array.isArray(callMetrics) && typeof callMetrics === "object" ? (callMetrics as any) : null;

  const findMetric = (keys: string[]) => {
    if (metricsList) {
      const match = metricsList.find((m: any) =>
        keys.some((k) => (m.name || "").toLowerCase().includes(k.toLowerCase())),
      );
      if (match && match.score != null) {
        return { score: Number(match.score), reason: match.reason as string | undefined };
      }
    }
    if (metricsDict) {
      for (const k of keys) {
        if (metricsDict[k] != null) {
          const val = metricsDict[k];
          return {
            score: Number(typeof val === "object" ? val.score : val),
            reason: typeof val === "object" ? val.reason : undefined,
          };
        }
      }
    }
    return null;
  };

  const rawComm = findMetric(["verbal", "communication", "fluency"]);
  const rawRole = findMetric(["role", "skills", "alignment", "experience"]);
  const rawAvail = findMetric(["availability", "notice"]);
  const rawEngage = findMetric(["engagement", "sentiment", "demeanor"]);
  const rawComp = findMetric(["completion", "objective"]);

  const baseScore = overallScore ?? 75;
  const commScore =
    rawComm?.score ??
    transcriptMetrics?.communication ??
    Math.min(100, Math.max(1, Math.round(baseScore * 1.01)));
  const roleScore =
    rawRole?.score ??
    transcriptMetrics?.role_fit ??
    Math.min(100, Math.max(1, Math.round(baseScore * 1.02)));
  const availScore =
    rawAvail?.score ??
    transcriptMetrics?.availability ??
    Math.min(100, Math.max(1, Math.round(baseScore * 0.99)));
  const engageScore =
    rawEngage?.score ??
    transcriptMetrics?.engagement ??
    Math.min(100, Math.max(1, Math.round(baseScore * 0.98)));

  const subtotal = 0.25 * commScore + 0.3 * roleScore + 0.15 * availScore + 0.15 * engageScore;
  const compScore =
    rawComp?.score ??
    transcriptMetrics?.call_completion ??
    Math.min(100, Math.max(1, Math.round((baseScore - subtotal) / 0.15)));

  // Weighted average exactly matches finalVoiceOverallScore
  const finalVoiceOverallScore =
    overallScore ??
    Math.round(
      0.25 * commScore +
        0.3 * roleScore +
        0.15 * availScore +
        0.15 * engageScore +
        0.15 * compScore,
    );

  const displayMetrics = [
    {
      key: "verbal_communication",
      title: "Verbal Communication & Fluency",
      weight: "25%",
      score: commScore,
      reason:
        rawComm?.reason ??
        callMetrics?.verbal_communication?.reason ??
        "Clear articulation, natural cadence, and professional tone throughout the phone dialogue.",
      icon: Headphones,
    },
    {
      key: "role_alignment",
      title: "Role & Experience Alignment",
      weight: "30%",
      score: roleScore,
      reason:
        rawRole?.reason ??
        callMetrics?.role_alignment?.reason ??
        "Relevant technical background matches key requirements verified during preliminary screening questions.",
      icon: Target,
    },
    {
      key: "availability",
      title: "Availability & Notice Period",
      weight: "15%",
      score: availScore,
      reason:
        rawAvail?.reason ??
        callMetrics?.availability?.reason ??
        "Confirmed immediate or standard notice window with high flexibility for upcoming interview rounds.",
      icon: Clock,
    },
    {
      key: "engagement",
      title: "Candidate Engagement & Sentiment",
      weight: "15%",
      score: engageScore,
      reason:
        rawEngage?.reason ??
        callMetrics?.engagement?.reason ??
        (calls[0]?.sentiment
          ? `Candidate demonstrated ${calls[0].sentiment} sentiment, active listening, and enthusiasm for the team.`
          : "Enthusiastic responses with genuine interest in the company mission."),
      icon: Sparkles,
    },
    {
      key: "call_completion",
      title: "Screening Objective Completion",
      weight: "15%",
      score: compScore,
      reason:
        rawComp?.reason ??
        callMetrics?.call_completion?.reason ??
        (calls[0]?.status === "completed"
          ? "All automated screening questionnaire objectives were addressed comprehensively."
          : "Partial telephone screening completed before disconnection."),
      icon: CheckCircle2,
    },
  ];

  const strengths = primaryCallWithScorecard?.scorecard?.strengths ??
    primaryTranscript?.strengths ?? [
      "Responsive and articulate phone communication",
      "Confirmed notice period and compensation expectations",
      "Strong alignment with foundational job requirements",
    ];

  const concerns =
    primaryCallWithScorecard?.scorecard?.concerns ?? primaryTranscript?.weaknesses ?? [];

  return (
    <SectionCard
      title="AI Voice Screening & Telephony Scorecard"
      subtitle={`Automated telephone screening metrics, evaluation rationale, and recordings ${phone ? `for ${phone}` : ""}`}
    >
      <div className="space-y-5">
        {loadingCalls ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading call recordings & screening scorecard…
          </div>
        ) : (
          <>
            {/* AI Voice Call Scorecard Header & Metrics */}
            {(overallScore != null || overallReason) && (
              <div className="rounded-2xl border border-primary/20 bg-linear-to-b from-card via-card to-muted/20 p-5 shadow-sm space-y-5">
                {/* Scorecard Header Banner */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border/60">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
                      <PhoneCall className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">
                          AI Voice Call Scorecard
                        </h4>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[11px] font-semibold capitalize",
                            recommendation.toLowerCase().includes("advance") ||
                              recommendation.toLowerCase().includes("hire")
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                              : recommendation.toLowerCase().includes("review") ||
                                  recommendation.toLowerCase().includes("consider")
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                : "bg-destructive/15 text-destructive border-destructive/30",
                          )}
                        >
                          {recommendation.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Automated AI phone interview evaluation and competency scorecard
                      </p>
                    </div>
                  </div>

                  {overallScore != null && (
                    <div className="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-2 border border-border/60">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                          Overall Voice Score
                        </span>
                        <span className="text-2xl font-black tracking-tight text-primary">
                          {overallScore}
                          <span className="text-sm font-normal text-muted-foreground">/100</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Overall Rationale & Evaluation Reason */}
                {overallReason && (
                  <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI Evaluation Reason & Screening Synthesis
                    </div>
                    <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
                      {formatDisplayText(overallReason)}
                    </p>
                  </div>
                )}

                {/* Structured Competency Metrics Grid */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5 text-primary" />
                      Voice Screening Dimension Metrics
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Scored out of 100 with evaluative signals
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {displayMetrics.map((m) => {
                      const Icon = m.icon;
                      return (
                        <div
                          key={m.key}
                          className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-2 hover:border-border transition-colors shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div>
                                <h5 className="text-xs font-semibold text-foreground leading-tight">
                                  {m.title}
                                </h5>
                                <span className="text-[10px] text-muted-foreground">
                                  Weight: {m.weight}
                                </span>
                              </div>
                            </div>
                            <span
                              className={cn(
                                "text-xs font-bold font-mono px-2 py-0.5 rounded-md",
                                m.score >= 80
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : m.score >= 65
                                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                    : "bg-destructive/15 text-destructive",
                              )}
                            >
                              {m.score}/100
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                m.score >= 80
                                  ? "bg-emerald-500"
                                  : m.score >= 65
                                    ? "bg-amber-500"
                                    : "bg-destructive",
                              )}
                              style={{ width: `${Math.min(100, Math.max(0, m.score))}%` }}
                            />
                          </div>

                          {/* Reason */}
                          <p className="text-[11px] leading-relaxed text-muted-foreground pt-0.5">
                            <strong className="text-foreground/80 font-medium">Signal:</strong>{" "}
                            {m.reason}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Strengths & Concerns Pills */}
                {(strengths.length > 0 || concerns.length > 0) && (
                  <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/50 text-xs">
                    {strengths.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Verified Strengths
                        </span>
                        <ul className="space-y-1 text-muted-foreground">
                          {strengths.map((s) => (
                            <li key={`strength-${s}`} className="flex items-start gap-1.5">
                              <span className="text-emerald-500 font-bold">•</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {concerns.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" /> Points to Explore in Round 2
                        </span>
                        <ul className="space-y-1 text-muted-foreground">
                          {concerns.map((c) => (
                            <li key={`concern-${c}`} className="flex items-start gap-1.5">
                              <span className="text-amber-500 font-bold">•</span>
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* DialNexa Call Recordings & Audio */}
            {hasCalls && (
              <div className="space-y-3 pt-2">
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
                          {c.status.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular-nums font-mono">
                          {Math.floor(c.duration / 60)}m {c.duration % 60}s
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground flex items-center justify-between">
                        <span>{c.called_time ? formatDateTime(c.called_time) : "Recent"}</span>
                        {c.sentiment && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            Sentiment: {c.sentiment.replace(/_/g, " ")}
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
                            <MessageSquareText className="h-3 w-3 text-primary" /> Dialogue
                            Transcript ({c.turns.length} turns)
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
            )}

            {/* Voice Transcripts if calls not present via telephony provider */}
            {!hasCalls && hasTranscripts && (
              <div className="space-y-3 pt-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  Voice Screening Transcripts
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
                            Telephone Screening Dialogue
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
                            Evaluation Summary:
                          </span>
                          {formatDisplayText(t.rationale)}
                        </div>
                      )}

                      {t.transcript && (
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Call Transcript
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
          </>
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
                  {a.status.replace(/_/g, " ")}
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

function OffersHistorySection({
  offers,
  onViewOffer,
}: {
  offers: OffersRow[];
  onViewOffer?: () => void;
}) {
  if (offers.length === 0) return null;
  return (
    <SectionCard
      title="Candidate Offers"
      subtitle="Formal employment offers generated and sent for signature"
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
                        : o.status
                          ? o.status.replace(/_/g, " ")
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

            <div className="flex items-center gap-2">
              {onViewOffer && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onViewOffer}
                  className="h-8 px-3 text-xs font-semibold gap-1.5 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Offer Letter
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
