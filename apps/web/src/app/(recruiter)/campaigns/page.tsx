"use client";

import { formatDateTime, TIER_LIMITS } from "@scalepods/core";
import {
  Brain,
  Calendar,
  CheckCircle2,
  FolderKanban,
  GitBranch,
  Grid,
  Layers,
  List as ListIcon,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CampaignCreateWizard } from "@/components/campaigns/CampaignCreateWizard";
import { EmptyState } from "@/components/shared/EmptyState";
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
import {
  type CampaignListItem,
  deleteCampaign,
  updateCampaignStatus,
} from "@/features/campaigns/api";
import { useCampaigns } from "@/features/campaigns/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function CampaignsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab =
    searchParams.get("tab") === "new" || searchParams.get("create") === "true" ? "new" : "list";
  const [activeTab, setActiveTab] = useState<"list" | "new">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: campaigns, isPending, refetch, isRefetching } = useCampaigns();
  const { account } = useAccount();

  const rows = campaigns ?? [];

  const activeCount = rows.filter((c) => c.status === "on").length;
  const pausedCount = rows.filter((c) => c.status !== "on").length;

  const tier = account?.tier ?? "free";
  const tierConfig = TIER_LIMITS[tier];

  const checkCampaignLimit = (): boolean => {
    const limit = tierConfig.activeCampaigns;
    if (limit === null) return true;
    if (activeCount < limit) return true;
    if (tierConfig.overageBehavior === "metered") {
      showToast(`Over your included ${limit} active campaigns - extra usage will be billed.`, {
        kind: "warning",
      });
      return true;
    }
    showErrorToast(
      `Your ${tierConfig.label} plan allows up to ${limit} active campaigns. Please pause an existing campaign or upgrade your plan.`,
    );
    return false;
  };

  const handleNewCampaign = () => {
    if (checkCampaignLimit()) {
      setActiveTab("new");
    }
  };

  useEffect(() => {
    if (initialTab === "new" && !isPending && activeTab === "list") {
      if (checkCampaignLimit()) {
        setActiveTab("new");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, isPending]);

  const filtered = useMemo(() => {
    return rows.filter((c) => {
      const matchesSearch =
        !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.jd_text && c.jd_text.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && c.status === "on") ||
        (statusFilter === "paused" && c.status !== "on");

      return matchesSearch && matchesStatus;
    });
  }, [rows, searchQuery, statusFilter]);

  const handleToggleStatus = async (
    e: React.MouseEvent | undefined,
    campaignId: string,
    currentStatus: string,
  ) => {
    e?.stopPropagation();
    const newStatus = currentStatus === "on" ? "paused" : "on";
    if (newStatus === "on" && !checkCampaignLimit()) return;
    setTogglingId(campaignId);
    try {
      const token = supabaseBrowser()
        ? (await supabaseBrowser().auth.getSession()).data.session?.access_token
        : undefined;
      await updateCampaignStatus(campaignId, newStatus, account?.id, token);
      showToast(`Campaign ${newStatus === "on" ? "activated" : "deactivated"}`, {
        kind: "success",
      });
      await refetch();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteCampaign = async () => {
    if (!campaignToDelete) return;
    setIsDeleting(true);
    try {
      const token = supabaseBrowser()
        ? (await supabaseBrowser().auth.getSession()).data.session?.access_token
        : undefined;
      await deleteCampaign(campaignToDelete.id, account?.id, token);
      showToast("Campaign deleted successfully", { kind: "success" });
      setCampaignToDelete(null);
      await refetch();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Tab Bar: Merged Campaigns & New Campaign */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-2 rounded-full bg-accent/60 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
              activeTab === "list"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span>All Campaigns</span>
            {rows.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.2 text-[10px] font-bold text-primary">
                {rows.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleNewCampaign}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
              activeTab === "new"
                ? "bg-primary text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Campaign</span>
          </button>
        </div>

        {activeTab === "list" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="h-8 gap-1.5 rounded-full text-xs"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={handleNewCampaign}
              className="h-8 gap-1.5 rounded-full text-xs shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Campaign</span>
            </Button>
          </div>
        )}
      </div>

      {activeTab === "new" ? (
        <CampaignCreateWizard
          onCancel={() => setActiveTab("list")}
          onSuccess={() => {
            refetch();
            setActiveTab("list");
          }}
        />
      ) : (
        <>
          {/* Header & Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Hiring Campaigns
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage and track all your active and past hiring initiatives
              </p>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px]">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search campaigns..."
                  className="h-9 rounded-full pl-8 text-xs"
                />
              </div>

              {/* Status filter pills */}
              <div className="flex items-center rounded-full bg-accent/60 p-0.5 text-xs">
                {(["all", "active", "paused"] as const).map((sf) => (
                  <button
                    key={sf}
                    type="button"
                    onClick={() => setStatusFilter(sf)}
                    className={cn(
                      "rounded-full px-3 py-1 font-medium capitalize transition-all",
                      statusFilter === sf
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {sf === "all"
                      ? `All (${rows.length})`
                      : sf === "active"
                        ? `Active (${activeCount})`
                        : `Paused (${pausedCount})`}
                  </button>
                ))}
              </div>

              {/* Grid / Table toggle */}
              <div className="flex items-center rounded-full bg-accent/60 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Grid view"
                  className={cn(
                    "rounded-full p-1.5 transition-all",
                    viewMode === "grid"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Grid className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  aria-label="Table view"
                  className={cn(
                    "rounded-full p-1.5 transition-all",
                    viewMode === "table"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ListIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Campaigns status summary banner */}
          <div className="flex items-center justify-between border-y border-border/70 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-success" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Campaigns
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground">
                {activeCount} active · {pausedCount} paused · {rows.length} total
              </span>
            </div>
          </div>

          {/* Campaigns Content */}
          {isPending ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-56 rounded-2xl border border-border p-5">
                  <Skeleton className="mb-4 h-5 w-24" />
                  <Skeleton className="mb-2 h-6 w-3/4" />
                  <Skeleton className="mb-6 h-4 w-1/2" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-6 w-6" aria-hidden />}
              title={
                searchQuery || statusFilter !== "all" ? "No matching campaigns" : "No campaigns yet"
              }
              hint={
                searchQuery || statusFilter !== "all"
                  ? "Try changing your search term or status filter."
                  : "Create your first campaign to start screening candidates with AI workflows."
              }
              action={
                <Button onClick={handleNewCampaign} className="gap-1.5 rounded-full">
                  <Plus className="h-4 w-4" />
                  Create campaign
                </Button>
              }
            />
          ) : viewMode === "grid" ? (
            /* Reference-Matched Campaign Cards Grid */
            <div className="campaigns-grid">
              {filtered.map((c) => {
                const isActive = c.status === "on";
                return (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/campaigns/${c.id}`)}
                    className="campaign-card cursor-pointer group"
                  >
                    {/* Top gradient bar */}
                    <div
                      className="campaign-topbar"
                      style={{
                        background: isActive
                          ? "linear-gradient(90deg, #10b981, #34d399)"
                          : "linear-gradient(90deg, #64748b, #94a3b8)",
                      }}
                    />

                    <div className="campaign-body">
                      {/* Status header with status indicator on left and active/deactive switch on top right */}
                      <div className="campaign-status flex items-center justify-between">
                        <span
                          className={cn(
                            "status-pill",
                            isActive ? "active" : "text-muted-foreground",
                          )}
                        >
                          <span
                            className="status-dot"
                            style={{ background: isActive ? "#10b981" : "#64748b" }}
                          />
                          {isActive ? "Active" : "Paused"}
                        </span>

                        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={isActive}
                            onCheckedChange={() => handleToggleStatus(undefined, c.id, c.status)}
                            disabled={togglingId === c.id}
                            aria-label={`Toggle active state for ${c.name}`}
                          />
                        </div>
                      </div>

                      {/* Campaign Name */}
                      <h3 className="campaign-name group-hover:text-primary transition-colors">
                        {c.name}
                      </h3>

                      {/* Metadata rows */}
                      <div className="campaign-meta">
                        <span>
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          Created {formatDateTime(c.created_at).split(",")[0]}
                        </span>
                        <span>
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          Remote / Multi-location
                        </span>
                        <span>
                          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <strong className="text-foreground">{c.candidates}</strong> candidates in
                          pipeline
                        </span>
                        <span>
                          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {c.number_of_rounds} interview{" "}
                          {c.number_of_rounds === 1 ? "round" : "rounds"}
                        </span>
                      </div>

                      {/* Campaign actions */}
                      <div className="campaign-actions flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="flex-1 justify-center gap-1.5 rounded-xl text-xs font-semibold"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/campaigns/${c.id}`}>
                            <span>View Pipeline & Analytics</span>
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 px-2.5 rounded-xl text-xs font-semibold border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                          title="Delete campaign"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCampaignToDelete(c);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="rounded-2xl border border-border bg-card p-2 shadow-xs">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Rounds</TableHead>
                    <TableHead className="text-right">Candidates</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow
                      key={c.id}
                      onClick={() => router.push(`/campaigns/${c.id}`)}
                      className="cursor-pointer"
                    >
                      <TableCell className="max-w-xs font-medium">
                        <div className="text-foreground hover:text-primary">{c.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.jd_text?.slice(0, 80) || "No JD text"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Badge
                            className={cn(
                              c.status === "on"
                                ? "bg-success/15 text-success"
                                : "bg-fill-tertiary text-muted-foreground",
                            )}
                          >
                            {c.status === "on" ? "Active" : "Paused"}
                          </Badge>
                          <Switch
                            checked={c.status === "on"}
                            onCheckedChange={() => handleToggleStatus(undefined, c.id, c.status)}
                            disabled={togglingId === c.id}
                            aria-label={`Toggle active state for ${c.name}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {c.number_of_rounds}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-foreground">
                        {c.candidates}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(c.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-8 rounded-lg text-xs"
                          >
                            <Link href={`/campaigns/${c.id}`}>Open</Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                            title="Delete campaign"
                            onClick={() => setCampaignToDelete(c)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Reference Platform Capabilities Section */}
          <div className="pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                Platform Capabilities
              </h2>
            </div>

            <div className="capabilities-grid">
              <div className="cap-card">
                <div
                  className="cap-icon"
                  style={{ background: "rgba(37, 99, 235, 0.1)", color: "#2563eb" }}
                >
                  <Upload className="h-5 w-5" />
                </div>
                <div className="cap-title">Bulk Resume Upload</div>
                <div className="cap-desc">
                  Upload multiple resumes in ZIP format for automated parsing and screening.
                </div>
              </div>

              <div className="cap-card">
                <div
                  className="cap-icon"
                  style={{ background: "rgba(6, 182, 212, 0.1)", color: "#06b6d4" }}
                >
                  <Brain className="h-5 w-5" />
                </div>
                <div className="cap-title">AI-Powered Analysis</div>
                <div className="cap-desc">
                  Intelligent analysis of candidate strengths, skill gaps, and role fit scores.
                </div>
              </div>

              <div className="cap-card">
                <div
                  className="cap-icon"
                  style={{ background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6" }}
                >
                  <Layers className="h-5 w-5" />
                </div>
                <div className="cap-title">Smart Scoring System</div>
                <div className="cap-desc">
                  Automated candidate scoring benchmarked against customized qualification rubrics.
                </div>
              </div>

              <div className="cap-card">
                <div
                  className="cap-icon"
                  style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}
                >
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="cap-title">Multi-Round Tracking</div>
                <div className="cap-desc">
                  Track candidates smoothly across assignment, AI, and human interviewer rounds.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <AlertDialog
        open={Boolean(campaignToDelete)}
        onOpenChange={(open) => !open && setCampaignToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{campaignToDelete?.name}&rdquo;? This action
              cannot be undone. All candidates, interview rounds, and evaluation scorecards for this
              campaign will be permanently removed.
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

export default function CampaignsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <CampaignsContent />
    </Suspense>
  );
}
