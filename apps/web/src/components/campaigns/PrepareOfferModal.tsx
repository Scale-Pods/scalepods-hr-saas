"use client";

import { type CampaignsRow, TierLimitError } from "@scalepods/core";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  FileSignature,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OfferTemplateEditor } from "@/components/offers/OfferTemplateEditor";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/features/account/hooks";
import type { ViewCandidate } from "@/features/campaigns/api";
import { extractOfferTemplateFromFile } from "@/lib/extract-text";
import {
  cleanOfferTemplateDirectives,
  extractCustomOfferVariables,
  formatOfferVarLabel,
  renderOfferTemplateText,
} from "@/lib/offer-template-utils";
import { accessToken as getAccessToken, supabaseBrowser } from "@/lib/supabase/client";

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
  onViewOffer,
}: PrepareOfferModalProps) {
  const { account } = useAccount();
  const isFreeTier = (account?.tier ?? "free") === "free";

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Templates state
  const [templates, setTemplates] = useState<OfferTemplateRecord[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateText, setTemplateText] = useState("");
  const [templateHtml, setTemplateHtml] = useState("");
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [savingTemplateEdit, setSavingTemplateEdit] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Inline upload state
  const [showUploadBox, setShowUploadBox] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadRawText, setUploadRawText] = useState("");
  const [uploadHtml, setUploadHtml] = useState("");
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [parsingWithAi, setParsingWithAi] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Standard + dynamic variables (auto-filled from DB)
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

  const [extraVariables, setExtraVariables] = useState<string[]>([]);
  const [removedVariables, setRemovedVariables] = useState<string[]>([]);
  const [newVarName, setNewVarName] = useState("");
  const [showAddVar, setShowAddVar] = useState(false);

  // Step 3: Preview & Send + Claude AI live editing
  const [previewTab, setPreviewTab] = useState<"letter" | "pdf">("letter");
  const [finalRenderedText, setFinalRenderedText] = useState("");
  const [finalRenderedHtml, setFinalRenderedHtml] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [loadingPdfPreview, setLoadingPdfPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [showAiStep3, setShowAiStep3] = useState(false);
  const [aiStep3Instruction, setAiStep3Instruction] = useState("");
  const [applyingAiStep3, setApplyingAiStep3] = useState(false);

  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>(() => {
    const isIntern = (campaign.name || "").toLowerCase().includes("intern");
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
      DURATION: isIntern ? "6 Months" : "Full-time",
      PROBATION_PERIOD: "3 Months",
      WORKING_DAYS: "Mon - Fri (5 Days/Wk)",
      REPORTING_MANAGER: "Hiring Manager",
      SIGNATORY_TITLE: "Talent Acquisition Lead",
      COMPANY_EMAIL: recruiterEmail || "",
      ISSUE_DATE: todayFormatted,
      REF_NO: `SP/${year}/OFFER/${randRef}`,
      LETTER_TYPE: isIntern ? "intern" : "fulltime",
      NOTICE_PERIOD: "15 Days",
    };
  });

  // Sync candidate/account defaults when modal opens
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setPreviewTab("letter");
    setIsEditingTemplate(false);
    setShowUploadBox(false);
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
          list.find((t) => t.id === selectedTemplateId) ??
          list.find((t) => t.is_default) ??
          list[0];
        if (preferred) {
          const isIntern = (campaign.name || "").toLowerCase().includes("intern");
          setSelectedTemplateId(preferred.id);
          setTemplateText(
            cleanOfferTemplateDirectives(preferred.raw_text || "", {
              isIntern,
              letterType: isIntern ? "intern" : "fulltime",
            }),
          );
          setTemplateHtml(
            cleanOfferTemplateDirectives(preferred.html_content || "", {
              isIntern,
              letterType: isIntern ? "intern" : "fulltime",
            }),
          );
        } else {
          setSelectedTemplateId("");
          setTemplateText("");
          setTemplateHtml("");
          setShowUploadBox(true);
        }
      }
    } catch {
      // Non-fatal: user can upload a template inline
    } finally {
      setLoadingTemplates(false);
    }
  }, [accessToken, campaign.name, selectedTemplateId]);

  useEffect(() => {
    if (open) {
      void loadTemplates();
    }
  }, [open, loadTemplates]);

  // Cleanup blob URL on unmount or when regenerated
  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const hasSelectedTemplate = Boolean(selectedTemplate && templateText.trim().length > 0);

  // Variables detected live from template text/HTML + any manually added vars
  const activeVariables = useMemo(() => {
    const source = templateHtml.trim() ? `${templateText}\n${templateHtml}` : templateText;
    const base = hasSelectedTemplate ? extractCustomOfferVariables(source) : [];
    const merged = Array.from(new Set([...base, ...extraVariables]));
    return merged.filter((v) => !removedVariables.includes(v));
  }, [hasSelectedTemplate, templateText, templateHtml, extraVariables, removedVariables]);

  const buildAllOfferValues = useCallback((): Record<string, string | undefined> => {
    const todayFormatted = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const isIntern =
      (positionTitle || campaign.name || "").toLowerCase().includes("intern") ||
      dynamicValues.LETTER_TYPE === "intern";
    return {
      ...dynamicValues,
      STIPEND_AMOUNT: dynamicValues.STIPEND_AMOUNT || (isIntern ? salary : undefined),
      CANDIDATE_NAME: candidateName,
      RECIPIENT_NAME: candidateName,
      POSITION_TITLE: positionTitle,
      ROLE: positionTitle,
      SALARY: salary,
      COMPENSATION: salary,
      CURRENCY: currency,
      START_DATE: startDate,
      JOINING_DATE: startDate,
      COMPANY_NAME: companyName,
      SIGNATORY_NAME: signatoryName,
      SIGNATORY_TITLE: dynamicValues.SIGNATORY_TITLE || "Talent Acquisition Lead",
      SPECIAL_TERMS: specialTerms,
      TERMS: specialTerms,
      ISSUE_DATE: todayFormatted,
      LETTER_TYPE: isIntern ? "intern" : "fulltime",
    };
  }, [
    dynamicValues,
    candidateName,
    positionTitle,
    campaign.name,
    salary,
    currency,
    startDate,
    companyName,
    signatoryName,
    specialTerms,
  ]);

  // Compute rendered text and HTML from template + all filled values
  const buildRenderedText = useCallback(() => {
    if (!hasSelectedTemplate) return "";
    const source = templateText.trim() ? templateText : selectedTemplate?.raw_text || "";
    return renderOfferTemplateText(source, buildAllOfferValues());
  }, [hasSelectedTemplate, templateText, selectedTemplate, buildAllOfferValues]);

  const buildRenderedHtml = useCallback(() => {
    if (!hasSelectedTemplate) return "";
    const source = templateHtml.trim() ? templateHtml : selectedTemplate?.html_content || "";
    if (!source?.trim()) return "";
    return renderOfferTemplateText(source, buildAllOfferValues());
  }, [hasSelectedTemplate, templateHtml, selectedTemplate, buildAllOfferValues]);

  // Fetch live PDF preview when switching to PDF tab on Step 3
  const loadPdfPreview = useCallback(
    async (textToRender: string, htmlToRender?: string) => {
      if (!textToRender.trim() && !htmlToRender?.trim()) return;
      setLoadingPdfPreview(true);
      try {
        const res = await fetch("/api/offers/pdf?preview=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rendered_html: htmlToRender?.trim() || undefined,
            rendered_text: textToRender,
            candidate_name: candidateName || "Candidate",
            position_title: positionTitle || "Software Engineer",
            salary: salary || "1200000",
            currency: currency || "INR",
            start_date: startDate || new Date().toISOString().split("T")[0],
            company_name: companyName || "ScalePods Technologies",
            signatory_name: signatoryName || "Manish",
            dynamic_variables: dynamicValues,
            use_branded_template: false,
          }),
        });
        if (!res.ok) throw new Error("Failed to generate preview PDF");
        const blob = await res.blob();
        setPdfPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } catch (err) {
        showErrorToast(err);
      } finally {
        setLoadingPdfPreview(false);
      }
    },
    [
      candidateName,
      positionTitle,
      salary,
      currency,
      startDate,
      companyName,
      signatoryName,
      dynamicValues,
    ],
  );

  const parseTemplateWithAi = useCallback(
    async (text: string, html: string, fileName?: string) => {
      if (!text.trim() && !html.trim()) return null;
      setParsingWithAi(true);
      try {
        const token = accessToken || (await getAccessToken());
        const isIntern = (campaign.name || "").toLowerCase().includes("intern");
        const res = await fetch("/api/offer-templates/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            raw_text: text,
            html_content: html,
            file_name: fileName || "document.docx",
            campaign_context: {
              position_title: campaign.name,
              salary: campaign.salary_min ? String(campaign.salary_min) : undefined,
              currency: campaign.salary_currency,
              is_intern: isIntern,
            },
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.cleaned_text) setTemplateText(data.cleaned_text);
          if (data.cleaned_html) setTemplateHtml(data.cleaned_html);

          if (Array.isArray(data.variables) && data.variables.length > 0) {
            const detectedMap: Record<string, string> = {};
            const keys: string[] = [];
            for (const item of data.variables) {
              const k = String(item.key || "")
                .trim()
                .toUpperCase();
              if (k) {
                keys.push(k);
                if (item.detected_value && !dynamicValues[k]) {
                  detectedMap[k] = item.detected_value;
                }
              }
            }
            if (Object.keys(detectedMap).length > 0) {
              setDynamicValues((prev) => ({ ...detectedMap, ...prev }));
            }
            setExtraVariables((prev) => Array.from(new Set([...prev, ...keys])));
          }
          showToast("Claude AI parsed document & dynamic variables.");
          return data;
        }
      } catch (err) {
        console.warn("[parseTemplateWithAi]", err);
      } finally {
        setParsingWithAi(false);
      }
      return null;
    },
    [accessToken, campaign, dynamicValues],
  );

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    setIsEditingTemplate(false);
    setRemovedVariables([]);
    setExtraVariables([]);
    const tpl = templates.find((t) => t.id === id);
    const isIntern =
      (positionTitle || campaign.name || "").toLowerCase().includes("intern") ||
      dynamicValues.LETTER_TYPE === "intern";
    setTemplateText(
      cleanOfferTemplateDirectives(tpl?.raw_text || "", {
        isIntern,
        letterType: isIntern ? "intern" : "fulltime",
      }),
    );
    setTemplateHtml(
      cleanOfferTemplateDirectives(tpl?.html_content || "", {
        isIntern,
        letterType: isIntern ? "intern" : "fulltime",
      }),
    );
  };

  const handleUploadFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".docx")) {
      showErrorToast("Only Word documents (.docx) are allowed. Please upload a .docx file.");
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      return;
    }

    setUploadFile(file);
    if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ""));

    const result = await extractOfferTemplateFromFile(file);
    if ("error" in result) {
      showErrorToast(result.error);
      setUploadRawText("");
      setUploadHtml("");
      return;
    }

    setUploadRawText(result.text);
    setUploadHtml(result.html);

    // Run Claude AI parsing immediately
    const parsed = await parseTemplateWithAi(result.text, result.html, file.name);
    if (parsed) {
      const alreadyHasPlaceholders =
        /\{\{[A-Za-z0-9_ -]+?\}\}/.test(result.text) ||
        /Show this section only when:/i.test(result.text);
      if (!alreadyHasPlaceholders) {
        if (parsed.cleaned_text) setUploadRawText(parsed.cleaned_text);
        if (parsed.cleaned_html) setUploadHtml(parsed.cleaned_html);
      }
    }
  };

  const handleAiEditStep3 = async () => {
    if (!aiStep3Instruction.trim()) {
      showErrorToast("Please enter an instruction for Claude AI.");
      return;
    }
    setApplyingAiStep3(true);
    try {
      const token = accessToken || (await getAccessToken());
      const res = await fetch("/api/offer-templates/ai-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          instruction: aiStep3Instruction.trim(),
          raw_text: finalRenderedText,
          html_content: finalRenderedHtml,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to edit letter with Claude AI");
      if (data.updated_text) setFinalRenderedText(data.updated_text);
      if (data.updated_html) setFinalRenderedHtml(data.updated_html);
      setAiStep3Instruction("");
      setShowAiStep3(false);
      showToast("Offer letter updated with Claude AI.");
      if (previewTab === "pdf") {
        void loadPdfPreview(data.updated_text, data.updated_html);
      }
    } catch (err) {
      showErrorToast(err);
    } finally {
      setApplyingAiStep3(false);
    }
  };

  const handleSaveUploadedTemplate = async () => {
    if (!uploadFile || !uploadRawText.trim() || !uploadName.trim()) {
      showErrorToast("Please choose a file and enter a template name.");
      return;
    }
    setUploadingTemplate(true);
    try {
      const token = accessToken || (await getAccessToken());
      const supabase = supabaseBrowser();
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData.user?.id || account?.id || "shared";
      const storagePath = `${ownerId}/${Date.now()}_${encodeURIComponent(uploadFile.name)}`;

      const { error: uploadErr } = await supabase.storage
        .from("offer-templates")
        .upload(storagePath, uploadFile, { upsert: false });
      if (uploadErr) throw uploadErr;

      const res = await fetch("/api/offer-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: uploadName.trim(),
          file_name: uploadFile.name,
          storage_path: storagePath,
          raw_text: uploadRawText.trim(),
          html_content: uploadHtml.trim() || undefined,
          is_default: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save template");

      const created = data.template as OfferTemplateRecord;
      const isIntern =
        (positionTitle || campaign.name || "").toLowerCase().includes("intern") ||
        dynamicValues.LETTER_TYPE === "intern";

      const cleanedText = cleanOfferTemplateDirectives(created.raw_text || uploadRawText.trim(), {
        isIntern,
        letterType: isIntern ? "intern" : "fulltime",
      });
      const cleanedHtml = cleanOfferTemplateDirectives(created.html_content || uploadHtml.trim(), {
        isIntern,
        letterType: isIntern ? "intern" : "fulltime",
      });

      setTemplates((prev) => [created, ...prev.map((t) => ({ ...t, is_default: false }))]);
      setSelectedTemplateId(created.id);
      setTemplateText(cleanedText);
      setTemplateHtml(cleanedHtml);
      setShowUploadBox(false);
      setUploadName("");
      setUploadFile(null);
      setUploadRawText("");
      setUploadHtml("");
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      showToast(`Template "${created.name}" uploaded and set as active.`);
    } catch (err) {
      showErrorToast(err);
    } finally {
      setUploadingTemplate(false);
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
        body: JSON.stringify({
          id: templateId,
          is_default: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set default template");

      setTemplates((prev) =>
        prev.map((t) => ({
          ...t,
          is_default: t.id === templateId,
        })),
      );
      handleSelectTemplate(templateId);
      showToast("Template set as default.");
    } catch (err) {
      showErrorToast(err);
    }
  };

  const handleSaveTemplateEdits = async () => {
    if (!selectedTemplate || !templateText.trim()) return;
    setSavingTemplateEdit(true);
    try {
      const token = accessToken || (await getAccessToken());
      const res = await fetch("/api/offer-templates", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id: selectedTemplate.id,
          raw_text: templateText.trim(),
          html_content: templateHtml.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update template");
      const updated = data.template as OfferTemplateRecord;
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setIsEditingTemplate(false);
      showToast("Template changes saved.");
    } catch (err) {
      showErrorToast(err);
    } finally {
      setSavingTemplateEdit(false);
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
        setTemplateText(next?.raw_text ?? "");
        setTemplateHtml(next?.html_content ?? "");
        setIsEditingTemplate(false);
        if (!next) setShowUploadBox(true);
      }
      showToast("Template deleted.");
    } catch (err) {
      showErrorToast(err);
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const handleAddCustomVar = () => {
    const clean = newVarName.trim().toUpperCase().replace(/[{}]/g, "").replace(/\s+/g, "_");
    if (!clean) return;
    setRemovedVariables((prev) => prev.filter((k) => k !== clean));
    if (!activeVariables.includes(clean)) {
      setExtraVariables((prev) => [...prev, clean]);
    }
    setNewVarName("");
    setShowAddVar(false);
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
    const renderedHtml = buildRenderedHtml();
    setFinalRenderedText(rendered);
    setFinalRenderedHtml(renderedHtml);
    setPreviewTab("letter");
    setStep(3);
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

    if (!hasSelectedTemplate || !finalRenderedText.trim()) {
      showErrorToast("Please select and preview an uploaded offer template before sending.");
      return;
    }

    if (!candidate?.application_id) {
      showErrorToast("No valid candidate selected.");
      return;
    }

    setSending(true);
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
          offer_template_id: selectedTemplateId,
          rendered_text: finalRenderedText.trim(),
          ...(finalRenderedHtml.trim() ? { rendered_html: finalRenderedHtml.trim() } : {}),
          field_values: {
            candidate_name: candidateName.trim() || candidate.name,
            position_title: positionTitle,
            salary,
            currency,
            start_date: startDate,
            company_name: companyName,
            signatory_name: signatoryName,
            special_terms: specialTerms,
            dynamic_variables: buildAllOfferValues(),
            ...buildAllOfferValues(),
            use_branded_template: false,
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

      if (data.email_dispatched === false) {
        showErrorToast(
          `Offer saved, but n8n email workflow failed: ${data.email_warning || "check n8n executions"}`,
        );
      } else if (data.overCapacityWarning) {
        showToast(
          `Offer sent! Notice: Job capacity reached (${data.offersSent} of ${data.openings} openings filled).`,
        );
      } else {
        showToast(
          `Offer letter generated and emailed directly to ${candidateName || candidate.email}!`,
        );
      }

      onOpenChange(false);
      onComplete();
      if (onViewOffer) {
        onViewOffer(candidate, data.offer);
      }
    } catch (err) {
      showErrorToast(err);
    } finally {
      setSending(false);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  if (!candidate?.application_id) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl sm:max-w-5xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Prepare & Send Offer Letter
          </DialogTitle>
          <DialogDescription>
            {step === 1 &&
              "Step 1 of 3 · Select, upload, or edit an offer letter template. Placeholders like {{VAR}} are detected automatically."}
            {step === 2 &&
              "Step 2 of 3 · Review auto-filled candidate & role details and fill any custom template variables."}
            {step === 3 &&
              "Step 3 of 3 · Review the final offer letter and PDF before sending it to the candidate."}
          </DialogDescription>

          {/* 3-Step Indicator */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            {[
              { num: 1, label: "1. Template" },
              { num: 2, label: "2. Variables" },
              { num: 3, label: "3. Preview & Send" },
            ].map((s) => (
              <button
                key={s.num}
                type="button"
                disabled={s.num > step}
                onClick={() => {
                  if (s.num < step) setStep(s.num as 1 | 2 | 3);
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                  step === s.num
                    ? "border-primary bg-primary/10 text-primary"
                    : step > s.num
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 cursor-pointer"
                      : "border-border/60 bg-muted/20 text-muted-foreground opacity-60 cursor-not-allowed"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isFreeTier && (
            <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  The Free plan does not include official offer letters. Upgrade to Basic or Growth
                  to extend offers.
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

          {/* ────────────────────────── STEP 1: CHOOSE / UPLOAD / EDIT TEMPLATE ────────────────────────── */}
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
                        placeholder="e.g. Standard Engineering Offer"
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

                  {parsingWithAi && (
                    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-xs text-primary">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      <span>
                        Claude AI is analyzing document & extracting dynamic variables via n8n...
                      </span>
                    </div>
                  )}

                  {uploadRawText && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        Extracted {uploadRawText.length} characters ·{" "}
                        {extractCustomOfferVariables(uploadRawText).length} dynamic variable(s)
                        detected
                      </span>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSaveUploadedTemplate}
                          disabled={uploadingTemplate || !uploadName.trim() || parsingWithAi}
                          className="h-7 gap-1.5 text-xs"
                        >
                          {uploadingTemplate ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          {uploadingTemplate ? "Uploading..." : "Save & Use Template"}
                        </Button>
                      </div>
                    </div>
                  )}
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
                              <div className="flex items-center gap-1.5">
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
                              </div>
                              <p className="text-[11px] text-muted-foreground">{tpl.file_name}</p>
                              {tpl.variables.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {tpl.variables.map((v) => (
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
                                    Set as Default
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10"
                                  disabled={parsingWithAi}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void parseTemplateWithAi(templateText, templateHtml, tpl.name);
                                  }}
                                >
                                  {parsingWithAi ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                  Re-extract with Claude
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1 text-xs"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsEditingTemplate((v) => !v);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                  {isEditingTemplate ? "Hide Editor" : "Edit Template"}
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
                        Upload a PDF, DOCX, or TXT offer template above to edit variables and send
                        an offer.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Inline visual document template editor */}
              {hasSelectedTemplate && isEditingTemplate && (
                <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Edit Offer Letter Template</Label>
                    {selectedTemplate && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 gap-1 text-xs"
                        disabled={savingTemplateEdit}
                        onClick={handleSaveTemplateEdits}
                      >
                        {savingTemplateEdit ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        Save to Company Template
                      </Button>
                    )}
                  </div>
                  <OfferTemplateEditor
                    value={templateText}
                    onChange={setTemplateText}
                    htmlValue={templateHtml}
                    onHtmlChange={setTemplateHtml}
                  />
                </div>
              )}
            </div>
          )}

          {/* ────────────────────────── STEP 2: FILL VARIABLES ────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground block">Sender (Recruiter):</span>
                  <span className="font-semibold text-foreground truncate block">
                    {recruiterEmail}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Candidate Recipient:</span>
                  <span className="font-semibold text-foreground truncate block">
                    {candidate.email}
                  </span>
                </div>
              </div>

              {/* Standard DB-populated fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cand-name" className="text-xs">
                    Candidate Name <span className="text-[10px] text-emerald-600">(from DB)</span>
                  </Label>
                  <Input
                    id="cand-name"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="position" className="text-xs">
                    Position Title <span className="text-[10px] text-emerald-600">(from DB)</span>
                  </Label>
                  <Input
                    id="position"
                    value={positionTitle}
                    onChange={(e) => setPositionTitle(e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                  />
                </div>
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="start-date" className="text-xs">
                    Target Start Date
                  </Label>
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
                    placeholder="Select start date"
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-name" className="text-xs">
                    Company Name <span className="text-[10px] text-emerald-600">(from DB)</span>
                  </Label>
                  <Input
                    id="company-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signatory-name" className="text-xs">
                    Signatory Name
                  </Label>
                  <Input
                    id="signatory-name"
                    value={signatoryName}
                    onChange={(e) => setSignatoryName(e.target.value)}
                  />
                </div>
              </div>

              {/* Dynamic Offer Letter Variables */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      Template Variables ({activeVariables.length})
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 max-h-96 overflow-y-auto pr-1">
                  {activeVariables.map((vKey) => (
                    <div
                      key={vKey}
                      className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <Label
                          htmlFor={`var-${vKey}`}
                          className="text-xs font-semibold text-foreground"
                        >
                          {formatOfferVarLabel(vKey)}
                        </Label>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-muted-foreground font-mono bg-muted/70 border border-border/40 px-1.5 py-0.5 rounded">
                            {`{{${vKey}}}`}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRemovedVariables((prev) =>
                                prev.includes(vKey) ? prev : [...prev, vKey],
                              )
                            }
                            className="text-muted-foreground/60 hover:text-destructive p-0.5"
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
                        placeholder={`Enter ${formatOfferVarLabel(vKey)}`}
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
            </div>
          )}

          {/* ────────────────────────── STEP 3: PREVIEW & SEND ────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Tabs
                  value={previewTab}
                  onValueChange={(v) => {
                    const tab = v as "letter" | "pdf";
                    setPreviewTab(tab);
                    if (tab === "pdf") {
                      void loadPdfPreview(finalRenderedText, finalRenderedHtml);
                    }
                  }}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="letter" className="text-xs gap-1.5 h-7">
                      <FileText className="h-3.5 w-3.5" /> Letter Preview (Editable)
                    </TabsTrigger>
                    <TabsTrigger value="pdf" className="text-xs gap-1.5 h-7">
                      <Eye className="h-3.5 w-3.5" /> PDF Preview
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
                    onClick={() => setShowAiStep3((v) => !v)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {showAiStep3 ? "Hide Claude AI" : "Edit with Claude AI"}
                  </Button>
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    Sending to <strong>{candidate.email}</strong>
                  </span>
                </div>
              </div>

              {showAiStep3 && (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-primary">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> Instruct Claude AI to Edit This Offer
                      Letter
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAiStep3(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 'Remove probation period', 'Add annual performance bonus clause', 'Format compensation table'..."
                      value={aiStep3Instruction}
                      onChange={(e) => setAiStep3Instruction(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleAiEditStep3();
                        }
                      }}
                      className="text-xs h-8 bg-background"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={applyingAiStep3 || !aiStep3Instruction.trim()}
                      onClick={handleAiEditStep3}
                      className="h-8 gap-1.5 shrink-0 text-xs"
                    >
                      {applyingAiStep3 ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {applyingAiStep3 ? "Claude Editing..." : "Apply Edit"}
                    </Button>
                  </div>
                </div>
              )}

              {previewTab === "letter" ? (
                finalRenderedHtml ? (
                  <div className="rounded-xl border border-border bg-slate-200/70 dark:bg-slate-900/70 p-3 sm:p-5 h-[56vh] min-h-[420px] overflow-y-auto">
                    <div
                      style={{ color: "#0f172a", backgroundColor: "#ffffff" }}
                      className="mx-auto w-full max-w-[820px] rounded-md bg-white text-slate-900 shadow-md border border-slate-200 overflow-hidden"
                    >
                      {/* Top letterhead decorative brand accent */}
                      <div className="h-2 w-full bg-gradient-to-r from-[#0f2942] via-[#1e40af] to-[#2563eb]" />
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => {
                          setFinalRenderedHtml(e.currentTarget.innerHTML);
                          setFinalRenderedText(e.currentTarget.innerText.replace(/\r\n/g, "\n"));
                        }}
                        className="min-h-[400px] px-8 py-7 text-[13px] leading-relaxed text-slate-900 font-sans focus:outline-none [&_h1]:text-[#0f2942] [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-[#0f2942] [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:border-slate-200 [&_h2]:pb-1 [&_h3]:text-[#1e40af] [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2.5 [&_li]:mb-1 [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_table]:shadow-sm [&_th]:border [&_th]:border-[#0f2942] [&_th]:bg-[#0f2942] [&_th]:text-white [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-1.5 [&_tr:nth-child(even)]:bg-slate-50/70 [&_img]:max-h-20 [&_img]:object-contain"
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: Rendered offer HTML comes from recruiter's own DOCX/template
                        dangerouslySetInnerHTML={{ __html: finalRenderedHtml }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Textarea
                      rows={14}
                      value={finalRenderedText}
                      onChange={(e) => setFinalRenderedText(e.target.value)}
                      className="font-sans text-xs leading-relaxed bg-card"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      You can make final edits directly above before sending.
                    </p>
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-border overflow-hidden bg-muted/20 h-[400px] flex items-center justify-center">
                  {loadingPdfPreview ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Rendering PDF preview...
                    </div>
                  ) : pdfPreviewUrl ? (
                    <iframe
                      src={pdfPreviewUrl}
                      title="Offer Letter PDF Preview"
                      className="w-full h-full border-0"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">Preview unavailable</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                disabled={sending}
                onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={sending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step === 1 && (
              <Button
                type="button"
                disabled={!hasSelectedTemplate}
                onClick={() => setStep(2)}
                className="gap-1.5"
              >
                Next: Fill Variables <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {step === 2 && (
              <Button type="button" onClick={goToStep3} className="gap-1.5">
                Next: Preview Offer <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {step === 3 && (
              <Button
                type="button"
                onClick={handleSendOffer}
                disabled={
                  sending || isFreeTier || !hasSelectedTemplate || !finalRenderedText.trim()
                }
                className="gap-1.5"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Sending Offer..." : "Confirm & Send Offer"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
