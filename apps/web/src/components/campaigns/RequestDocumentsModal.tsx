"use client";

import type { CampaignsRow } from "@scalepods/core";
import { Check, FileCheck2, FileText, Loader2, Plus, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestVerificationDocuments, type ViewCandidate } from "@/features/campaigns/api";
import { accessToken as getAccessToken } from "@/lib/supabase/client";

export interface RequestDocumentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: ViewCandidate | null;
  campaign: CampaignsRow;
  accessToken?: string;
  onComplete: () => void;
}

const PRESET_DOCUMENTS = [
  "Government Photo ID (Passport / Aadhaar / DL)",
  "Highest Educational Degree Certificate",
  "Relieving Letter & Experience Certificate",
  "Previous 3 Months Payslips",
  "Cancelled Cheque / Bank Passbook",
  "Signed NDA / Confidentiality Agreement",
];

export function RequestDocumentsModal({
  open,
  onOpenChange,
  candidate,
  campaign,
  accessToken: propToken,
  onComplete,
}: RequestDocumentsModalProps) {
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([
    "Government Photo ID (Passport / Aadhaar / DL)",
    "Highest Educational Degree Certificate",
    "Relieving Letter & Experience Certificate",
  ]);
  const [customDocInput, setCustomDocInput] = useState("");
  const [customMessage, setCustomMessage] = useState(
    "Please reply to this email with clear PDF scans or photo copies of the requested documents at your earliest convenience.",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-populate if candidate already has requested documents
  useEffect(() => {
    if (candidate?.requested_documents && Array.isArray(candidate.requested_documents)) {
      const existingNames = candidate.requested_documents
        .map((d) => (typeof d === "string" ? d : d.name))
        .filter(Boolean);
      if (existingNames.length > 0) {
        setSelectedDocuments(existingNames);
      }
    }
  }, [candidate]);

  const togglePreset = (preset: string) => {
    if (selectedDocuments.some((d) => d.toLowerCase() === preset.toLowerCase())) {
      setSelectedDocuments((prev) => prev.filter((d) => d.toLowerCase() !== preset.toLowerCase()));
    } else {
      setSelectedDocuments((prev) => [...prev, preset]);
    }
  };

  const handleAddCustomDoc = () => {
    const trimmed = customDocInput.trim();
    if (!trimmed) return;
    if (selectedDocuments.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      showToast("Document is already in the list", { kind: "info" });
      setCustomDocInput("");
      return;
    }
    setSelectedDocuments((prev) => [...prev, trimmed]);
    setCustomDocInput("");
  };

  const handleRemoveDoc = (docToRemove: string) => {
    setSelectedDocuments((prev) => prev.filter((d) => d !== docToRemove));
  };

  const handleSendRequest = async () => {
    if (!candidate?.application_id) {
      showErrorToast("Cannot request documents: Application ID is missing.");
      return;
    }

    if (selectedDocuments.length === 0) {
      showErrorToast("Please select or add at least one document to request.");
      return;
    }

    setIsSubmitting(true);
    try {
      const token = propToken || (await getAccessToken());
      await requestVerificationDocuments({
        applicationId: candidate.application_id,
        campaignId: campaign.id,
        documents: selectedDocuments,
        customMessage: customMessage.trim() || undefined,
        accessToken: token,
      });

      showToast(`Verification request email sent to ${candidate.name || candidate.email}!`, {
        kind: "success",
      });
      onOpenChange(false);
      onComplete();
    } catch (err: unknown) {
      showErrorToast(err instanceof Error ? err.message : "Failed to dispatch document request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">
                Request Verification Documents
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Customize the required verification documents and dispatch an email request to the
                candidate.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Candidate & Campaign Badge */}
        <div className="rounded-lg bg-muted/40 p-3 border border-border/60 flex items-center justify-between text-xs">
          <div>
            <span className="font-semibold text-foreground block">
              {candidate?.name || "Candidate"}
            </span>
            <span className="text-muted-foreground text-[11px]">{candidate?.email}</span>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] font-mono border-primary/30 text-primary bg-primary/5"
          >
            {campaign.name}
          </Badge>
        </div>

        <div className="space-y-4 py-2">
          {/* Presets Selection */}
          <div>
            <Label className="text-xs font-semibold text-foreground block mb-1.5">
              Quick Select Standard Documents
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_DOCUMENTS.map((preset) => {
                const isSelected = selectedDocuments.some(
                  (d) => d.toLowerCase() === preset.toLowerCase(),
                );
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => togglePreset(preset)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer border ${
                      isSelected
                        ? "border-primary bg-primary/15 text-primary shadow-2xs"
                        : "border-border/70 bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {isSelected ? (
                      <Check className="h-3 w-3 text-primary shrink-0" />
                    ) : (
                      <Plus className="h-3 w-3 opacity-60 shrink-0" />
                    )}
                    <span>{preset}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Document Input */}
          <div>
            <Label className="text-xs font-semibold text-foreground block mb-1.5">
              Add Custom Document
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter any document name (e.g. Tax Form 16, Portfolio PDF, Driver's License...)"
                value={customDocInput}
                onChange={(e) => setCustomDocInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomDoc();
                  }
                }}
                className="text-xs h-9 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCustomDoc}
                className="h-9 px-3 text-xs gap-1 shrink-0 font-medium cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>

          {/* Selected Documents Checklist */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs font-semibold text-foreground">
                Documents to Request ({selectedDocuments.length})
              </Label>
              {selectedDocuments.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedDocuments([])}
                  className="text-[11px] text-muted-foreground hover:text-rose-500 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {selectedDocuments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 p-4 text-center text-xs text-muted-foreground">
                No documents selected. Choose presets above or enter custom document names.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {selectedDocuments.map((doc) => (
                  <div
                    key={doc}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border/50 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="font-medium text-foreground truncate">{doc}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDoc(doc)}
                      className="p-1 rounded text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
                      title="Remove document"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instructions to Candidate */}
          <div>
            <Label className="text-xs font-semibold text-foreground block mb-1.5">
              Candidate Instructions / Email Note
            </Label>
            <Textarea
              rows={3}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Instructions for document submission format, deadlines, or reply details..."
              className="text-xs resize-none"
            />
            <span className="text-[10px] text-muted-foreground block mt-1">
              This message will be included in the email dispatched to {candidate?.email}.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSendRequest}
            disabled={isSubmitting || selectedDocuments.length === 0}
            className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send Document Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
