"use client";

import {
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  Loader2,
  MapPin,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface OfferDetails {
  id?: string;
  application_id: string;
  candidate_id?: string;
  campaign_id?: string;
  candidate_name: string;
  candidate_email: string;
  position_title: string;
  salary: string;
  currency: string;
  start_date: string;
  company_name: string;
  signatory_name: string;
  signatory_title: string;
  special_terms?: string;
  dynamic_variables?: Record<string, string>;
  status: string;
  sent_at: string;
}

export interface ViewOfferLetterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: {
    application_id?: string | null;
    candidate_id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  campaignId?: string;
  initialOffer?: Partial<OfferDetails> | null;
}

function formatDate(val?: string): string {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  } catch {}
  return String(val);
}

function formatSalaryDisplay(salary: string, currency: string): string {
  const num = parseFloat(salary.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(num)) return `${currency} ${salary}`;
  const formatted = num.toLocaleString("en-IN");
  return `${currency} ${formatted}`;
}

export function ViewOfferLetterModal({
  open,
  onOpenChange,
  candidate,
  campaignId,
  initialOffer,
}: ViewOfferLetterModalProps) {
  const [offer, setOffer] = useState<OfferDetails | null>((initialOffer as OfferDetails) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "pdf">("preview");

  const applicationId = candidate?.application_id;
  const candidateId = candidate?.candidate_id;
  const candidateEmail = candidate?.email;

  useEffect(() => {
    if (!open || (!applicationId && !candidateId && !candidateEmail)) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    if (applicationId && applicationId !== "undefined") query.set("application_id", applicationId);
    if (candidateId && candidateId !== "undefined") query.set("candidate_id", candidateId);
    if (campaignId && campaignId !== "undefined") query.set("campaign_id", campaignId);
    if (candidateEmail && candidateEmail !== "undefined") query.set("email", candidateEmail);

    fetch(`/api/offers/view?${query.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to load offer letter");
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted && data.offer) {
          setOffer(data.offer);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Could not fetch offer:", err);
          setError(err instanceof Error ? err.message : "Failed to load offer details");
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, applicationId, candidateId, campaignId, candidateEmail]);

  if (!candidate) return null;

  const pdfQuery = new URLSearchParams();
  if (applicationId && applicationId !== "undefined") pdfQuery.set("application_id", applicationId);
  if (candidateId && candidateId !== "undefined") pdfQuery.set("candidate_id", candidateId);
  if (campaignId && campaignId !== "undefined") pdfQuery.set("campaign_id", campaignId);
  if (candidateEmail && candidateEmail !== "undefined") pdfQuery.set("email", candidateEmail);
  const pdfUrl = `/api/offers/pdf?${pdfQuery.toString()}`;
  const pdfDownloadUrl = `${pdfUrl}&download=true`;

  const candidateName = offer?.candidate_name || candidate.name || "Candidate";
  const positionTitle = offer?.position_title || "Open Position";
  const salary = offer?.salary || "10000";
  const currency = offer?.currency || "INR";
  const startDate = offer?.start_date || "2026-11-09";
  const companyName = offer?.company_name || "ScalePods Partner";
  const signatoryName = offer?.signatory_name || "Manish";
  const signatoryTitle = offer?.signatory_title || "Head of Talent Acquisition";
  const dynamicVars = offer?.dynamic_variables || {};

  const department = dynamicVars.DEPARTMENT || dynamicVars.department || "AI & Automation";
  const location = dynamicVars.LOCATION || dynamicVars.location || "Remote";
  const duration = dynamicVars.DURATION || dynamicVars.duration || "6 Months";
  const workingDays =
    dynamicVars.WORKING_DAYS || dynamicVars.working_days || "Mon - Fri (5 Days/Wk)";
  const probation = dynamicVars.PROBATION_PERIOD || dynamicVars.probation_period || "3 Months";
  const noticePeriod = dynamicVars.NOTICE_PERIOD || dynamicVars.notice_period || "15 Days";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl border-border shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-border/60 bg-linear-to-r from-card via-card to-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs">
                <FileSignature className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  Official Employment Offer Letter
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Offer Dispatched
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Delivered directly to {candidateName} (
                  {offer?.candidate_email || candidate.email || "candidate"})
                  {offer?.sent_at && ` on ${formatDate(offer.sent_at)}`}
                </DialogDescription>
              </div>
            </div>

            {/* View Switcher Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "preview" | "pdf")}
              className="w-auto"
            >
              <TabsList className="h-8 bg-muted/60 p-0.5 rounded-lg border border-border/50">
                <TabsTrigger
                  value="preview"
                  className="text-xs h-7 px-3 gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-xs"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Letter Preview
                </TabsTrigger>
                <TabsTrigger
                  value="pdf"
                  className="text-xs h-7 px-3 gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Official PDF Document
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-background/50">
          {loading ? (
            <div className="space-y-4 py-8">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Retrieving dispatched offer letter and employment agreement…
              </div>
              <Skeleton className="h-8 w-3/4 mx-auto" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive text-center">
              {error}
            </div>
          ) : activeTab === "preview" ? (
            /* Styled Executive Document */
            <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 space-y-6 shadow-sm font-sans">
              {/* Document Header & Letterhead */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-border/70">
                <div>
                  <h3 className="text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    {companyName}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Talent Acquisition & Global Recruitment Division
                  </p>
                </div>
                <div className="text-right text-xs space-y-1 text-muted-foreground">
                  <div>
                    <span className="font-semibold text-foreground">Date:</span>{" "}
                    {formatDate(offer?.sent_at || new Date().toISOString())}
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Ref No:</span> SP/
                    {new Date().getFullYear()}/OFFER/
                    {String(offer?.id || "9281")
                      .slice(0, 5)
                      .toUpperCase()}
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Status:</span>{" "}
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Delivered via Email
                    </span>
                  </div>
                </div>
              </div>

              {/* Recipient Address */}
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="text-foreground font-semibold text-sm">{candidateName}</div>
                <div>{offer?.candidate_email || candidate.email || "Candidate Email"}</div>
                <div>Location: {location}</div>
              </div>

              {/* Salutation & Formal Statement */}
              <div className="space-y-3 text-xs leading-relaxed text-foreground/90">
                <p className="font-semibold text-foreground">Dear {candidateName},</p>
                <p>
                  We are thrilled to extend this formal offer of employment for the position of{" "}
                  <strong className="text-primary font-bold">{positionTitle}</strong> with{" "}
                  <strong>{companyName}</strong>. Following your comprehensive interview evaluations
                  and verified competency scoring, our hiring team was deeply impressed with your
                  technical capabilities and dedication.
                </p>
              </div>

              {/* Key Employment Terms Grid */}
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-primary" /> Summary of Employment Terms
                </h4>

                <div className="grid gap-3 sm:grid-cols-2 text-xs">
                  <div className="rounded-lg bg-card p-3 border border-border/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Position Title
                    </span>
                    <span className="font-bold text-foreground text-sm">{positionTitle}</span>
                  </div>

                  <div className="rounded-lg bg-card p-3 border border-border/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Compensation / Stipend
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      {formatSalaryDisplay(salary, currency)}
                    </span>
                  </div>

                  <div className="rounded-lg bg-card p-3 border border-border/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-primary" /> Target Joining Date
                    </span>
                    <span className="font-semibold text-foreground">{formatDate(startDate)}</span>
                  </div>

                  <div className="rounded-lg bg-card p-3 border border-border/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-primary" /> Work Mode & Location
                    </span>
                    <span className="font-semibold text-foreground">{location}</span>
                  </div>

                  <div className="rounded-lg bg-card p-3 border border-border/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block flex items-center gap-1">
                      <Clock className="h-3 w-3 text-primary" /> Duration / Engagement
                    </span>
                    <span className="font-semibold text-foreground">{duration}</span>
                  </div>

                  <div className="rounded-lg bg-card p-3 border border-border/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Department / Function
                    </span>
                    <span className="font-semibold text-foreground">{department}</span>
                  </div>

                  <div className="rounded-lg bg-card p-3 border border-border/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Working Days
                    </span>
                    <span className="font-semibold text-foreground">{workingDays}</span>
                  </div>

                  <div className="rounded-lg bg-card p-3 border border-border/50 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Probation & Notice Period
                    </span>
                    <span className="font-semibold text-foreground">
                      {probation} (Notice: {noticePeriod})
                    </span>
                  </div>
                </div>
              </div>

              {/* Special Terms & Conditions if any */}
              {offer?.special_terms && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1.5 text-xs">
                  <span className="font-bold text-primary flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                    <Sparkles className="h-3.5 w-3.5" /> Special Terms & Conditions
                  </span>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {offer.special_terms}
                  </p>
                </div>
              )}

              {/* Legal & Non-Disclosure Notice */}
              <div className="text-[11px] text-muted-foreground leading-relaxed border-t border-border/60 pt-4 space-y-1">
                <p>
                  This offer of employment is contingent upon satisfactory verification of your
                  educational credentials and professional background. An agreement package
                  incorporating our proprietary confidentiality and intellectual property assignment
                  covenants has been dispatched to your email.
                </p>
              </div>

              {/* Signatory Authorization Section */}
              <div className="flex flex-wrap items-center justify-between gap-6 pt-4 border-t border-border/60">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                    Authorized Signatory
                  </span>
                  <div className="text-base font-bold font-serif italic text-primary">
                    {signatoryName}
                  </div>
                  <div className="text-xs font-semibold text-foreground">{signatoryName}</div>
                  <div className="text-[11px] text-muted-foreground">{signatoryTitle}</div>
                  <div className="text-[10px] text-muted-foreground">{companyName}</div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-right space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Digitally Dispatched
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    ScalePods Automated Offer System
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    ID: {offer?.id ? String(offer.id).slice(0, 16) : "VERIFIED"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Interactive PDF View */
            <div className="rounded-2xl border border-border/70 overflow-hidden bg-black/90 shadow-inner h-[600px] flex flex-col">
              <iframe
                src={pdfUrl}
                title="Official Branded Offer Letter PDF"
                className="w-full h-full border-0"
              />
            </div>
          )}
        </div>

        {/* Action Footer */}
        <DialogFooter className="p-4 px-6 border-t border-border/60 bg-card/60 flex flex-wrap items-center justify-between gap-3 sm:justify-between">
          <div className="flex items-center gap-2">
            <a
              href={pdfDownloadUrl}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Download Official PDF
            </a>

            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-border hover:bg-muted text-foreground transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              Open PDF in New Tab
            </a>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8 px-4"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
