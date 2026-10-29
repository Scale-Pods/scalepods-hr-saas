"use client";

import {
  CADENCE_STAGES,
  type CadenceChannel,
  type CadenceRenderRow,
  type CadenceTimingWarning,
  cadenceForTier,
  cadenceTierEditability,
  campaignCreateSchema,
  type Database,
  DEFAULT_DIALNEXA_CONFIG,
  type DialnexaVoiceConfig,
  filterCadenceByDuration,
  type Json,
  type RoundType,
  type TeamMemberRow,
  TIER_LIMITS,
  validateCadenceTiming,
} from "@scalepods/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  FileText,
  Info,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CadencePreview } from "@/components/campaigns/CadencePreview";
import { ChannelToggle } from "@/components/campaigns/ChannelToggle";
import { DialnexaConfigEditor } from "@/components/campaigns/DialnexaConfigEditor";
import { DEFAULT_ROUND, type RoundDraft, RoundEditor } from "@/components/campaigns/RoundEditor";
import { StepsBar } from "@/components/campaigns/StepsBar";
import HowToCreateButton from "@/components/HowToCreateButton";
import { showErrorToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/features/account/hooks";
import { campaignsKey } from "@/features/campaigns/hooks";
import { syncRoundCount } from "@/features/campaigns/rounds";
import { extractTextFromFile } from "@/lib/extract-text";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { callWorkflow } from "@/lib/webhooks";

interface CampaignCreated {
  campaign_id?: string;
  id?: string;
}

const STEPS = [
  "Campaign Basics & Job Description",
  "Interview Rounds & Scoring",
  "Candidate Outreach & Channels",
];

export interface CampaignCreateWizardProps {
  onSuccess?: (campaignId?: string) => void;
  onCancel?: () => void;
}

export function CampaignCreateWizard({ onSuccess, onCancel }: CampaignCreateWizardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { account } = useAccount();
  const tier = account?.tier ?? "free";
  const tierConfig = TIER_LIMITS[tier];
  const isPeriodPaid = Boolean(
    account?.next_billing_date && new Date(account.next_billing_date).getTime() > Date.now(),
  );
  const canceled = account?.billing_status === "canceled" && !isPeriodPaid;

  const [step, setStep] = useState(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search).get("step");
      if (sp) {
        const parsed = parseInt(sp, 10);
        if (!Number.isNaN(parsed)) {
          return Math.min(Math.max(0, parsed), STEPS.length - 1);
        }
      }
    }
    return 0;
  });

  const goToStep = (targetStep: number, isPush = true) => {
    const nextVal = Math.min(Math.max(0, targetStep), STEPS.length - 1);
    setStep(nextVal);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "new");
      url.searchParams.set("step", String(nextVal));
      if (isPush) {
        window.history.pushState({ step: nextVal }, "", url.toString());
      } else {
        window.history.replaceState({ step: nextVal }, "", url.toString());
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Sync browser back/forward button navigation
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const sp = new URLSearchParams(window.location.search);
      const stepParam = sp.get("step");
      if (stepParam !== null) {
        const parsed = parseInt(stepParam, 10);
        if (!Number.isNaN(parsed)) {
          setStep(Math.min(Math.max(0, parsed), STEPS.length - 1));
          return;
        }
      }
      if (e.state && typeof e.state.step === "number") {
        setStep(Math.min(Math.max(0, e.state.step), STEPS.length - 1));
        return;
      }
      setStep(0);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [jdText, setJdText] = useState("");
  const [location, setLocation] = useState("Remote");
  const [workArrangement, setWorkArrangement] = useState<"remote" | "hybrid" | "onsite">("remote");
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [closingDate, setClosingDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [numberOfOpenings, setNumberOfOpenings] = useState<number | string>(1);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("USD");
  const [salaryPeriod, setSalaryPeriod] = useState<"annual" | "monthly" | "hourly">("annual");
  const [numberOfRounds, setNumberOfRounds] = useState(1);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [offerTemplateText, setOfferTemplateText] = useState("");
  const [offerTemplateFileName, setOfferTemplateFileName] = useState("");
  const [offerTemplateVariables, setOfferTemplateVariables] = useState<string[]>([
    "DEPARTMENT",
    "LOCATION",
    "DURATION",
    "PROBATION_PERIOD",
  ]);
  const [newVariableInput, setNewVariableInput] = useState("");
  const [rounds, setRounds] = useState<RoundDraft[]>([DEFAULT_ROUND]);
  const [whatsappOn, setWhatsappOn] = useState(tierConfig.whatsapp);
  const [voiceOn, setVoiceOn] = useState(tierConfig.voiceScreening);
  const [dialnexaConfig, setDialnexaConfig] = useState<DialnexaVoiceConfig>(() => ({
    ...DEFAULT_DIALNEXA_CONFIG,
  }));
  const [customCadence, setCustomCadence] = useState<
    Record<
      string,
      {
        enabled?: boolean;
        channels?: CadenceChannel[];
        label?: string;
        dayLabel?: string;
        dayOffset?: number;
        hoursBefore?: number;
        sendHour?: number;
        sendTime?: string;
      }
    >
  >({});
  const [userAddedStages, setUserAddedStages] = useState<CadenceRenderRow[]>([]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Restore draft on refresh / mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount to restore draft
  useEffect(() => {
    try {
      const raw =
        localStorage.getItem("scalepods_campaign_wizard_draft") ||
        sessionStorage.getItem("scalepods_campaign_wizard_draft");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.name && !name) setName(parsed.name);
        if (parsed.jdText && !jdText) setJdText(parsed.jdText);
        if (parsed.location) setLocation(parsed.location);
        if (parsed.workArrangement) setWorkArrangement(parsed.workArrangement);
        if (parsed.openingDate) setOpeningDate(parsed.openingDate);
        if (parsed.closingDate) setClosingDate(parsed.closingDate);
        if (parsed.numberOfOpenings !== undefined && parsed.numberOfOpenings !== null) {
          setNumberOfOpenings(parsed.numberOfOpenings);
        }
        if (parsed.salaryMin) setSalaryMin(parsed.salaryMin);
        if (parsed.salaryMax) setSalaryMax(parsed.salaryMax);
        if (parsed.salaryCurrency) setSalaryCurrency(parsed.salaryCurrency);
        if (parsed.salaryPeriod) setSalaryPeriod(parsed.salaryPeriod);
        if (parsed.numberOfRounds) setNumberOfRounds(parsed.numberOfRounds);
        if (parsed.startDate) setStartDate(parsed.startDate);
        if (parsed.endDate) setEndDate(parsed.endDate);
        if (parsed.offerTemplateText) setOfferTemplateText(parsed.offerTemplateText);
        if (parsed.offerTemplateFileName) setOfferTemplateFileName(parsed.offerTemplateFileName);
        if (Array.isArray(parsed.offerTemplateVariables)) {
          setOfferTemplateVariables(parsed.offerTemplateVariables);
        }
        if (Array.isArray(parsed.rounds) && parsed.rounds.length > 0) {
          setRounds(parsed.rounds);
        }
        if (parsed.whatsappOn !== undefined) setWhatsappOn(parsed.whatsappOn);
        if (parsed.voiceOn !== undefined) setVoiceOn(parsed.voiceOn);
        if (parsed.dialnexaConfig) setDialnexaConfig(parsed.dialnexaConfig);
        if (parsed.customCadence) setCustomCadence(parsed.customCadence);
        if (
          typeof parsed.step === "number" &&
          !new URLSearchParams(window.location.search).get("step")
        ) {
          const restoredStep = Math.min(Math.max(0, parsed.step), STEPS.length - 1);
          setStep(restoredStep);
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("step", String(restoredStep));
            window.history.replaceState({ step: restoredStep }, "", url.toString());
          }
        }
        setLastSaved(new Date());
      }
    } catch {}
  }, []);

  // Save draft on change to localStorage + sessionStorage
  useEffect(() => {
    try {
      const hasContent = Boolean(
        name ||
          jdText ||
          (numberOfOpenings && numberOfOpenings !== "0" && numberOfOpenings !== 0) ||
          salaryMin ||
          salaryMax ||
          offerTemplateText ||
          rounds.length > 1,
      );
      if (hasContent) {
        const payload = JSON.stringify({
          step,
          name,
          jdText,
          location,
          workArrangement,
          openingDate,
          closingDate,
          numberOfOpenings: numberOfOpenings === "" ? 0 : Number(numberOfOpenings),
          salaryMin,
          salaryMax,
          salaryCurrency,
          salaryPeriod,
          numberOfRounds,
          startDate,
          endDate,
          offerTemplateText,
          offerTemplateFileName,
          offerTemplateVariables,
          rounds,
          whatsappOn,
          voiceOn,
          dialnexaConfig,
          customCadence,
        });
        localStorage.setItem("scalepods_campaign_wizard_draft", payload);
        sessionStorage.setItem("scalepods_campaign_wizard_draft", payload);
        setLastSaved(new Date());
      }
    } catch {}
  }, [
    step,
    name,
    jdText,
    location,
    workArrangement,
    openingDate,
    closingDate,
    numberOfOpenings,
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryPeriod,
    numberOfRounds,
    startDate,
    endDate,
    offerTemplateText,
    offerTemplateFileName,
    offerTemplateVariables,
    rounds,
    whatsappOn,
    voiceOn,
    dialnexaConfig,
    customCadence,
  ]);

  const handleClearDraft = () => {
    try {
      localStorage.removeItem("scalepods_campaign_wizard_draft");
      sessionStorage.removeItem("scalepods_campaign_wizard_draft");
    } catch {}
    setName("");
    setJdText("");
    setLocation("Remote");
    setWorkArrangement("remote");
    setNumberOfOpenings("0");
    setSalaryMin("");
    setSalaryMax("");
    setNumberOfRounds(1);
    setRounds([DEFAULT_ROUND]);
    setCustomCadence({});
    setOfferTemplateText("");
    setOfferTemplateFileName("");
    setLastSaved(null);
    goToStep(0, false);
    toast.success("Draft cleared.");
  };

  useEffect(() => {
    setRounds((prev) => syncRoundCount(prev, numberOfRounds));
  }, [numberOfRounds]);

  useEffect(() => {
    if (tierConfig.overageBehavior === "hard_stop" && numberOfRounds > tierConfig.maxRounds) {
      setNumberOfRounds(tierConfig.maxRounds);
    }
  }, [tierConfig, numberOfRounds]);

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team_members_with_calendar"] as const,
    queryFn: async () => {
      const supabase = supabaseBrowser();
      const [membersRes, calRes] = await Promise.all([
        supabase.from("team_members").select("id,name,email,role").order("name"),
        supabase
          .from("interviewer_calendar_connections")
          .select("team_member_id,status,google_email"),
      ]);
      const calMap = new Map((calRes.data ?? []).map((c) => [c.team_member_id, c]));
      return (membersRes.data ?? []).map((m) => ({
        ...m,
        calendar_status: calMap.get(m.id)?.status ?? "not_connected",
        google_email: calMap.get(m.id)?.google_email,
      }));
    },
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadingOfferDoc, setUploadingOfferDoc] = useState(false);

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    toast.loading(`Extracting text from ${file.name}...`, { id: "doc-upload" });
    try {
      const res = await extractTextFromFile(file);
      if ("error" in res) {
        toast.error(res.error, { id: "doc-upload" });
      } else if (res.text && res.text.trim()) {
        setJdText(res.text.trim());
        toast.success(`Loaded Job Description from ${file.name}!`, { id: "doc-upload" });
      } else {
        toast.error("No extractable text found in this document.", { id: "doc-upload" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse document.", {
        id: "doc-upload",
      });
    } finally {
      setUploadingDoc(false);
      e.target.value = "";
    }
  };

  const handleOfferDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingOfferDoc(true);
    toast.loading(`Extracting template text from ${file.name}...`, { id: "offer-doc-upload" });
    try {
      const res = await extractTextFromFile(file);
      if ("error" in res) {
        toast.error(res.error, { id: "offer-doc-upload" });
      } else if (res.text && res.text.trim()) {
        const text = res.text.trim();
        setOfferTemplateText(text);
        setOfferTemplateFileName(file.name);

        // Auto-detect dynamic variables from template text (e.g. {{VARIABLE_NAME}})
        const matches = text.match(/\{\{([A-Za-z0-9_]+)\}\}/g) || [];
        const standardToExclude = new Set([
          "VARIABLE",
          "COMPANY_LOGO_PATH",
          "COMPANY_NAME",
          "COMPANY_WEBSITE",
          "COMPANY_EMAIL",
          "REF_NO",
          "ISSUE_DATE",
          "CANDIDATE_NAME",
          "ROLE",
          "POSITION_TITLE",
          "SALARY",
          "COMPENSATION",
          "CURRENCY",
          "START_DATE",
          "JOINING_DATE",
          "SPECIAL_TERMS",
        ]);
        const foundVars = Array.from(
          new Set(
            matches
              .map((m) => m.replace(/[{}]/g, "").trim().toUpperCase())
              .filter((v) => !standardToExclude.has(v)),
          ),
        );
        if (foundVars.length > 0) {
          setOfferTemplateVariables((prev) => Array.from(new Set([...prev, ...foundVars])));
        }
        toast.success(
          `Loaded Offer Template from ${file.name} (${foundVars.length} dynamic variables detected)!`,
          {
            id: "offer-doc-upload",
          },
        );
      } else {
        toast.error("No extractable text found in this template document.", {
          id: "offer-doc-upload",
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse document.", {
        id: "offer-doc-upload",
      });
    } finally {
      setUploadingOfferDoc(false);
      e.target.value = "";
    }
  };

  const handleOpeningDateChange = (val: string) => {
    setOpeningDate(val);
    setStartDate(val);
    // If closing date is earlier than new opening date, advance closing date to opening date + 30 days
    if (val && closingDate && closingDate < val) {
      const d = new Date(val);
      d.setDate(d.getDate() + 30);
      const nextClosing = d.toISOString().split("T")[0];
      setClosingDate(nextClosing);
      setEndDate(nextClosing);
    }
  };

  const handleClosingDateChange = (val: string) => {
    if (openingDate && val && val < openingDate) {
      toast.error("Closing date cannot be earlier than opening date.");
      return;
    }
    setClosingDate(val);
    setEndDate(val);
  };

  const updateRound = (i: number, patch: Partial<RoundDraft>) =>
    setRounds((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const durationDays = useMemo(() => {
    if (!startDate || !endDate) return null;
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
    const diffDays = Math.round((e - s) / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  }, [startDate, endDate]);

  /** Campaign window in hours — used by the cadence validation engine. */
  const durationHours = durationDays != null ? durationDays * 24 : null;

  const previewRows: CadenceRenderRow[] = useMemo(() => {
    const types = new Set<RoundType>(rounds.slice(0, numberOfRounds).map((r) => r.round_type));
    const merged = new Map<string, CadenceRenderRow>();
    for (const t of types) {
      const tierRows = filterCadenceByDuration(cadenceForTier(tier, t), durationDays);
      for (const row of tierRows) {
        const activeChannels = row.channels.filter((c) => {
          if (c === "whatsapp" && !whatsappOn) return false;
          if (c === "voice_call" && !voiceOn) return false;
          return true;
        });
        const isEnabled = row.enabled && activeChannels.length > 0;

        const existing = merged.get(row.stage.key);
        if (!existing) {
          merged.set(row.stage.key, {
            stage: row.stage,
            channels: activeChannels,
            enabled: isEnabled,
          });
        } else {
          existing.channels = Array.from(new Set([...existing.channels, ...activeChannels]));
          existing.enabled = (existing.enabled || isEnabled) && existing.channels.length > 0;
        }
      }
    }

    for (const r of userAddedStages) {
      merged.set(r.stage.key, r);
    }

    const finalRows = Array.from(merged.values()).sort((a, b) => {
      const idxA = CADENCE_STAGES.findIndex((s) => s.key === a.stage.key);
      const idxB = CADENCE_STAGES.findIndex((s) => s.key === b.stage.key);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    return finalRows.map((r) => {
      const custom = customCadence[r.stage.key];
      if (!custom) return r;
      return {
        ...r,
        stage: {
          ...r.stage,
          label: custom.label ?? r.stage.label,
          dayLabel: custom.dayLabel ?? r.stage.dayLabel,
        },
        enabled: custom.enabled ?? r.enabled,
        channels: custom.channels ?? r.channels,
      };
    });
  }, [
    rounds,
    numberOfRounds,
    tier,
    whatsappOn,
    voiceOn,
    customCadence,
    userAddedStages,
    durationDays,
  ]);

  /**
   * Per-stage warnings when configured timing falls outside the campaign window.
   * Keyed by stageKey for fast lookup in CadencePreview.
   */
  const timingWarnings = useMemo<Record<string, CadenceTimingWarning>>(() => {
    if (durationHours == null) return {};
    const config = {
      stages: Object.fromEntries(
        Object.entries(customCadence).map(([k, v]) => [
          k,
          {
            enabled: v.enabled ?? true,
            channels: v.channels ?? [],
            hoursBefore: v.hoursBefore,
            dayOffset: v.dayOffset,
            sendHour: v.sendHour,
            sendTime: v.sendTime,
          },
        ]),
      ),
    };
    const warnings = validateCadenceTiming(
      config as Parameters<typeof validateCadenceTiming>[0],
      durationHours,
    );
    return Object.fromEntries(warnings.map((w) => [w.stageKey, w]));
  }, [customCadence, durationHours]);

  const currentChangesCount = Object.keys(customCadence).length + userAddedStages.length;
  const maxChanges = cadenceTierEditability(tier).maxChanges;

  const checkMaxChanges = (stageKey?: string): boolean => {
    if (stageKey && customCadence[stageKey]) return true; // Already changing this stage
    if (maxChanges !== null && currentChangesCount >= maxChanges) {
      showErrorToast(
        `Your ${tierConfig.label} plan allows up to ${maxChanges} cadence changes. Please upgrade to customize further.`,
      );
      return false;
    }
    return true;
  };

  const handleToggleStage = (stageKey: string, enabled: boolean) => {
    if (!checkMaxChanges(stageKey)) return;
    setCustomCadence((prev) => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], enabled },
    }));
  };

  const handleToggleChannel = (stageKey: string, channel: CadenceChannel, enabled: boolean) => {
    if (!checkMaxChanges(stageKey)) return;
    const currentRow = previewRows.find((r) => r.stage.key === stageKey);
    if (!currentRow) return;

    setCustomCadence((prev) => {
      let newChannels = [...currentRow.channels];
      if (enabled) {
        if (!newChannels.includes(channel)) newChannels.push(channel);
      } else {
        newChannels = newChannels.filter((c) => c !== channel);
      }
      return {
        ...prev,
        [stageKey]: { ...prev[stageKey], channels: newChannels },
      };
    });
  };

  const handleChangeDayLabel = (stageKey: string, newDayLabel: string) => {
    if (!checkMaxChanges(stageKey)) return;
    setCustomCadence((prev) => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], dayLabel: newDayLabel },
    }));
  };

  const handleChangeLabel = (stageKey: string, newLabel: string) => {
    if (!checkMaxChanges(stageKey)) return;
    setCustomCadence((prev) => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], label: newLabel },
    }));
  };

  const handleChangeTiming = (
    stageKey: string,
    timing: { hoursBefore?: number; sendHour?: number; dayOffset?: number; sendTime?: string },
  ) => {
    if (!checkMaxChanges(stageKey)) return;
    setCustomCadence((prev) => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], ...timing },
    }));
  };

  const handleAddCustomStage = (dayLabel: string, label: string) => {
    if (!checkMaxChanges()) return;
    const key = `custom_${Date.now()}`;
    const newStage: CadenceRenderRow = {
      stage: {
        key,
        label,
        dayLabel,
        description: "Custom campaign touchpoint.",
        channels: ["email", "whatsapp", "voice_call"],
        appliesTo: [],
      },
      channels: [
        "email",
        ...(whatsappOn ? ["whatsapp" as CadenceChannel] : []),
        ...(voiceOn ? ["voice_call" as CadenceChannel] : []),
      ],
      enabled: true,
    };
    setUserAddedStages((prev) => [...prev, newStage]);
  };

  const validateBasics = (): string | null => {
    if (!name.trim()) {
      document.getElementById("campaign-name")?.focus();
      return "Please enter a descriptive campaign name.";
    }
    if (!jdText.trim()) {
      document.getElementById("jd")?.focus();
      return "Please paste the job description to enable AI candidate screening.";
    }
    if (!location.trim()) {
      document.getElementById("location")?.focus();
      return "Please specify the job location (e.g. Remote, San Francisco, CA).";
    }
    if (!openingDate) return "Please specify an opening date.";
    if (!closingDate) return "Please specify a closing date.";
    if (closingDate < openingDate)
      return "Target closing date must be scheduled after the opening date.";
    if (
      numberOfOpenings === "" ||
      Number(numberOfOpenings) < 0 ||
      Number.isNaN(Number(numberOfOpenings))
    ) {
      return "Please specify a valid number of openings (0 or more).";
    }
    if ((salaryMin && !salaryMax) || (!salaryMin && salaryMax))
      return "Both minimum and maximum salary must be provided if specifying a salary range.";
    if (salaryMin && salaryMax && Number(salaryMin) > Number(salaryMax))
      return "Minimum salary cannot exceed maximum salary.";
    return null;
  };

  const validateRounds = (): string | null => {
    let aiCount = 0;
    for (let i = 0; i < numberOfRounds; i++) {
      const r = rounds[i];
      if (r.round_type === "ai_interview") {
        aiCount++;
      }
      if (r.round_type === "human_interview") {
        if (!r.interviewer_email.trim()) {
          return `Round ${i + 1} (Live Human Interview): Please select an interviewer from your team.`;
        }
        if (teamMembers.length === 0) {
          return `Round ${i + 1} (Live Human Interview): No team members found in your workspace. Please add a teammate in Settings before creating a Human Interview round.`;
        }
        const memberExists = teamMembers.some(
          (m) => m.email.toLowerCase() === r.interviewer_email.trim().toLowerCase(),
        );
        if (!memberExists) {
          return `Round ${i + 1} (Live Human Interview): Selected interviewer must be a member of your team.`;
        }
      }
      if (r.round_type === "assignment" && !r.brief_text.trim()) {
        return `Round ${i + 1} (Practical Assignment): Please provide the prompt and submission instructions.`;
      }
    }
    if (aiCount > 1) {
      return "You can only have one AI Interview round per campaign. Human interviews and assignments can be used multiple times.";
    }
    return null;
  };

  const submit = async () => {
    const payload = {
      action: "create",
      account_id: account?.id ?? "",
      name,
      jd_text: jdText,
      location,
      work_arrangement: workArrangement,
      opening_date: openingDate,
      closing_date: closingDate,
      number_of_openings: Math.max(0, parseInt(String(numberOfOpenings), 10) || 0),
      salary_min: salaryMin ? Number(salaryMin) : undefined,
      salary_max: salaryMax ? Number(salaryMax) : undefined,
      salary_currency: salaryMin && salaryMax ? salaryCurrency : undefined,
      salary_period: salaryMin && salaryMax ? salaryPeriod : undefined,
      number_of_rounds: numberOfRounds,
      start_date: startDate || openingDate || undefined,
      end_date: endDate || closingDate || undefined,
      cadence_config: {
        stages: Object.fromEntries(
          previewRows.map((r) => [
            r.stage.key,
            {
              enabled: r.enabled,
              channels: r.channels,
              label: r.stage.label,
              dayLabel: r.stage.dayLabel,
              dayOffset: customCadence[r.stage.key]?.dayOffset,
              hoursBefore: customCadence[r.stage.key]?.hoursBefore,
              sendHour: customCadence[r.stage.key]?.sendHour,
              sendTime: customCadence[r.stage.key]?.sendTime,
            },
          ]),
        ),
        offer_template:
          offerTemplateText.trim() || offerTemplateVariables.length > 0
            ? {
                file_name: offerTemplateFileName || "ScalePods_Offer_Letter_TEMPLATE.pdf",
                text: offerTemplateText.trim(),
                uploaded_at: new Date().toISOString(),
                variables: offerTemplateVariables,
              }
            : undefined,
      },
      voice_call_config: voiceOn ? dialnexaConfig : undefined,
      rounds: rounds.slice(0, numberOfRounds).map((r, i) => ({
        round_number: i + 1,
        round_type: r.round_type,
        interviewer_email:
          r.round_type === "human_interview" ? r.interviewer_email || null : undefined,
        cutoff_score: r.cutoff_score,
        daily_start_time:
          r.round_type === "ai_interview" ||
          r.round_type === "human_interview" ||
          r.round_type === "ai_voice_call"
            ? r.daily_start_time || null
            : undefined,
        daily_end_time:
          r.round_type === "ai_interview" ||
          r.round_type === "human_interview" ||
          r.round_type === "ai_voice_call"
            ? r.daily_end_time || null
            : undefined,
        brief_text: r.round_type === "assignment" ? r.brief_text.trim() || null : undefined,
        assignment_deadline_hours:
          r.round_type === "assignment" ? r.assignment_deadline_hours : undefined,
        duration_minutes: r.round_type === "assignment" ? undefined : 30,
        questions:
          r.round_type === "ai_interview" || r.round_type === "ai_voice_call"
            ? [
                "Tell me about your technical background and experience.",
                "Describe how you handle ambiguous requirements.",
              ]
            : undefined,
        evaluation_criteria:
          r.round_type === "ai_interview" ||
          r.round_type === "ai_voice_call" ||
          r.round_type === "assignment"
            ? ["Technical Competency", "Communication", "Problem Solving"]
            : undefined,
      })),
    };
    const parsed = campaignCreateSchema.safeParse(payload);
    if (!parsed.success) {
      showErrorToast(
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · "),
      );
      return;
    }
    setSubmitting(true);
    try {
      const token = supabaseBrowser()
        ? (await supabaseBrowser().auth.getSession()).data.session?.access_token
        : undefined;
      const res = await callWorkflow<CampaignCreated>("campaigns", {
        body: parsed.data,
        accessToken: token,
      });
      let createdId: string | null = null;
      if (typeof res?.campaign_id === "string") createdId = res.campaign_id;
      if (typeof res?.id === "string") createdId = res.id;
      if (!createdId) {
        let query = supabaseBrowser()
          .from("campaigns")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1);
        if (account?.id) {
          query = query.eq("account_id", account.id);
        }
        const { data } = await query.maybeSingle();
        createdId = data?.id ?? null;
      }

      if (createdId) {
        const updateFields: Database["public"]["Tables"]["campaigns"]["Update"] = {
          location,
          work_arrangement: workArrangement,
          opening_date: openingDate,
          closing_date: closingDate,
          number_of_openings: Math.max(0, parseInt(String(numberOfOpenings), 10) || 0),
        };
        if (salaryMin && salaryMax) {
          updateFields.salary_min = Number(salaryMin);
          updateFields.salary_max = Number(salaryMax);
          updateFields.salary_currency = salaryCurrency;
          updateFields.salary_period = salaryPeriod;
        }
        if (voiceOn) {
          updateFields.voice_call_config = dialnexaConfig as unknown as Json;
        }
        if (payload.cadence_config) {
          updateFields.cadence_config = payload.cadence_config as unknown as Json;
        }
        if (Object.keys(updateFields).length > 0) {
          await supabaseBrowser().from("campaigns").update(updateFields).eq("id", createdId);
        }
      }

      await queryClient.invalidateQueries({ queryKey: campaignsKey });

      try {
        localStorage.removeItem("scalepods_campaign_wizard_draft");
        sessionStorage.removeItem("scalepods_campaign_wizard_draft");
      } catch {}

      if (onSuccess) {
        onSuccess(createdId ?? undefined);
      } else if (createdId) {
        router.push(`/campaigns/${createdId}`);
      } else {
        router.push("/campaigns");
      }
    } catch (err) {
      showErrorToast(err);
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step === 0) {
      const err = validateBasics();
      if (err) {
        toast.error(err);
        return;
      }
    }
    if (step === 1) {
      const err = validateRounds();
      if (err) {
        toast.error(err);
        return;
      }
    }
    goToStep(step + 1, true);
  };

  const prev = () => {
    if (step > 0) {
      goToStep(step - 1, false);
    } else {
      if (onCancel) onCancel();
      else router.push("/campaigns");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Wizard Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              AI Campaign Creation Studio
            </div>
            {lastSaved && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="h-3 w-3" />
                Draft auto-saved
              </span>
            )}
          </div>
          <h2 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Launch a New Hiring Campaign
          </h2>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            Active Subscription:{" "}
            <span className="font-semibold text-foreground capitalize">{tierConfig.label}</span> ·
            Supports up to {tierConfig.maxRounds} interview stages per role.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          <HowToCreateButton target="_blank" />
          {lastSaved && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearDraft}
              className="h-9 gap-1 rounded-full text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              Clear Draft
            </Button>
          )}
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-9 gap-1.5 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
              Exit Setup
            </Button>
          )}
        </div>
      </div>

      <StepsBar step={step} />

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-7 shadow-xs">
        {/* Step Title & Guidance */}
        <div className="mb-6 border-b border-border pb-5">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {step + 1}
            </span>
            <h3 className="text-lg font-bold text-foreground tracking-tight">{STEPS[step]}</h3>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            {step === 0
              ? "Provide role details, key responsibilities, and dates. ScalePods AI will calibrate resume screening rubrics and automated interview questions directly against this job description."
              : step === 1
                ? "Structure the evaluation pipeline for this position. Select the format for each interview round (AI autonomous interviews, AI voice screening calls, human recruiter meetings, or practical assignments). Cutoff thresholds are evaluated post-round."
                : "Choose how candidates are engaged and kept informed throughout the process. Multi-channel automated touchpoints ensure prompt scheduling and high completion rates."}
          </p>
        </div>

        {/* ── Step 0: Basics & JD ── */}
        {step === 0 ? (
          <div className="space-y-6">
            <div>
              <label
                htmlFor="campaign-name"
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Campaign Name & Role Title *
              </label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Senior Full-Stack Engineer — Platform Team"
                className="rounded-xl text-foreground font-medium"
              />
              <span className="mt-1.5 block text-xs text-muted-foreground">
                A descriptive title used for internal reporting and visible to applicants on
                invitation portals.
              </span>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="jd" className="text-xs font-semibold text-foreground">
                  Job Description & Qualification Rubric *
                </label>
                <span className="text-xs text-muted-foreground font-mono">
                  {jdText.length > 0 ? `${jdText.length} characters` : "Required"}
                </span>
              </div>
              <Textarea
                id="jd"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                rows={9}
                placeholder="Paste the comprehensive job description here... Include:&#10;• Core technical skills (languages, frameworks, tools)&#10;• Key responsibilities & expectations&#10;• Required years of experience & qualifications&#10;• Nice-to-have background attributes"
                className="rounded-xl text-foreground font-normal leading-relaxed"
              />
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  ScalePods AI uses this JD to automatically generate custom candidate evaluation
                  scores (0-100).
                </p>
                <label
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-xs",
                    uploadingDoc && "opacity-60 pointer-events-none",
                  )}
                >
                  {uploadingDoc ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
                  ) : (
                    <Upload className="h-3.5 w-3.5 text-primary" aria-hidden />
                  )}
                  {uploadingDoc ? "Extracting text..." : "Upload Document"}
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.md"
                    className="hidden"
                    onChange={handleDocUpload}
                    disabled={uploadingDoc}
                  />
                </label>
              </div>
            </div>

            {/* Job Details & Requirements */}
            <div className="grid gap-5 sm:grid-cols-3 pt-2 border-t border-border">
              <div>
                <label
                  htmlFor="job-location"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Location *
                </label>
                <Input
                  id="job-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Remote, San Francisco, CA"
                  className="rounded-xl text-foreground"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Primary office or geographic base
                </span>
              </div>

              <div>
                <label
                  htmlFor="work-arrangement"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Work Arrangement *
                </label>
                <Select
                  value={workArrangement}
                  onValueChange={(val) => setWorkArrangement(val as "remote" | "hybrid" | "onsite")}
                >
                  <SelectTrigger id="work-arrangement" className="rounded-xl">
                    <SelectValue placeholder="Select arrangement" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="remote">Remote (Worldwide / Distributed)</SelectItem>
                    <SelectItem value="hybrid">Hybrid (Mix of office & remote)</SelectItem>
                    <SelectItem value="onsite">On-site (Full-time in office)</SelectItem>
                  </SelectContent>
                </Select>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Expectation for physical presence
                </span>
              </div>

              <div>
                <label
                  htmlFor="number-of-openings"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Number of Openings (Capacity) *
                </label>
                <Input
                  id="number-of-openings"
                  type="number"
                  min={0}
                  value={numberOfOpenings}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setNumberOfOpenings("");
                      return;
                    }
                    const clean = raw.replace(/^0+(?=\d)/, "");
                    const parsed = parseInt(clean, 10);
                    if (!Number.isNaN(parsed) && parsed >= 0) {
                      setNumberOfOpenings(clean === "0" ? 0 : parsed);
                    }
                  }}
                  onBlur={() => {
                    if (
                      numberOfOpenings === "" ||
                      Number.isNaN(Number(numberOfOpenings)) ||
                      Number(numberOfOpenings) < 0
                    ) {
                      setNumberOfOpenings(0);
                    }
                  }}
                  className="rounded-xl text-foreground"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Positions to fill before capacity warning (0 for continuous / unlimited)
                </span>
              </div>
            </div>

            {/* Compensation (Optional) */}
            <div className="grid gap-4 sm:grid-cols-4 pt-2 border-t border-border">
              <div>
                <label
                  htmlFor="salary-min"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Minimum Salary
                </label>
                <Input
                  id="salary-min"
                  type="number"
                  min={0}
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="e.g. 120000"
                  className="rounded-xl text-foreground"
                />
              </div>

              <div>
                <label
                  htmlFor="salary-max"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Maximum Salary
                </label>
                <Input
                  id="salary-max"
                  type="number"
                  min={0}
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="e.g. 160000"
                  className="rounded-xl text-foreground"
                />
              </div>

              <div>
                <label
                  htmlFor="salary-currency"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Currency
                </label>
                <Select value={salaryCurrency} onValueChange={(val) => setSalaryCurrency(val)}>
                  <SelectTrigger id="salary-currency" className="rounded-xl">
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="CAD">CAD ($)</SelectItem>
                    <SelectItem value="AUD">AUD ($)</SelectItem>
                    <SelectItem value="INR">INR (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="salary-period"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Period
                </label>
                <Select
                  value={salaryPeriod}
                  onValueChange={(val) => setSalaryPeriod(val as "annual" | "monthly" | "hourly")}
                >
                  <SelectTrigger id="salary-period" className="rounded-xl">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="annual">Per Year (Annual)</SelectItem>
                    <SelectItem value="monthly">Per Month</SelectItem>
                    <SelectItem value="hourly">Per Hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 pt-2 border-t border-border">
              <div>
                <label
                  htmlFor="rounds"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Total Evaluation Stages (Rounds)
                </label>
                <Select
                  value={String(numberOfRounds)}
                  onValueChange={(val) => setNumberOfRounds(Number(val))}
                >
                  <SelectTrigger id="rounds" className="rounded-xl">
                    <SelectValue placeholder="Stages" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    {Array.from(
                      {
                        length:
                          tierConfig.overageBehavior === "hard_stop" ? tierConfig.maxRounds : 6,
                      },
                      (_, i) => i + 1,
                    ).map((n) => {
                      const over = n > tierConfig.maxRounds;
                      const hardStop = tierConfig.overageBehavior === "hard_stop";
                      return (
                        <SelectItem key={n} value={String(n)} disabled={hardStop && over}>
                          {n}{" "}
                          {n === 1
                            ? "Round (Single stage screening)"
                            : `Rounds (Multi-stage evaluation)`}
                          {over
                            ? hardStop
                              ? ` — (Requires plan upgrade)`
                              : " — (Billed as metered overage)"
                            : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {numberOfRounds > tierConfig.maxRounds ? (
                  <p className="mt-1.5 text-xs text-warning font-medium">
                    {tierConfig.overageBehavior === "metered"
                      ? `Exceeds the ${tierConfig.maxRounds} rounds included in your plan — extra stages will be billed as metered usage.`
                      : `Your current plan supports up to ${tierConfig.maxRounds} rounds. Please upgrade your plan in Billing to add more.`}
                  </p>
                ) : (
                  <span className="mt-1.5 block text-xs text-muted-foreground">
                    Number of consecutive rounds candidates must clear to reach final hire.
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="start-date"
                    className="mb-1.5 block text-xs font-semibold text-foreground"
                  >
                    Opening Date
                  </label>
                  <DatePicker
                    id="start-date"
                    value={openingDate}
                    onChange={handleOpeningDateChange}
                    minDate={new Date()}
                    placeholder="Select opening date"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    Intake begins
                  </span>
                </div>
                <div>
                  <label
                    htmlFor="end-date"
                    className="mb-1.5 block text-xs font-semibold text-foreground"
                  >
                    Closing Date
                  </label>
                  <DatePicker
                    id="end-date"
                    value={closingDate}
                    onChange={handleClosingDateChange}
                    minDate={openingDate ? new Date(openingDate) : new Date()}
                    placeholder="Select closing date"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    Decisions deadline
                  </span>
                </div>
                {durationDays !== null && (
                  <div className="col-span-1 sm:col-span-2 flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-3.5 py-2 text-xs text-primary">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>
                      Campaign Duration:{" "}
                      <strong>
                        {durationDays} {durationDays === 1 ? "day" : "days"}
                      </strong>
                    </span>
                    {durationDays <= 3 && (
                      <span className="text-[11px] text-muted-foreground ml-auto hidden sm:inline">
                        Communication cadence will automatically fit within {durationDays}{" "}
                        {durationDays === 1 ? "day" : "days"}.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Offer Letter & NDA Agreement Template */}
            <div className="pt-4 border-t border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FileSignature className="h-4 w-4 text-primary" />
                    Offer Letter & NDA Agreement Template (Optional)
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
                    Upload your company&apos;s pre-signed offer letter or NDA (PDF, DOCX, or TXT).
                    ScalePods&apos; AI will automatically detect and populate dynamic candidate
                    variables (name, compensation, start date) when extending an offer.
                  </p>
                </div>
                <div className="shrink-0">
                  <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                    {uploadingOfferDoc ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {uploadingOfferDoc
                      ? "Extracting..."
                      : offerTemplateFileName
                        ? "Replace Document"
                        : "Upload Template"}
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.txt,.md"
                      className="hidden"
                      onChange={handleOfferDocUpload}
                      disabled={uploadingOfferDoc}
                    />
                  </label>
                </div>
              </div>

              {offerTemplateFileName ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs mb-3">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-medium text-foreground truncate">
                      {offerTemplateFileName}
                    </span>
                    <span className="text-muted-foreground text-[11px] shrink-0">
                      ({offerTemplateText.length} characters extracted)
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setOfferTemplateFileName("");
                      setOfferTemplateText("");
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}

              {/* Dynamic Variables Configuration UI */}
              <div className="rounded-xl border border-border bg-card/60 p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Dynamic Offer Letter Variables
                    </span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Specify the dynamic variables for your offer letter. When generating an offer
                      for a candidate, you will be prompted to fill in these values.
                    </p>
                  </div>
                </div>

                {/* Variable Badges / Tags */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {offerTemplateVariables.map((v) => (
                    <span
                      key={v}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs font-mono font-medium text-primary"
                    >
                      <span>{`{{${v}}}`}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setOfferTemplateVariables((prev) => prev.filter((item) => item !== v))
                        }
                        className="text-primary/60 hover:text-destructive transition-colors ml-0.5"
                        title={`Remove {{${v}}}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {offerTemplateVariables.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">
                      No custom variables defined.
                    </span>
                  )}
                </div>

                {/* Add Custom Variable Input + Presets */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                    <Input
                      value={newVariableInput}
                      onChange={(e) => setNewVariableInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = newVariableInput
                            .trim()
                            .toUpperCase()
                            .replace(/[{}]/g, "")
                            .replace(/\s+/g, "_");
                          if (val && !offerTemplateVariables.includes(val)) {
                            setOfferTemplateVariables((prev) => [...prev, val]);
                            setNewVariableInput("");
                          }
                        }
                      }}
                      placeholder="e.g. REPORTING_MANAGER, BONUS_PERCENT..."
                      className="h-8 text-xs font-mono"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2.5 text-xs shrink-0"
                      onClick={() => {
                        const val = newVariableInput
                          .trim()
                          .toUpperCase()
                          .replace(/[{}]/g, "")
                          .replace(/\s+/g, "_");
                        if (val && !offerTemplateVariables.includes(val)) {
                          setOfferTemplateVariables((prev) => [...prev, val]);
                          setNewVariableInput("");
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <span>Quick presets:</span>
                    {[
                      "DEPARTMENT",
                      "LOCATION",
                      "PROBATION_PERIOD",
                      "DURATION",
                      "REPORTING_MANAGER",
                    ].map(
                      (preset) =>
                        !offerTemplateVariables.includes(preset) && (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setOfferTemplateVariables((prev) => [...prev, preset])}
                            className="px-2 py-0.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-[11px] text-foreground transition-colors"
                          >
                            + {preset}
                          </button>
                        ),
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Step 1: Rounds Configuration ── */}
        {step === 1 ? (
          <div className="space-y-6">
            <div className="flex items-center gap-2 rounded-xl bg-accent/40 border border-primary/20 p-3.5 text-xs text-muted-foreground">
              <Info className="h-4 w-4 text-primary shrink-0" />
              <span>
                Each round operates sequentially. Candidates complete the round format configured
                below, and detailed AI evaluation scorecards are generated. Cutoff thresholds and
                advancement decisions are set post-round in your review dashboard.
              </span>
            </div>

            {rounds.slice(0, numberOfRounds).map((r, i) => (
              <RoundEditor
                key={r.id}
                index={i}
                round={r}
                tier={tier}
                teamMembers={teamMembers}
                onChange={(patch) => updateRound(i, patch)}
              />
            ))}
          </div>
        ) : null}

        {/* ── Step 2: Outreach & Cadence ── */}
        {step === 2 ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Outreach & Reminder Channels
              </h4>
              <ChannelToggle
                label="Automated Email Notifications"
                description="Sends invitations, self-scheduling calendar links, reminders, and outcome updates via email."
                checked
                disabled
                onCheckedChange={() => {}}
              />
              <ChannelToggle
                label="WhatsApp Instant Messaging"
                description="Delivers automated interview reminder alerts and direct portal links via WhatsApp for 3× faster candidate response rates."
                checked={whatsappOn}
                disabled={!tierConfig.whatsapp}
                lockText={
                  !tierConfig.whatsapp ? "Available on the Basic plan and above" : undefined
                }
                onCheckedChange={setWhatsappOn}
              />
              <ChannelToggle
                label="AI Voice Screening Phone Call"
                description="ScalePods conversational AI initiates a 5-minute automated phone screening ahead of Round 1 to verify candidate communication and availability."
                checked={voiceOn}
                disabled={!tierConfig.voiceScreening}
                lockText={
                  !tierConfig.voiceScreening ? "Available on the Basic plan and above" : undefined
                }
                onCheckedChange={setVoiceOn}
              />

              {voiceOn ? (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-3.5 py-2.5 text-xs text-primary font-medium">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <strong>Voice Agent Configuration:</strong> Configure your AI voice screening
                      agent below. This configuration is established during campaign creation, and
                      can be edited after campaign launch with all your settings preserved.
                    </span>
                  </div>
                  <DialnexaConfigEditor
                    value={dialnexaConfig}
                    onChange={setDialnexaConfig}
                    jobTitle={name}
                  />
                </div>
              ) : (
                tierConfig.voiceScreening && (
                  <p className="text-[11px] text-muted-foreground italic px-1">
                    Note: Configure your AI voice agent here or update it anytime from campaign
                    details.
                  </p>
                )
              )}
            </div>

            <div className="pt-5 border-t border-border space-y-3.5">
              <div className="space-y-1.5 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Layers className="h-4 w-4 text-primary shrink-0" />
                  <h4 className="text-sm font-semibold tracking-normal text-foreground">
                    Automated Candidate Communication Cadence
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                  This communication sequence repeats <strong>for each round</strong>. When a
                  candidate passes the AI interview, they are automatically advanced to the next
                  round, and this cadence restarts from Day 0 to invite them to the human interview
                  or assignment.
                </p>
              </div>
              {durationDays !== null && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 text-xs text-primary text-center">
                  <div className="flex flex-wrap items-center justify-center gap-2 text-center">
                    <Calendar className="h-4 w-4 shrink-0 text-primary" />
                    <span className="leading-relaxed">
                      Cadence automatically tailored to your <strong>{durationDays}-day</strong>{" "}
                      campaign duration.
                      {durationDays < 6 ? (
                        <span className="text-muted-foreground ml-1.5 inline-block">
                          (Reminders past Day {durationDays - 1} have been excluded to fit your
                          timeline)
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-semibold bg-primary/20 px-2.5 py-1 rounded-md shrink-0 whitespace-nowrap">
                    {durationDays} {durationDays === 1 ? "day window" : "days window"}
                  </span>
                </div>
              )}
              <div className="mt-3">
                <CadencePreview
                  rows={previewRows}
                  editable={cadenceTierEditability(tier).stages}
                  canEditTiming={cadenceTierEditability(tier).timing}
                  durationHours={durationHours}
                  timingWarnings={timingWarnings}
                  timingConfig={Object.fromEntries(
                    previewRows.map((r) => [
                      r.stage.key,
                      {
                        hoursBefore: customCadence[r.stage.key]?.hoursBefore,
                        sendHour: customCadence[r.stage.key]?.sendHour,
                        dayOffset: customCadence[r.stage.key]?.dayOffset,
                        sendTime: customCadence[r.stage.key]?.sendTime,
                      },
                    ]),
                  )}
                  onToggleStage={handleToggleStage}
                  onToggleChannel={handleToggleChannel}
                  onChangeDayLabel={handleChangeDayLabel}
                  onChangeLabel={handleChangeLabel}
                  onChangeTiming={handleChangeTiming}
                  onAddCustomStage={handleAddCustomStage}
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Action Controls */}
        <div className="mt-8 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 border-t border-border pt-5">
          <Button
            variant="ghost"
            onClick={prev}
            className="w-full sm:w-auto rounded-xl gap-1.5 text-xs font-semibold text-foreground hover:bg-muted justify-center"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {step === 0 ? "Cancel & Return to Campaigns" : "Previous Step"}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={next}
              disabled={canceled}
              className="w-full sm:w-auto rounded-xl gap-1.5 px-5 text-xs font-semibold bg-primary hover:bg-primary/90 text-white shadow-sm justify-center"
            >
              <span>Continue to {step === 0 ? "Interview Rounds" : "Channels"}</span>
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            </Button>
          ) : canceled ? (
            <Button
              disabled
              title="Your plan is canceled — reactivate it in Billing to create campaigns."
              className="w-full sm:w-auto rounded-xl justify-center"
            >
              Reactivate Plan in Billing to Create
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={submitting}
              className="w-full sm:w-auto rounded-xl gap-2 px-6 text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 justify-center"
            >
              {submitting ? "Publishing Campaign…" : "Deploy & Publish Campaign"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground pb-8 sm:pb-4">
        <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
        <span className="leading-relaxed">
          Campaigns are powered by ScalePods automated AI screening and evaluation pipelines.
        </span>
      </div>
    </div>
  );
}
