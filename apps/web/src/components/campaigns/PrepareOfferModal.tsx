"use client";

import type { CampaignsRow } from "@scalepods/core";
import {
  AlertCircle,
  CheckCircle2,
  FileSignature,
  Loader2,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { accessToken as getAccessToken } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ViewCandidate } from "@/features/campaigns/api";

export interface PrepareOfferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: ViewCandidate | null;
  campaign: CampaignsRow;
  recruiterEmail: string;
  accessToken?: string;
  onComplete: () => void;
}

const STANDARD_FORM_KEYS = new Set([
  "POSITION_TITLE",
  "ROLE",
  "SALARY",
  "COMPENSATION",
  "CURRENCY",
  "START_DATE",
  "JOINING_DATE",
  "SPECIAL_TERMS",
  "TERMS",
  "CANDIDATE_NAME",
  "RECIPIENT_NAME",
  "COMPANY_NAME",
  "COMPANY_WEBSITE",
  "COMPANY_EMAIL",
  "REF_NO",
  "ISSUE_DATE",
  "VARIABLE",
  "COMPANY_LOGO_PATH",
]);

function formatVarLabel(key: string): string {
  const clean = key.replace(/^\{\{|\}\}$/g, "").trim();
  const ACRONYMS: Record<string, string> = {
    HRA: "HRA",
    CTC: "CTC",
    NDA: "NDA",
    AI: "AI",
    ID: "ID",
    USD: "USD",
    INR: "INR",
  };
  return clean
    .split("_")
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS[upper]) return ACRONYMS[upper];
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function PrepareOfferModal({
  open,
  onOpenChange,
  candidate,
  campaign,
  recruiterEmail,
  accessToken,
  onComplete,
}: PrepareOfferModalProps) {
  const [positionTitle, setPositionTitle] = useState(campaign.name || "");
  const [salary, setSalary] = useState(campaign.salary_min ? String(campaign.salary_min) : "");
  const [currency, setCurrency] = useState(campaign.salary_currency || "USD");
  const [startDate, setStartDate] = useState(() => {
    // Default to 14 days in the future
    return new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
  });
  const [specialTerms, setSpecialTerms] = useState("");
  const [sending, setSending] = useState(false);
  const [capacityWarning, setCapacityWarning] = useState<string | null>(null);

  // Extract template info
  const campaignTemplate = (
    campaign.cadence_config as {
      offer_template?: {
        file_name?: string;
        text?: string;
        variables?: string[];
      };
    } | null
  )?.offer_template;

  // Resolve template variables
  const initialVariables = useMemo(() => {
    const list: string[] = [];
    if (campaignTemplate?.variables && campaignTemplate.variables.length > 0) {
      list.push(...campaignTemplate.variables);
    } else if (campaignTemplate?.text) {
      const matches = campaignTemplate.text.match(/\{\{([A-Za-z0-9_]+)\}\}/g) || [];
      for (const m of matches) {
        list.push(m.replace(/[{}]/g, "").trim().toUpperCase());
      }
    } else {
      // Default common offer variables
      list.push("DEPARTMENT", "LOCATION", "DURATION", "PROBATION_PERIOD");
    }

    // Filter out standard keys that have their own inputs
    const unique = Array.from(new Set(list)).filter(
      (k) => !STANDARD_FORM_KEYS.has(k.toUpperCase()),
    );
    return unique;
  }, [campaignTemplate]);

  const [activeVariables, setActiveVariables] = useState<string[]>(initialVariables);
  const [newVarName, setNewVarName] = useState("");
  const [showAddVar, setShowAddVar] = useState(false);

  // State to hold dynamic variable values filled by the recruiter
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>(() => {
    const isIntern = (campaign.name || "").toLowerCase().includes("intern");
    const defaults: Record<string, string> = {
      DEPARTMENT: "AI & Automation",
      LOCATION: campaign.location || "Remote",
      DURATION: isIntern ? "6 Months" : "Full-time",
      PROBATION_PERIOD: "3 Months",
      WORKING_DAYS: "Mon - Fri (5 Days/Wk)",
      REPORTING_MANAGER: "Engineering Lead",
      SIGNATORY_NAME: "Manish",
      SIGNATORY_TITLE: "Head of Talent Acquisition",
    };
    return defaults;
  });

  if (!candidate || !candidate.application_id) return null;

  const handleSendOffer = async () => {
    if (!positionTitle.trim()) {
      showErrorToast("Position title is required.");
      return;
    }
    if (!salary.trim()) {
      showErrorToast("Compensation amount is required.");
      return;
    }

    // Strictly ensure target start date / joining date is not in the past
    const today = new Date().toISOString().split("T")[0];
    if (!startDate || startDate < today) {
      showErrorToast(
        "Target start / joining date cannot be in the past. Please select today or a future date.",
      );
      return;
    }

    setSending(true);
    setCapacityWarning(null);

    try {
      const token = accessToken || (await getAccessToken());
      const res = await fetch("/api/offers/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          campaign_id: campaign.id,
          application_id: candidate.application_id,
          field_values: {
            position_title: positionTitle,
            salary,
            currency,
            start_date: startDate,
            special_terms: specialTerms,
            dynamic_variables: dynamicValues,
            ...dynamicValues,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send offer letter");
      }

      if (data.overCapacityWarning) {
        showToast(
          `Offer sent! Notice: Job capacity reached (${data.offersSent} of ${data.openings} openings filled).`,
        );
      } else {
        showToast(
          `Offer letter & agreement generated and emailed directly to ${candidate.name || candidate.email}!`,
        );
      }

      onOpenChange(false);
      onComplete();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setSending(false);
    }
  };

  const handleAddCustomVar = () => {
    const clean = newVarName.trim().toUpperCase().replace(/[{}]/g, "").replace(/\s+/g, "_");
    if (!clean) return;
    if (!activeVariables.includes(clean)) {
      setActiveVariables((prev) => [...prev, clean]);
    }
    setNewVarName("");
    setShowAddVar(false);
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Generate & Send Offer Letter
          </DialogTitle>
          <DialogDescription>
            Generate an official employment offer and agreement. Fill in the template variables
            below; ScalePods automatically replaces dynamic values and delivers the official
            agreement directly to the candidate via email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {campaignTemplate?.file_name ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 p-2.5 text-xs text-primary">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Using Campaign Template: <strong>{campaignTemplate.file_name}</strong> (AI variable
                fill active)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <FileSignature className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                Using Standard Agreement Template. AI will automatically structure candidate terms.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
            <div>
              <span className="text-muted-foreground block">Sender (Company / Recruiter):</span>
              <span className="font-semibold text-foreground truncate block">{recruiterEmail}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Candidate Recipient:</span>
              <span className="font-semibold text-foreground truncate block">
                {candidate.email}
              </span>
            </div>
          </div>

          {/* Standard Offer Details */}
          <div className="space-y-1.5">
            <Label htmlFor="position" className="text-xs">
              Position Title
            </Label>
            <Input
              id="position"
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="salary" className="text-xs">
                Compensation Amount
              </Label>
              <Input
                id="salary"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g. 140,000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency" className="text-xs">
                Currency
              </Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent className="border-border bg-card z-[60]">
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="INR">INR (₹)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="CAD">CAD ($)</SelectItem>
                  <SelectItem value="AUD">AUD ($)</SelectItem>
                  <SelectItem value="SGD">SGD (S$)</SelectItem>
                  <SelectItem value="AED">AED (د.إ)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Target Start Date / Joining Date with React DatePicker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="start-date" className="text-xs">
                Target Start Date (Joining Date)
              </Label>
              <span className="text-[11px] text-muted-foreground">Cannot be in the past</span>
            </div>
            <DatePicker
              id="start-date"
              value={startDate}
              onChange={(val) => {
                if (val && val < todayStr) {
                  showErrorToast("Joining date cannot be in the past.");
                  return;
                }
                setStartDate(val);
              }}
              minDate={new Date()}
              placeholder="Select target start date"
              className="w-full"
            />
          </div>

          {/* Dynamic Offer Letter Variables to Fill */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  Dynamic Offer Letter Variables
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-primary hover:text-primary"
                onClick={() => setShowAddVar(!showAddVar)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Variable
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              These dynamic variables will be merged into the official offer document before
              delivery.
            </p>

            {showAddVar && (
              <div className="flex items-center gap-2 pt-1 border-t border-primary/15">
                <Input
                  value={newVarName}
                  onChange={(e) => setNewVarName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomVar();
                    }
                  }}
                  placeholder="e.g. REPORTING_MANAGER"
                  className="h-7 text-xs font-mono"
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={handleAddCustomVar}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setShowAddVar(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 max-h-80 overflow-y-auto pr-1">
              {activeVariables.map((vKey) => (
                <div
                  key={vKey}
                  className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2.5 transition-colors hover:border-border"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <Label
                      htmlFor={`var-${vKey}`}
                      className="text-xs font-semibold text-foreground whitespace-normal break-words leading-tight"
                    >
                      {formatVarLabel(vKey)}
                    </Label>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground font-mono bg-muted/70 border border-border/40 px-1.5 py-0.5 rounded">
                        {`{{${vKey}}}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveVariables((prev) => prev.filter((k) => k !== vKey));
                          setDynamicValues((prev) => {
                            const copy = { ...prev };
                            delete copy[vKey];
                            return copy;
                          });
                        }}
                        className="text-muted-foreground/60 hover:text-destructive transition-colors p-0.5"
                        title={`Remove ${vKey}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <Input
                    id={`var-${vKey}`}
                    value={dynamicValues[vKey] ?? ""}
                    onChange={(e) =>
                      setDynamicValues((prev) => ({ ...prev, [vKey]: e.target.value }))
                    }
                    placeholder={`e.g. ${formatVarLabel(vKey)}`}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="terms" className="text-xs">
              Additional Offer Terms / Notes (Optional)
            </Label>
            <Textarea
              id="terms"
              rows={2}
              value={specialTerms}
              onChange={(e) => setSpecialTerms(e.target.value)}
              placeholder="Sign-on bonus, equity schedule, or reporting structure..."
            />
          </div>

          {capacityWarning && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{capacityWarning}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" disabled={sending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSendOffer} disabled={sending} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Generating & Emailing Offer..." : "Generate & Email Offer Letter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
