"use client";

import type { CampaignsRow } from "@scalepods/core";
import { AlertCircle, CheckCircle2, FileSignature, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
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

export function PrepareOfferModal({
  open,
  onOpenChange,
  candidate,
  campaign,
  recruiterEmail,
  accessToken,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: ViewCandidate | null;
  campaign: CampaignsRow;
  recruiterEmail: string;
  accessToken?: string;
  onComplete: () => void;
}) {
  const [positionTitle, setPositionTitle] = useState(campaign.name || "");
  const [salary, setSalary] = useState(campaign.salary_min ? String(campaign.salary_min) : "");
  const [currency, setCurrency] = useState(campaign.salary_currency || "USD");
  const [startDate, setStartDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
  );
  const [specialTerms, setSpecialTerms] = useState("");
  const [sending, setSending] = useState(false);
  const [capacityWarning, setCapacityWarning] = useState<string | null>(null);

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

    setSending(true);
    setCapacityWarning(null);

    try {
      const res = await fetch("/api/offers/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          campaign_id: campaign.id,
          application_id: candidate.application_id,
          // n8n selects an active company-provided SignWell template; the
          // server derives signer and recipient emails from trusted records.
          field_values: {
            position_title: positionTitle,
            salary,
            currency,
            start_date: startDate,
            special_terms: specialTerms,
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
          `Offer sent to you for signature. SignWell will send it to ${candidate.name || candidate.email} after you sign.`,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Prepare & Send Offer
          </DialogTitle>
          <DialogDescription>
            Generate an official employment agreement via SignWell. Your recruiter email signs
            first, then SignWell automatically delivers the packet to the candidate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
            <div>
              <span className="text-muted-foreground block">1st Signer (Recruiter):</span>
              <span className="font-semibold text-foreground truncate block">{recruiterEmail}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Candidate Recipient:</span>
              <span className="font-semibold text-foreground truncate block">
                {candidate.email}
              </span>
            </div>
          </div>

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
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="USD"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="start-date" className="text-xs">
              Target Start Date
            </Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
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
            {sending ? "Sending to SignWell..." : "Send to Recruiter for Signature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
