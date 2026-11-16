"use client";

import { type CampaignsRow, TierLimitError } from "@scalepods/core";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSignature,
  FileText,
  Loader2,
  Send,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MakeReusableModal } from "@/components/offers/MakeReusableModal";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/features/account/hooks";
import type { ViewCandidate } from "@/features/campaigns/api";
import {
  cleanOfferTemplateDirectives,
  formatOfferVarLabel,
  renderOfferTemplateText,
} from "@/lib/offer-template-utils";
import { accessToken as getAccessToken } from "@/lib/supabase/client";

export interface PrepareOfferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: ViewCandidate | null;
  campaign: CampaignsRow;
  recruiterEmail: string;
  accessToken?: string;
  onComplete: () => void;
  onViewOffer?: (candidate: ViewCandidate, offer?: unknown) => void;
}

interface OfferTemplateRecord {
  id: string;
  name: string;
  file_name: string;
  storage_path: string;
  raw_text: string;
  html_content?: string | null;
  variables: string[];
  placeholders?: string[];
  is_finished_letter?: boolean;
  is_default: boolean;
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
  const { account } = useAccount();
  const isFreeTier = (account?.tier ?? "free") === "free";

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Templates state
  const [templates, setTemplates] = useState<OfferTemplateRecord[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const selectedTemplateIdRef = useRef(selectedTemplateId);
  useEffect(() => {
    selectedTemplateIdRef.current = selectedTemplateId;
  }, [selectedTemplateId]);

  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Upload state
  const [showUploadBox, setShowUploadBox] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // "Make Reusable" Modal state
  const [makeReusableOpen, setMakeReusableOpen] = useState(false);
  const [reusableTargetTemplate, setReusableTargetTemplate] = useState<OfferTemplateRecord | null>(
    null,
  );

  // Finished letter mode: send as-is without variable filling
  const [sendAsIs, setSendAsIs] = useState(false);

  // Step 2: Form state
  const [candidateName, setCandidateName] = useState(candidate?.name || "");
  const [positionTitle, setPositionTitle] = useState(campaign.name || "");
  const [salary, setSalary] = useState(campaign.salary_min ? String(campaign.salary_min) : "");
  const [currency, setCurrency] = useState(campaign.salary_currency || "INR");
  const [startDate, setStartDate] = useState(() => {
    return new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
  });
  const [companyName, setCompanyName] = useState(account?.company_name || "ScalePods Partner");
  const [signatoryName, setSignatoryName] = useState(account?.name || "Hiring Manager");
  const [specialTerms, setSpecialTerms] = useState("");

  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>(() => {
    const todayFormatted = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const year = new Date().getFullYear();
    const randRef = Math.floor(1000 + Math.random() * 9000);
    return {
      DEPARTMENT: "Engineering",
      LOCATION: campaign.location || "Remote",
      DURATION: "Full-time",
      PROBATION_PERIOD: "3 Months",
      WORKING_DAYS: "Mon - Fri (5 Days/Wk)",
      REPORTING_MANAGER: "Hiring Manager",
      SIGNATORY_TITLE: "Talent Acquisition Lead",
      COMPANY_EMAIL: recruiterEmail || "",
      ISSUE_DATE: todayFormatted,
      REF_NO: `SP/${year}/OFFER/${randRef}`,
      NOTICE_PERIOD: "15 Days",
    };
  });

  // Step 3: Preview & Send state
  const [previewTab, setPreviewTab] = useState<"letter" | "pdf">("letter");
  const [finalRenderedText, setFinalRenderedText] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [loadingPdfPreview, setLoadingPdfPreview] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Reset defaults on modal open
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPreviewTab("letter");
    setShowUploadBox(false);
    setSendAsIs(false);
    setCandidateName(candidate?.name || "");
    setPositionTitle(campaign.name || "");
    setSalary(campaign.salary_min ? String(campaign.salary_min) : "");
    setCurrency(campaign.salary_currency || "INR");
    if (account?.company_name) setCompanyName(account.company_name);
    if (account?.name) setSignatoryName(account.name);
  }, [
    open,
    candidate?.name,
    campaign.name,
    campaign.salary_min,
    campaign.salary_currency,
    account?.company_name,
    account?.name,
  ]);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const token = accessToken || (await getAccessToken());
      const res = await fetch("/api/offer-templates", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.templates)) {
        const list = data.templates as OfferTemplateRecord[];
        setTemplates(list);
        const preferred =
          list.find((t) => t.id === selectedTemplateIdRef.current) ??
          list.find((t) => t.is_default) ??
          list[0];
        if (preferred) {
          setSelectedTemplateId(preferred.id);
          setSendAsIs(Boolean(preferred.is_finished_letter));
        } else {
          setSelectedTemplateId("");
          setSendAsIs(false);
          setShowUploadBox(true);
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingTemplates(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (open) {
      void loadTemplates();
    }
  }, [open, loadTemplates]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const hasSelectedTemplate = Boolean(selectedTemplate);

  // Active placeholders list from the template
  const activeVariables = useMemo(() => {
    if (!selectedTemplate) return [];
    const fields =
      selectedTemplate.placeholders && selectedTemplate.placeholders.length > 0
        ? selectedTemplate.placeholders
        : selectedTemplate.variables || [];
    return Array.from(new Set(fields));
  }, [selectedTemplate]);

  const buildAllOfferValues = useCallback((): Record<string, string | undefined> => {
    const todayFormatted = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const values: Record<string, string | undefined> = {
      ...dynamicValues,
      candidate_name: candidateName,
      recipient_name: candidateName,
      CANDIDATE_NAME: candidateName,
      RECIPIENT_NAME: candidateName,
      position_title: positionTitle,
      role: positionTitle,
      POSITION_TITLE: positionTitle,
      ROLE: positionTitle,
      salary,
      stipend_amount: salary,
      compensation: salary,
      SALARY: salary,
      STIPEND_AMOUNT: salary,
      COMPENSATION: salary,
      currency,
      CURRENCY: currency,
      start_date: startDate,
      joining_date: startDate,
      START_DATE: startDate,
      JOINING_DATE: startDate,
      company_name: companyName,
      COMPANY_NAME: companyName,
      signatory_name: signatoryName,
      SIGNATORY_NAME: signatoryName,
      signatory_title:
        dynamicValues.SIGNATORY_TITLE || dynamicValues.signatory_title || "Talent Acquisition Lead",
      SIGNATORY_TITLE:
        dynamicValues.SIGNATORY_TITLE || dynamicValues.signatory_title || "Talent Acquisition Lead",
      special_terms: specialTerms,
      SPECIAL_TERMS: specialTerms,
      issue_date: todayFormatted,
      ISSUE_DATE: todayFormatted,
    };

    return values;
  }, [
    dynamicValues,
    candidateName,
    positionTitle,
    salary,
    currency,
    startDate,
    companyName,
    signatoryName,
    specialTerms,
  ]);

  const buildRenderedText = useCallback(() => {
    if (!hasSelectedTemplate) return "";
    const source = selectedTemplate?.raw_text || "";
    const cleaned = cleanOfferTemplateDirectives(source);
    return renderOfferTemplateText(cleaned, buildAllOfferValues());
  }, [hasSelectedTemplate, selectedTemplate, buildAllOfferValues]);

  // Load PDF preview via generic DOCX engine
  const loadPdfPreview = useCallback(async () => {
    if (!selectedTemplate) return;
    setLoadingPdfPreview(true);
    setPdfPreviewError(null);

    try {
      const allValues = buildAllOfferValues();
      const res = await fetch("/api/offers/pdf?preview=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          field_values: allValues,
          send_as_is: sendAsIs,
          candidate_name: candidateName || "Candidate",
          position_title: positionTitle || "Software Engineer",
          salary: salary || "1200000",
          currency: currency || "INR",
          start_date: startDate || new Date().toISOString().split("T")[0],
          company_name: companyName || "ScalePods Technologies",
          signatory_name: signatoryName || "Manish",
          signatory_title: dynamicValues.SIGNATORY_TITLE || "Head of Talent Acquisition",
          dynamic_variables: allValues,
          rendered_text: buildRenderedText(),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || "Failed to render PDF preview");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.error("[PrepareOfferModal] PDF preview generation error:", err);
      setPdfPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingPdfPreview(false);
    }
  }, [
    selectedTemplate,
    buildAllOfferValues,
    sendAsIs,
    candidateName,
    positionTitle,
    salary,
    currency,
    startDate,
    companyName,
    signatoryName,
    dynamicValues,
    buildRenderedText,
  ]);

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    setSendAsIs(Boolean(tpl?.is_finished_letter || tpl?.raw_text === "[Finished Letter]"));
  };

  const handleUploadFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".docx")) {
      showErrorToast("Only Word documents (.docx) are allowed. Please upload a .docx file.");
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      return;
    }

    setUploadFile(file);
    if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ""));
  };

  const handleSaveUploadedTemplate = async () => {
    if (!uploadFile) {
      showErrorToast("Please select a .docx file to upload.");
      return;
    }
    setUploadingTemplate(true);
    try {
      const token = accessToken || (await getAccessToken());
      const formData = new FormData();
      formData.append("file", uploadFile);
      if (uploadName.trim()) formData.append("name", uploadName.trim());
      formData.append("is_default", "true");

      const res = await fetch("/api/offer-templates/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload template");

      const created = data.template as OfferTemplateRecord;
      setTemplates((prev) => [created, ...prev.map((t) => ({ ...t, is_default: false }))]);
      setSelectedTemplateId(created.id);
      setShowUploadBox(false);
      setUploadFile(null);
      setUploadName("");
      if (uploadInputRef.current) uploadInputRef.current.value = "";

      if (data.classification === "finished_letter") {
        setSendAsIs(true);
        showToast(
          `Finished letter "${created.name}" uploaded. You can Send As-Is or Make Reusable.`,
        );
      } else {
        setSendAsIs(false);
        showToast(
          `Template "${created.name}" uploaded with ${data.placeholders?.length || 0} fillable field(s).`,
        );
      }
    } catch (err) {
      showErrorToast(err);
    } finally {
      setUploadingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    setDeletingTemplateId(templateId);
    try {
      const token = accessToken || (await getAccessToken());
      const res = await fetch(`/api/offer-templates?id=${encodeURIComponent(templateId)}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete template");

      const remaining = templates.filter((t) => t.id !== templateId);
      setTemplates(remaining);
      if (selectedTemplateId === templateId) {
        const next = remaining.find((t) => t.is_default) ?? remaining[0];
        setSelectedTemplateId(next?.id ?? "");
        setSendAsIs(Boolean(next?.is_finished_letter));
        if (!next) setShowUploadBox(true);
      }
      showToast("Template deleted.");
    } catch (err) {
      showErrorToast(err);
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const handleSetDefaultTemplate = async (templateId: string) => {
    try {
      const token = accessToken || (await getAccessToken());
      const res = await fetch("/api/offer-templates", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id: templateId, is_default: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set default template");

      setTemplates((prev) => prev.map((t) => ({ ...t, is_default: t.id === templateId })));
      handleSelectTemplate(templateId);
      showToast("Template set as default.");
    } catch (err) {
      showErrorToast(err);
    }
  };

  const goToStep2 = () => {
    if (!selectedTemplate) {
      showErrorToast("Please choose or upload a template first.");
      return;
    }
    const isFinished = Boolean(
      selectedTemplate.is_finished_letter || selectedTemplate.raw_text === "[Finished Letter]",
    );
    if (isFinished && sendAsIs) {
      // Finished letter with send as-is chosen skips straight to Preview & Send
      setFinalRenderedText("[Finished Letter - Sent As-Is]");
      setStep(3);
      void loadPdfPreview();
      return;
    }
    setStep(2);
  };

  const goToStep3 = () => {
    if (!positionTitle.trim()) {
      showErrorToast("Position title is required.");
      return;
    }
    if (!salary.trim()) {
      showErrorToast("Compensation amount is required.");
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    if (!startDate || startDate < today) {
      showErrorToast("Target start / joining date cannot be in the past.");
      return;
    }
    const rendered = buildRenderedText();
    setFinalRenderedText(rendered);
    setStep(3);
    void loadPdfPreview();
  };

  const handleSendOffer = async () => {
    if (isFreeTier) {
      showErrorToast(
        new TierLimitError(
          "/api/offers/send",
          "Plan limit reached",
          "The Free plan does not include offer letters (0 included). Please upgrade your plan in Billing to extend official offers.",
          "offers_per_month_exceeded",
          403,
        ),
      );
      return;
    }

    if (!selectedTemplate) {
      showErrorToast("Please select an offer template before sending.");
      return;
    }

    if (!candidate?.application_id) {
      showErrorToast("No valid candidate selected.");
      return;
    }

    setSending(true);
    try {
      const token = accessToken || (await getAccessToken());
      const allValues = buildAllOfferValues();

      const res = await fetch("/api/offers/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          campaign_id: campaign.id,
          application_id: candidate.application_id,
          offer_template_id: selectedTemplateId,
          send_as_is: sendAsIs,
          rendered_text: finalRenderedText.trim(),
          field_values: {
            candidate_name: candidateName.trim() || candidate.name,
            position_title: positionTitle,
            salary,
            currency,
            start_date: startDate,
            company_name: companyName,
            signatory_name: signatoryName,
            special_terms: specialTerms,
            dynamic_variables: allValues,
            ...allValues,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402 || res.status === 403) {
          showErrorToast(
            new TierLimitError(
              "/api/offers/send",
              data.error || "Plan limit reached",
              data.detail,
              data.reason,
              res.status,
            ),
          );
          return;
        }
        throw new Error(data.error || "Failed to send offer letter");
      }

      showToast(`Offer letter dispatched to ${candidate.name}!`);
      onComplete();
      onOpenChange(false);
    } catch (err) {
      showErrorToast(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-6 bg-background text-foreground border-border">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" />
              Prepare & Send Offer Letter
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {step === 1 &&
                "Step 1 of 3 · Select or upload a DOCX offer template. Formatting, fonts, and layout are preserved with 100% fidelity."}
              {step === 2 &&
                "Step 2 of 3 · Fill in candidate values. Fields are dynamically generated from detected placeholders."}
              {step === 3 &&
                "Step 3 of 3 · Review the high-fidelity PDF preview generated via LibreOffice and dispatch the offer."}
            </DialogDescription>

            {/* Stepper progress indicator */}
            <div className="flex items-center gap-2 pt-2">
              {[
                { n: 1, label: "1. Template" },
                { n: 2, label: "2. Variables" },
                { n: 3, label: "3. Preview & Send" },
              ].map((s) => (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => {
                    if (s.n < step) setStep(s.n as 1 | 2 | 3);
                    else if (s.n === 2 && hasSelectedTemplate) goToStep2();
                    else if (s.n === 3 && hasSelectedTemplate) goToStep3();
                  }}
                  className={`flex-1 rounded-md py-1 px-2.5 text-center text-xs font-medium border transition-colors ${
                    step === s.n
                      ? "border-primary bg-primary text-primary-foreground font-semibold"
                      : s.n < step
                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 cursor-pointer"
                        : "border-border/60 bg-muted/20 text-muted-foreground opacity-60 cursor-not-allowed"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {isFreeTier && (
              <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    The Free plan does not include official offer letters. Upgrade to extend offers.
                  </span>
                </div>
                <Link
                  href="/billing"
                  className="rounded-md bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 shrink-0 ml-2"
                >
                  Upgrade Plan
                </Link>
              </div>
            )}

            {/* ────────────────────────── STEP 1: CHOOSE / UPLOAD TEMPLATE ────────────────────────── */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Choose Company Offer Template
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setShowUploadBox((v) => !v)}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {showUploadBox ? "Close Upload" : "Upload New Template"}
                  </Button>
                </div>

                {showUploadBox && (
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Template Name</Label>
                        <Input
                          placeholder="e.g. Standard Offer Letter"
                          value={uploadName}
                          onChange={(e) => setUploadName(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Word Document (.docx only)</Label>
                        <input
                          ref={uploadInputRef}
                          type="file"
                          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={handleUploadFilePick}
                          className="block w-full text-xs text-muted-foreground file:mr-2.5 file:rounded-md file:border-0 file:bg-primary/15 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-primary cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveUploadedTemplate}
                        disabled={uploadingTemplate || !uploadFile}
                        className="h-7 gap-1.5 text-xs"
                      >
                        {uploadingTemplate ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {uploadingTemplate ? "Uploading & Classifying..." : "Upload Template"}
                      </Button>
                    </div>
                  </div>
                )}

                {loadingTemplates ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading company templates...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map((tpl) => {
                      const selected = selectedTemplateId === tpl.id;
                      const isFinished = Boolean(
                        tpl.is_finished_letter || tpl.raw_text === "[Finished Letter]",
                      );
                      const placeholdersList =
                        tpl.placeholders && tpl.placeholders.length > 0
                          ? tpl.placeholders
                          : tpl.variables || [];

                      return (
                        <label
                          key={tpl.id}
                          className={`block cursor-pointer rounded-xl border p-3 transition-colors ${
                            selected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-border/80 bg-card"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              <input
                                type="radio"
                                name="offer-template-choice"
                                checked={selected}
                                onChange={() => handleSelectTemplate(tpl.id)}
                                className="mt-1 accent-primary"
                              />
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-medium text-foreground">
                                    {tpl.name}
                                  </span>
                                  {tpl.is_default && (
                                    <Badge
                                      variant="secondary"
                                      className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]"
                                    >
                                      <Star className="h-2.5 w-2.5" /> Default
                                    </Badge>
                                  )}
                                  {isFinished && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-blue-400 border-blue-500/30"
                                    >
                                      Finished Letter (0 placeholders)
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">{tpl.file_name}</p>

                                {isFinished && selected && (
                                  <div className="mt-2 p-2.5 rounded-lg bg-blue-950/30 border border-blue-800/40 text-xs text-blue-200 space-y-2">
                                    <p className="text-[11px]">
                                      This letter contains no <code>{"{{tags}}"}</code>. How would
                                      you like to proceed?
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant={sendAsIs ? "default" : "outline"}
                                        className="h-6 text-[11px] px-2.5"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSendAsIs(true);
                                        }}
                                      >
                                        Choice 1: Send As-Is
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-[11px] px-2.5 border-indigo-500/40 text-indigo-300 hover:bg-indigo-950/40 gap-1"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setReusableTargetTemplate(tpl);
                                          setMakeReusableOpen(true);
                                        }}
                                      >
                                        <Wand2 className="w-3 h-3" />
                                        Choice 2: Make Reusable (Mark Fields)
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {!isFinished && placeholdersList.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {placeholdersList.map((v) => (
                                      <span
                                        key={v}
                                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                      >
                                        {`{{${v}}}`}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              {selected && (
                                <>
                                  {!tpl.is_default && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 gap-1 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void handleSetDefaultTemplate(tpl.id);
                                      }}
                                    >
                                      <Star className="h-3 w-3" />
                                      Set Default
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 gap-1 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/20"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setReusableTargetTemplate(tpl);
                                      setMakeReusableOpen(true);
                                    }}
                                  >
                                    <Sparkles className="h-3 w-3" />
                                    Make Reusable
                                  </Button>
                                </>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                disabled={deletingTemplateId === tpl.id}
                                aria-label={`Delete ${tpl.name}`}
                                title={`Delete ${tpl.name}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleDeleteTemplate(tpl.id);
                                }}
                              >
                                {deletingTemplateId === tpl.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </label>
                      );
                    })}

                    {templates.length === 0 && (
                      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border py-6 text-center">
                        <FileText className="h-6 w-6 text-muted-foreground/50" />
                        <p className="text-xs font-medium text-foreground">
                          No uploaded offer templates yet
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Upload a .docx offer template above to edit variables and send an offer.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ────────────────────────── STEP 2: FILL VARIABLES ────────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="p-3 bg-muted/20 border border-border rounded-lg text-xs text-muted-foreground">
                  Variables are generated from the selected template. Standard candidate details are
                  pre-filled automatically.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Candidate Name</Label>
                    <Input
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="Candidate Name"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Position / Role</Label>
                    <Input
                      value={positionTitle}
                      onChange={(e) => setPositionTitle(e.target.value)}
                      placeholder="Position Title"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Compensation Amount</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={salary}
                        onChange={(e) => setSalary(e.target.value)}
                        placeholder="e.g. 1500000"
                        className="h-8 text-xs flex-1"
                      />
                      <Input
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="h-8 text-xs w-20 uppercase font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Target Joining Date</Label>
                    <DatePicker
                      value={startDate}
                      onChange={(d) => setStartDate(d)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Company Name</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Signatory / Approver Name</Label>
                    <Input
                      value={signatoryName}
                      onChange={(e) => setSignatoryName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  {/* Dynamically generated fields for non-standard placeholders */}
                  {activeVariables
                    .filter((v) => {
                      const lower = v.toLowerCase();
                      return (
                        lower !== "candidate_name" &&
                        lower !== "recipient_name" &&
                        lower !== "position_title" &&
                        lower !== "role" &&
                        lower !== "salary" &&
                        lower !== "compensation" &&
                        lower !== "currency" &&
                        lower !== "start_date" &&
                        lower !== "joining_date" &&
                        lower !== "company_name" &&
                        lower !== "signatory_name"
                      );
                    })
                    .map((v) => {
                      const lower = v.toLowerCase();
                      const isDate = lower.includes("date");
                      const isNumeric =
                        lower.includes("amount") ||
                        lower.includes("salary") ||
                        lower.includes("stipend") ||
                        lower.includes("ctc") ||
                        lower.includes("bonus");
                      const label = formatOfferVarLabel(v);
                      const currentVal = dynamicValues[v] ?? dynamicValues[v.toUpperCase()] ?? "";

                      const fieldId = `field-${v}`;
                      return (
                        <div key={v} className="space-y-1.5">
                          <Label htmlFor={fieldId} className="text-xs font-medium">
                            {label}
                          </Label>
                          {isDate ? (
                            <DatePicker
                              value={currentVal}
                              onChange={(d) =>
                                setDynamicValues((prev) => ({
                                  ...prev,
                                  [v]: d,
                                  [v.toUpperCase()]: d,
                                }))
                              }
                              className="h-8 text-xs"
                            />
                          ) : isNumeric ? (
                            <Input
                              id={fieldId}
                              type="number"
                              value={currentVal}
                              onChange={(e) =>
                                setDynamicValues((prev) => ({
                                  ...prev,
                                  [v]: e.target.value,
                                  [v.toUpperCase()]: e.target.value,
                                }))
                              }
                              placeholder="0"
                              className="h-8 text-xs"
                            />
                          ) : (
                            <Input
                              id={fieldId}
                              value={currentVal}
                              onChange={(e) =>
                                setDynamicValues((prev) => ({
                                  ...prev,
                                  [v]: e.target.value,
                                  [v.toUpperCase()]: e.target.value,
                                }))
                              }
                              placeholder={label}
                              className="h-8 text-xs"
                            />
                          )}
                        </div>
                      );
                    })}
                </div>

                <div className="space-y-1.5 pt-2 border-t border-border">
                  <Label className="text-xs text-muted-foreground">
                    Special Terms / Conditions (Optional)
                  </Label>
                  <Textarea
                    value={specialTerms}
                    onChange={(e) => setSpecialTerms(e.target.value)}
                    placeholder="Enter any custom clauses, laptop policy, or conditional terms..."
                    rows={2}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* ────────────────────────── STEP 3: PREVIEW & SEND ────────────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    Document Preview (Same file sent to candidate)
                  </span>
                  <div className="flex items-center gap-2">
                    <Tabs
                      value={previewTab}
                      onValueChange={(v) => setPreviewTab(v as "pdf" | "letter")}
                    >
                      <TabsList className="h-7 text-xs">
                        <TabsTrigger value="pdf" className="h-6 text-xs px-2.5">
                          PDF View
                        </TabsTrigger>
                        <TabsTrigger value="letter" className="h-6 text-xs px-2.5">
                          Text View
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void loadPdfPreview()}
                      disabled={loadingPdfPreview}
                    >
                      {loadingPdfPreview ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Refresh Preview
                    </Button>
                  </div>
                </div>

                {previewTab === "pdf" && (
                  <div className="min-h-[480px]">
                    {loadingPdfPreview ? (
                      <div className="flex flex-col items-center justify-center h-[480px] rounded-lg border border-border bg-muted/20">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                        <span className="text-xs text-muted-foreground">
                          Rendering high-fidelity PDF preview via LibreOffice...
                        </span>
                      </div>
                    ) : pdfPreviewError ? (
                      <div className="flex flex-col items-center justify-center h-[480px] p-6 rounded-lg border border-destructive/30 bg-destructive/10 text-center">
                        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                        <span className="text-sm font-semibold text-destructive">
                          PDF Preview Generation Failed
                        </span>
                        <span className="text-xs text-muted-foreground mt-1 max-w-md">
                          {pdfPreviewError}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void loadPdfPreview()}
                          className="mt-3 text-xs"
                        >
                          Retry Preview
                        </Button>
                      </div>
                    ) : pdfPreviewUrl ? (
                      <iframe
                        src={pdfPreviewUrl}
                        title="Offer Letter PDF Preview"
                        className="w-full h-[520px] rounded-lg border border-border bg-card"
                      />
                    ) : null}
                  </div>
                )}

                {previewTab === "letter" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Substituted Offer Letter Text
                    </Label>
                    <Textarea
                      readOnly
                      value={finalRenderedText}
                      className="font-mono text-xs bg-muted/10 h-[480px] resize-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-border flex justify-between items-center sm:justify-between">
            {step === 1 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!hasSelectedTemplate}
                  onClick={goToStep2}
                  className="gap-1.5 text-xs"
                >
                  {selectedTemplate?.is_finished_letter && sendAsIs
                    ? "Next: Preview & Send"
                    : "Next: Fill Variables"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(1)}
                  className="gap-1 text-xs"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Template
                </Button>
                <Button type="button" onClick={goToStep3} className="gap-1.5 text-xs">
                  Next: Preview Offer
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}

            {step === 3 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setStep(
                      (selectedTemplate?.is_finished_letter ||
                        selectedTemplate?.raw_text === "[Finished Letter]") &&
                        sendAsIs
                        ? 1
                        : 2,
                    )
                  }
                  className="gap-1 text-xs"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {(selectedTemplate?.is_finished_letter ||
                    selectedTemplate?.raw_text === "[Finished Letter]") &&
                  sendAsIs
                    ? "Back to Template"
                    : "Back to Variables"}
                </Button>
                <Button
                  type="button"
                  onClick={handleSendOffer}
                  disabled={sending || isFreeTier}
                  className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {sending ? "Sending..." : "Confirm & Send Offer"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Make Reusable Wizard Modal */}
      {reusableTargetTemplate && (
        <MakeReusableModal
          open={makeReusableOpen}
          onOpenChange={setMakeReusableOpen}
          templateId={reusableTargetTemplate.id}
          templateName={reusableTargetTemplate.name}
          accessToken={accessToken}
          onSuccess={(newTpl) => {
            const fullRecord: OfferTemplateRecord = {
              raw_text: "[Reusable DOCX Template]",
              is_default: false,
              ...newTpl,
            };
            setTemplates((prev) => [fullRecord, ...prev]);
            setSelectedTemplateId(newTpl.id);
            setSendAsIs(false);
            showToast(`Reusable template "${newTpl.name}" created!`);
          }}
        />
      )}
    </>
  );
}
