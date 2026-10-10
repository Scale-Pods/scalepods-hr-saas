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
  Info,
  Layers,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CadencePreview } from "@/components/campaigns/CadencePreview";
import { ChannelToggle } from "@/components/campaigns/ChannelToggle";
import { DialnexaConfigEditor } from "@/components/campaigns/DialnexaConfigEditor";
import { DEFAULT_ROUND, type RoundDraft, RoundEditor } from "@/components/campaigns/RoundEditor";
import { StepsBar } from "@/components/campaigns/StepsBar";
import HowToCreateButton from "@/components/HowToCreateButton";
import { showErrorToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/features/account/hooks";
import { campaignsKey } from "@/features/campaigns/hooks";
import { syncRoundCount } from "@/features/campaigns/rounds";
import { supabaseBrowser } from "@/lib/supabase/client";
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
  const canceled = account?.billing_status === "canceled";

  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const initialStep = stepParam ? parseInt(stepParam, 10) : 0;
  const [step, setStepState] = useState(() =>
    Number.isNaN(initialStep) ? 0 : Math.min(Math.max(0, initialStep), STEPS.length - 1),
  );

  const setStep = (nextVal: number | ((prev: number) => number)) => {
    setStepState((prev) => {
      const nextNum = typeof nextVal === "function" ? nextVal(prev) : nextVal;
      const clamped = Math.max(0, Math.min(nextNum, STEPS.length - 1));
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("step", String(clamped));
        window.history.replaceState(null, "", url.toString());
      }
      return clamped;
    });
  };

  useEffect(() => {
    const sp = searchParams.get("step");
    if (sp) {
      const parsed = parseInt(sp, 10);
      if (!Number.isNaN(parsed) && parsed !== step) {
        setStepState(Math.min(Math.max(0, parsed), STEPS.length - 1));
      }
    }
  }, [searchParams, step]);

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
  const [numberOfOpenings, setNumberOfOpenings] = useState(1);
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

  // Restore draft on refresh
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount to restore draft
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem("scalepods_campaign_wizard_draft");
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.name && !name) setName(parsed.name);
        if (parsed.jdText && !jdText) setJdText(parsed.jdText);
        if (parsed.location) setLocation(parsed.location);
        if (parsed.workArrangement) setWorkArrangement(parsed.workArrangement);
        if (parsed.openingDate) setOpeningDate(parsed.openingDate);
        if (parsed.closingDate) setClosingDate(parsed.closingDate);
        if (parsed.numberOfOpenings) setNumberOfOpenings(parsed.numberOfOpenings);
        if (parsed.salaryMin) setSalaryMin(parsed.salaryMin);
        if (parsed.salaryMax) setSalaryMax(parsed.salaryMax);
        if (parsed.salaryCurrency) setSalaryCurrency(parsed.salaryCurrency);
        if (parsed.salaryPeriod) setSalaryPeriod(parsed.salaryPeriod);
        if (parsed.numberOfRounds) setNumberOfRounds(parsed.numberOfRounds);
        if (parsed.startDate) setStartDate(parsed.startDate);
        if (parsed.endDate) setEndDate(parsed.endDate);
      }
    } catch {}
  }, []);

  // Save draft on change
  useEffect(() => {
    try {
      if (name || jdText) {
        sessionStorage.setItem(
          "scalepods_campaign_wizard_draft",
          JSON.stringify({
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
          }),
        );
      }
    } catch {}
  }, [
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
  ]);

  useEffect(() => {
    setRounds((prev) => syncRoundCount(prev, numberOfRounds));
  }, [numberOfRounds]);

  useEffect(() => {
    if (tierConfig.overageBehavior === "hard_stop" && numberOfRounds > tierConfig.maxRounds) {
      setNumberOfRounds(tierConfig.maxRounds);
    }
  }, [tierConfig, numberOfRounds]);

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team_members"] as const,
    queryFn: async () => {
      const { data } = await supabaseBrowser()
        .from("team_members")
        .select("id,name,email,role")
        .order("name");
      return (data ?? []) as TeamMemberRow[];
    },
    staleTime: 60_000,
  });

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
    if (!name.trim()) return "Please enter a descriptive campaign name.";
    if (!jdText.trim()) return "Please paste the job description to enable AI candidate screening.";
    if (!location.trim())
      return "Please specify the job location (e.g. Remote, San Francisco, CA).";
    if (!openingDate) return "Please specify an opening date.";
    if (!closingDate) return "Please specify a closing date.";
    if (closingDate < openingDate)
      return "Target closing date must be scheduled after the opening date.";
    if (!numberOfOpenings || numberOfOpenings < 1) return "Please specify at least 1 opening.";
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
      if (r.round_type === "human_interview" && !r.interviewer_email.trim()) {
        return `Round ${i + 1} (Live Human Interview): Please provide the interviewer's email address.`;
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
      number_of_openings: numberOfOpenings,
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
          number_of_openings: numberOfOpenings,
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
      if (err) return showErrorToast(err);
    }
    if (step === 1) {
      const err = validateRounds();
      if (err) return showErrorToast(err);
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Wizard Header Banner */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            AI Campaign Creation Studio
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            Launch a New Hiring Campaign
          </h2>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            Active Subscription:{" "}
            <span className="font-semibold text-foreground capitalize">{tierConfig.label}</span> ·
            Supports up to {tierConfig.maxRounds} interview stages per role.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HowToCreateButton target="_blank" />
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

      <div className="rounded-2xl border border-border bg-card p-7 shadow-xs">
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
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                  <Upload className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Upload Document
                  <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" disabled />
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
                <select
                  id="work-arrangement"
                  value={workArrangement}
                  onChange={(e) =>
                    setWorkArrangement(e.target.value as "remote" | "hybrid" | "onsite")
                  }
                  className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                >
                  <option value="remote">Remote (Worldwide / Distributed)</option>
                  <option value="hybrid">Hybrid (Mix of office & remote)</option>
                  <option value="onsite">On-site (Full-time in office)</option>
                </select>
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
                  min={1}
                  value={numberOfOpenings}
                  onChange={(e) =>
                    setNumberOfOpenings(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="rounded-xl text-foreground"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Positions to fill before capacity warning
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
                <select
                  id="salary-currency"
                  value={salaryCurrency}
                  onChange={(e) => setSalaryCurrency(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                  <option value="INR">INR (₹)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="salary-period"
                  className="mb-1.5 block text-xs font-semibold text-foreground"
                >
                  Period
                </label>
                <select
                  id="salary-period"
                  value={salaryPeriod}
                  onChange={(e) =>
                    setSalaryPeriod(e.target.value as "annual" | "monthly" | "hourly")
                  }
                  className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                >
                  <option value="annual">Per Year (Annual)</option>
                  <option value="monthly">Per Month</option>
                  <option value="hourly">Per Hour</option>
                </select>
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
                <select
                  id="rounds"
                  value={numberOfRounds}
                  onChange={(e) => setNumberOfRounds(Number(e.target.value))}
                  className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 dark:bg-card dark:text-foreground"
                >
                  {Array.from(
                    {
                      length: tierConfig.overageBehavior === "hard_stop" ? tierConfig.maxRounds : 6,
                    },
                    (_, i) => i + 1,
                  ).map((n) => {
                    const over = n > tierConfig.maxRounds;
                    const hardStop = tierConfig.overageBehavior === "hard_stop";
                    return (
                      <option
                        key={n}
                        value={n}
                        disabled={hardStop && over}
                        className="bg-card text-foreground dark:bg-gray-900"
                      >
                        {n}{" "}
                        {n === 1
                          ? "Round (Single stage screening)"
                          : `Rounds (Multi-stage evaluation)`}
                        {over
                          ? hardStop
                            ? ` — (Requires plan upgrade)`
                            : " — (Billed as metered overage)"
                          : ""}
                      </option>
                    );
                  })}
                </select>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="start-date"
                    className="mb-1.5 block text-xs font-semibold text-foreground"
                  >
                    Opening Date
                  </label>
                  <Input
                    id="start-date"
                    type="date"
                    value={openingDate}
                    onChange={(e) => {
                      setOpeningDate(e.target.value);
                      setStartDate(e.target.value);
                    }}
                    className="rounded-xl text-foreground"
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
                  <Input
                    id="end-date"
                    type="date"
                    value={closingDate}
                    onChange={(e) => {
                      setClosingDate(e.target.value);
                      setEndDate(e.target.value);
                    }}
                    className="rounded-xl text-foreground"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    Decisions deadline
                  </span>
                </div>
                {durationDays !== null && (
                  <div className="col-span-2 flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-3.5 py-2 text-xs text-primary">
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
        <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-xl gap-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Previous Step
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={next}
              disabled={canceled}
              className="rounded-xl gap-1.5 px-5 text-xs font-semibold bg-primary hover:bg-primary/90 text-white shadow-sm"
            >
              Continue to {step === 0 ? "Interview Rounds" : "Communication Channels"}{" "}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : canceled ? (
            <Button
              disabled
              title="Your plan is canceled — reactivate it in Billing to create campaigns."
              className="rounded-xl"
            >
              Reactivate Plan in Billing to Create
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={submitting}
              className="rounded-xl gap-2 px-6 text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20"
            >
              {submitting ? "Publishing Campaign…" : "Deploy & Publish Campaign"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        <span>
          Campaigns are powered by ScalePods automated AI screening and evaluation pipelines.
        </span>
      </div>
    </div>
  );
}
