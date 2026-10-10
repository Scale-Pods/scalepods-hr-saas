"use client";

import type { CampaignRoundsRow, CampaignsRow } from "@scalepods/core";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileSignature,
  FileText,
  Filter,
  HelpCircle,
  LayoutGrid,
  List,
  Loader2,
  Mic,
  MoreVertical,
  Pause,
  Phone,
  Play,
  RotateCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  User,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { decideApplication, type ViewCandidate } from "@/features/campaigns/api";
import { cn } from "@/lib/utils";
import { PrepareOfferModal } from "./PrepareOfferModal";

const PREDEFINED_REJECTION_REASONS = [
  "Skills mismatch with job requirements",
  "Experience level below role expectations",
  "Compensation expectation misaligned",
  "Assessment score below required standard",
  "Interviewer feedback decision",
  "Interview no-show",
  "Other",
];

export interface PipelineBoardProps {
  campaign: CampaignsRow;
  rounds: CampaignRoundsRow[];
  candidates: ViewCandidate[];
  recruiterEmail: string;
  accessToken?: string;
  onRefresh: () => void;
}

export function PipelineBoard({
  campaign,
  rounds,
  candidates,
  recruiterEmail,
  accessToken,
  onRefresh,
}: PipelineBoardProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [filterTab, setFilterTab] = useState<"active" | "on_hold" | "rejected" | "all">("active");
  const [searchQuery, setSearchQuery] = useState("");

  // Rejection confirmation dialog state
  const [rejectingCandidate, setRejectingCandidate] = useState<ViewCandidate | null>(null);
  const [selectedReason, setSelectedReason] = useState(PREDEFINED_REJECTION_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // Offer modal state
  const [offerCandidate, setOfferCandidate] = useState<ViewCandidate | null>(null);

  // Busy state per candidate
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const isJobClosed = campaign.status === "closed" || campaign.status === "off";

  // Filter candidates by tab and search
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      const matchesSearch =
        !searchQuery.trim() ||
        (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterTab === "active") {
        return c.status !== "rejected" && c.status !== "on_hold";
      }
      if (filterTab === "on_hold") {
        return c.status === "on_hold";
      }
      if (filterTab === "rejected") {
        return c.status === "rejected";
      }
      return true;
    });
  }, [candidates, filterTab, searchQuery]);

  // Define Kanban columns
  const columns = useMemo(() => {
    const cols = [
      {
        id: "needs_review",
        title: "Resume Screening",
        description: "AI score against the job description; recruiter decides",
        stage: "needs_review",
        roundNumber: null as number | null,
      },
    ];

    const sortedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number);
    for (const r of sortedRounds) {
      const typeLabel =
        r.round_type === "ai_interview"
          ? "AI Video Interview"
          : r.round_type === "human_interview"
            ? "Human Interview"
            : r.round_type === "assignment"
              ? "Take-Home Assignment"
              : "AI Voice Call";

      cols.push({
        id: `round_${r.round_number}`,
        title: `Round ${r.round_number}`,
        description: typeLabel,
        stage: "round",
        roundNumber: r.round_number,
      });
    }

    cols.push({
      id: "offer",
      title: "Offers",
      description: "Ready & dispatched agreements",
      stage: "offer",
      roundNumber: null,
    });

    return cols;
  }, [rounds]);

  // Group candidates into columns
  const candidatesByColumn = useMemo(() => {
    const map: Record<string, ViewCandidate[]> = {};
    for (const col of columns) {
      map[col.id] = [];
    }

    for (const cand of filteredCandidates) {
      if (cand.status === "rejected" || cand.status === "on_hold") {
        // Still place in column according to their underlying stage
      }

      if (
        cand.current_stage === "needs_review" ||
        cand.current_stage === "Resume Screening" ||
        !cand.current_stage
      ) {
        if (map["needs_review"]) map["needs_review"].push(cand);
      } else if (
        cand.current_stage === "offer" ||
        cand.status === "offer_ready" ||
        cand.status === "offer_sent"
      ) {
        if (map["offer"]) map["offer"].push(cand);
      } else {
        const roundNum = cand.current_round_number || cand.round_number || 1;
        const colId = `round_${roundNum}`;
        if (map[colId]) {
          map[colId].push(cand);
        } else {
          // fallback to first round
          if (map["round_1"]) map["round_1"].push(cand);
          else if (map["needs_review"]) map["needs_review"].push(cand);
        }
      }
    }
    return map;
  }, [filteredCandidates, columns]);

  // Action handlers
  const handleAdvance = async (cand: ViewCandidate) => {
    if (!cand.application_id) {
      showErrorToast("Cannot advance legacy record without application entity.");
      return;
    }
    if (isJobClosed) {
      showErrorToast("This job is closed. Reopen the job to take hiring actions.");
      return;
    }

    setActionBusyId(cand.application_id);
    try {
      await decideApplication({
        applicationId: cand.application_id,
        action: "advance",
      });
      showToast(`Advanced ${cand.name || cand.email} to next stage.`);
      onRefresh();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleHoldToggle = async (cand: ViewCandidate) => {
    if (!cand.application_id) return;
    if (isJobClosed) {
      showErrorToast("This job is closed. Reopen the job to take hiring actions.");
      return;
    }

    const action = cand.status === "on_hold" ? "resume" : "hold";
    setActionBusyId(cand.application_id);
    try {
      await decideApplication({
        applicationId: cand.application_id,
        action,
      });
      showToast(
        action === "hold"
          ? `Placed ${cand.name || cand.email} on hold.`
          : `Resumed hiring for ${cand.name || cand.email}.`,
      );
      onRefresh();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setActionBusyId(null);
    }
  };

  const confirmRejection = async () => {
    if (!rejectingCandidate?.application_id) return;
    setIsRejecting(true);
    const reason =
      selectedReason === "Other" ? customReason.trim() || "Unspecified" : selectedReason;

    try {
      await decideApplication({
        applicationId: rejectingCandidate.application_id,
        action: "reject",
        rejectionReason: reason,
      });
      showToast(`Application for ${rejectingCandidate.name || rejectingCandidate.email} rejected.`);
      setRejectingCandidate(null);
      onRefresh();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Tabs */}
          <div className="inline-flex rounded-lg border border-border/80 bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setFilterTab("active")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                filterTab === "active"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Active Pipeline (
              {candidates.filter((c) => c.status !== "rejected" && c.status !== "on_hold").length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("on_hold")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                filterTab === "on_hold"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              On Hold ({candidates.filter((c) => c.status === "on_hold").length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("rejected")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                filterTab === "rejected"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Rejected ({candidates.filter((c) => c.status === "rejected").length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                filterTab === "all"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All ({candidates.length})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search candidate name or email..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="inline-flex rounded-lg border border-border/80 bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              title="Kanban Board View (Default)"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                viewMode === "kanban"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              title="Table View"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                viewMode === "table"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {isJobClosed && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong>Closed Job Notice:</strong> Hiring actions (advance, hold, reject, and offers)
            are frozen while this job is closed. Reopen the job above to make decisions.
          </span>
        </div>
      )}

      {/* Kanban Board View */}
      {viewMode === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4 pt-1">
          {columns.map((col) => {
            const colCandidates = candidatesByColumn[col.id] || [];
            return (
              <div
                key={col.id}
                className="flex flex-col w-72 shrink-0 rounded-2xl border border-border/70 bg-muted/15 shadow-2xs overflow-hidden"
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-border/60 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground tracking-tight">
                      {col.title}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-mono font-semibold h-5 px-1.5"
                    >
                      {colCandidates.length}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {col.description}
                  </p>
                </div>

                {/* Column Cards Container */}
                <div className="p-2.5 space-y-2.5 flex-1 min-h-[400px] overflow-y-auto max-h-[calc(100vh-320px)]">
                  {colCandidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 rounded-xl border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground">
                      <span>No candidates in stage</span>
                    </div>
                  ) : (
                    colCandidates.map((cand) => {
                      const isBusy = actionBusyId === cand.application_id;
                      const isOfferStage = col.stage === "offer";
                      const isOfferSent = cand.status === "offer_sent";

                      return (
                        <div
                          key={cand.application_id || cand.candidate_id}
                          className={cn(
                            "group rounded-xl border p-3.5 transition-all shadow-xs",
                            cand.status === "on_hold"
                              ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10"
                              : cand.status === "rejected"
                                ? "border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/10 opacity-75"
                                : "border-border/80 bg-card hover:border-primary/40 hover:shadow-sm",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/candidates/${cand.candidate_id}?campaignId=${campaign.id}`}
                                className="font-semibold text-xs text-foreground hover:text-primary transition-colors block truncate"
                              >
                                {cand.name || "Unnamed Candidate"}
                              </Link>
                              <span className="text-[11px] text-muted-foreground truncate block">
                                {cand.email}
                              </span>
                            </div>

                            {/* Unified 1-100 Score Pill */}
                            {cand.latest_score != null ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-mono font-bold shrink-0",
                                  cand.latest_score >= 70
                                    ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10 dark:text-emerald-400"
                                    : cand.latest_score >= 50
                                      ? "border-amber-500/30 text-amber-600 bg-amber-500/10 dark:text-amber-400"
                                      : "border-rose-500/30 text-rose-600 bg-rose-500/10 dark:text-rose-400",
                                )}
                              >
                                {cand.latest_score}/100
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                                unscored
                              </span>
                            )}
                          </div>

                          {cand.current_stage === "Resume Screening" && cand.score_rationale && (
                            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                              {cand.score_rationale}
                            </p>
                          )}

                          {/* Status and Reason */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {cand.status === "on_hold" && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 text-amber-600 bg-amber-500/10 text-[10px] gap-1 px-1.5 py-0"
                              >
                                <Pause className="h-2.5 w-2.5" />
                                On Hold
                              </Badge>
                            )}
                            {cand.status === "rejected" && (
                              <Badge
                                variant="outline"
                                className="border-rose-500/40 text-rose-600 bg-rose-500/10 text-[10px] gap-1 px-1.5 py-0"
                              >
                                <XCircle className="h-2.5 w-2.5" />
                                Rejected
                              </Badge>
                            )}
                            {cand.status === "incomplete" && (
                              <Badge
                                variant="outline"
                                className="border-purple-500/40 text-purple-600 bg-purple-500/10 text-[10px] gap-1 px-1.5 py-0"
                              >
                                <HelpCircle className="h-2.5 w-2.5" />
                                Incomplete
                              </Badge>
                            )}
                            {isOfferSent && (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10 text-[10px] gap-1 px-1.5 py-0"
                              >
                                <FileSignature className="h-2.5 w-2.5" />
                                Offer Sent
                              </Badge>
                            )}
                            {cand.decision === "no_show" && (
                              <Badge
                                variant="outline"
                                className="border-rose-500/40 text-rose-600 bg-rose-500/10 text-[10px] gap-1 px-1.5 py-0"
                              >
                                No-Show Reported
                              </Badge>
                            )}
                          </div>

                          {cand.rejection_reason && (
                            <p className="mt-1.5 text-[10px] text-rose-500 italic truncate">
                              Reason: {cand.rejection_reason}
                            </p>
                          )}

                          {/* Action Buttons Row */}
                          <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between gap-1.5">
                            <Link
                              href={`/candidates/${cand.candidate_id}?campaignId=${campaign.id}`}
                              className="text-[11px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </Link>

                            <div className="flex items-center gap-1">
                              {/* Hold/Resume Button */}
                              {cand.status !== "rejected" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={isBusy || isJobClosed}
                                  onClick={() => handleHoldToggle(cand)}
                                  className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                                  title={
                                    cand.status === "on_hold" ? "Resume hiring" : "Put on hold"
                                  }
                                >
                                  {cand.status === "on_hold" ? (
                                    <Play className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <Pause className="h-3 w-3" />
                                  )}
                                </Button>
                              )}

                              {/* Reject Button */}
                              {cand.status !== "rejected" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={isBusy || isJobClosed}
                                  onClick={() => setRejectingCandidate(cand)}
                                  className="h-6 px-1.5 text-[10px] text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                  title="Reject candidate"
                                >
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              )}

                              {/* Advance or Offer Button */}
                              {cand.status !== "rejected" &&
                                cand.status !== "on_hold" &&
                                (isOfferStage ? (
                                  !isOfferSent ? (
                                    <Button
                                      size="sm"
                                      disabled={isBusy || isJobClosed}
                                      onClick={() => setOfferCandidate(cand)}
                                      className="h-6 px-2 text-[10px] font-semibold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      <FileSignature className="h-3 w-3" />
                                      Send Offer
                                    </Button>
                                  ) : (
                                    <span className="text-[10px] text-emerald-600 font-medium">
                                      Sent
                                    </span>
                                  )
                                ) : (
                                  <Button
                                    size="sm"
                                    disabled={isBusy || isJobClosed}
                                    onClick={() => handleAdvance(cand)}
                                    className="h-6 px-2 text-[10px] font-semibold gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                                  >
                                    {isBusy ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <ArrowRight className="h-3 w-3" />
                                    )}
                                    Advance
                                  </Button>
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-2xl border border-border/70 overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold">Candidate</TableHead>
                <TableHead className="text-xs font-semibold">Stage</TableHead>
                <TableHead className="text-xs font-semibold text-right">Latest Score</TableHead>
                <TableHead className="text-xs font-semibold text-center">Status</TableHead>
                <TableHead className="text-xs font-semibold text-right">Hiring Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCandidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                    No candidates found for this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCandidates.map((cand) => {
                  const isBusy = actionBusyId === cand.application_id;
                  const isOfferStage =
                    cand.current_stage === "offer" ||
                    cand.status === "offer_ready" ||
                    cand.status === "offer_sent";
                  const isOfferSent = cand.status === "offer_sent";

                  return (
                    <TableRow
                      key={cand.application_id || cand.candidate_id}
                      className="hover:bg-muted/15"
                    >
                      <TableCell>
                        <Link
                          href={`/candidates/${cand.candidate_id}?campaignId=${campaign.id}`}
                          className="font-medium text-xs text-foreground hover:text-primary transition-colors block"
                        >
                          {cand.name || "Unnamed"}
                        </Link>
                        <span className="text-[11px] text-muted-foreground block">
                          {cand.email}
                        </span>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {cand.current_stage || "Resume Screening"}
                      </TableCell>

                      <TableCell className="text-right tabular-nums text-xs font-mono font-bold text-foreground">
                        {cand.latest_score != null ? `${cand.latest_score}/100` : "—"}
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] capitalize font-medium px-2 py-0.5",
                            cand.status === "on_hold"
                              ? "border-amber-500/30 text-amber-600 bg-amber-500/10"
                              : cand.status === "rejected"
                                ? "border-rose-500/30 text-rose-600 bg-rose-500/10"
                                : cand.status === "offer_sent"
                                  ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                                  : "border-border text-foreground bg-muted/20",
                          )}
                        >
                          {cand.status?.replace("_", " ") || "Active"}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {cand.status !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isBusy || isJobClosed}
                              onClick={() => handleHoldToggle(cand)}
                              className="h-7 px-2 text-xs"
                            >
                              {cand.status === "on_hold" ? "Resume" : "Hold"}
                            </Button>
                          )}

                          {cand.status !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isBusy || isJobClosed}
                              onClick={() => setRejectingCandidate(cand)}
                              className="h-7 px-2 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                            >
                              Reject
                            </Button>
                          )}

                          {cand.status !== "rejected" &&
                            cand.status !== "on_hold" &&
                            (isOfferStage ? (
                              !isOfferSent && (
                                <Button
                                  size="sm"
                                  disabled={isBusy || isJobClosed}
                                  onClick={() => setOfferCandidate(cand)}
                                  className="h-7 px-2.5 text-xs font-semibold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  <FileSignature className="h-3.5 w-3.5" />
                                  Send Offer
                                </Button>
                              )
                            ) : (
                              <Button
                                size="sm"
                                disabled={isBusy || isJobClosed}
                                onClick={() => handleAdvance(cand)}
                                className="h-7 px-2.5 text-xs font-semibold gap-1"
                              >
                                {isBusy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ArrowRight className="h-3.5 w-3.5" />
                                )}
                                Advance
                              </Button>
                            ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Rejection Confirmation Modal */}
      <AlertDialog
        open={!!rejectingCandidate}
        onOpenChange={(open) => !open && setRejectingCandidate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
              <UserX className="h-5 w-5" />
              Confirm Candidate Rejection
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject{" "}
              <strong>{rejectingCandidate?.name || rejectingCandidate?.email}</strong>? This
              decision is <strong>final</strong> and cannot be undone. An official notification will
              be dispatched to the candidate.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <span className="font-semibold text-foreground block">Optional Rejection Reason:</span>
            <div className="space-y-1.5">
              {PREDEFINED_REJECTION_REASONS.map((reason) => (
                <label
                  key={reason}
                  className="flex items-center gap-2 rounded-lg border border-border/60 p-2 cursor-pointer hover:bg-muted/20"
                >
                  <input
                    type="radio"
                    name="rejection-reason"
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    className="accent-primary"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            {selectedReason === "Other" && (
              <Input
                placeholder="Enter custom rejection rationale..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="text-xs mt-2"
              />
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRejecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isRejecting}
              onClick={confirmRejection}
              className="gap-1.5"
            >
              {isRejecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {isRejecting ? "Rejecting..." : "Confirm Final Rejection"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Prepare & Send Offer Modal */}
      {offerCandidate && (
        <PrepareOfferModal
          open={!!offerCandidate}
          onOpenChange={(open) => !open && setOfferCandidate(null)}
          candidate={offerCandidate}
          campaign={campaign}
          recruiterEmail={recruiterEmail}
          accessToken={accessToken}
          onComplete={onRefresh}
        />
      )}
    </div>
  );
}
