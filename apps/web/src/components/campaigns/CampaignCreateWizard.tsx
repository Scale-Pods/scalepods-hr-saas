"use client";

import {
  CADENCE_STAGES,
  type CadenceRenderRow,
  cadenceForTier,
  campaignCreateSchema,
  type RoundType,
  type TeamMemberRow,
  TIER_LIMITS,
} from "@scalepods/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, CheckCircle2, ChevronLeft, ChevronRight, FileText, Info, Layers, Sparkles, Upload, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CadencePreview } from "@/components/campaigns/CadencePreview";
import { ChannelToggle } from "@/components/campaigns/ChannelToggle";
import { DEFAULT_ROUND, type RoundDraft, RoundEditor } from "@/components/campaigns/RoundEditor";
import { StepsBar } from "@/components/campaigns/StepsBar";
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

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [jdText, setJdText] = useState("");
  const [numberOfRounds, setNumberOfRounds] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rounds, setRounds] = useState<RoundDraft[]>([DEFAULT_ROUND]);
  const [whatsappOn, setWhatsappOn] = useState(tierConfig.whatsapp);
  const [voiceOn, setVoiceOn] = useState(tierConfig.voiceScreening);

  useEffect(() => {
    setRounds((prev) => syncRoundCount(prev, numberOfRounds));
  }, [numberOfRounds]);

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

  const previewRows: CadenceRenderRow[] = useMemo(() => {
    const types = new Set<RoundType>(rounds.slice(0, numberOfRounds).map((r) => r.round_type));
    const merged = new Map<string, CadenceRenderRow>();
    for (const t of types) {
      for (const row of cadenceForTier(tier, t)) {
        const existing = merged.get(row.stage.key);
        if (!existing) merged.set(row.stage.key, row);
        else {
          existing.channels = Array.from(new Set([...existing.channels, ...row.channels]));
          existing.enabled = existing.enabled || row.enabled;
        }
      }
    }
    return Array.from(merged.values()).sort(
      (a, b) =>
        CADENCE_STAGES.findIndex((s) => s.key === a.stage.key) -
        CADENCE_STAGES.findIndex((s) => s.key === b.stage.key),
    );
  }, [rounds, numberOfRounds, tier]);

  const validateBasics = (): string | null => {
    if (!name.trim()) return "Please enter a descriptive campaign name.";
    if (!jdText.trim()) return "Please paste the job description to enable AI candidate screening.";
    if (endDate && startDate && endDate < startDate)
      return "Target completion date must be scheduled after the start date.";
    return null;
  };

  const validateRounds = (): string | null => {
    for (let i = 0; i < numberOfRounds; i++) {
      const r = rounds[i];
      if (r.round_type === "human_interview" && !r.interviewer_email.trim()) {
        return `Round ${i + 1} (Live Human Interview): Please provide the interviewer's email address.`;
      }
      if (r.round_type === "assignment" && !r.brief_text.trim()) {
        return `Round ${i + 1} (Practical Assignment): Please provide the prompt and submission instructions.`;
      }
    }
    return null;
  };

  const submit = async () => {
    const payload = {
      action: "create",
      account_id: account?.id ?? "",
      name,
      jd_text: jdText,
      number_of_rounds: numberOfRounds,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      rounds: rounds.slice(0, numberOfRounds).map((r, i) => ({
        round_number: i + 1,
        round_type: r.round_type,
        interviewer_email:
          r.round_type === "human_interview" ? r.interviewer_email || null : undefined,
        cutoff_score: r.cutoff_score,
        daily_start_time:
          r.round_type === "ai_interview" || r.round_type === "human_interview"
            ? r.daily_start_time || null
            : undefined,
        daily_end_time:
          r.round_type === "ai_interview" || r.round_type === "human_interview"
            ? r.daily_end_time || null
            : undefined,
        brief_text: r.round_type === "assignment" ? r.brief_text.trim() || null : undefined,
        assignment_deadline_hours:
          r.round_type === "assignment" ? r.assignment_deadline_hours : undefined,
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
        const { data } = await supabaseBrowser()
          .from("campaigns")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        createdId = data?.id ?? null;
      }

      await queryClient.invalidateQueries({ queryKey: campaignsKey });

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
            Active Subscription: <span className="font-semibold text-foreground capitalize">{tierConfig.label}</span> · Supports up to {tierConfig.maxRounds} interview stages per role.
          </p>
        </div>
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
                ? "Structure the evaluation pipeline for this position. Select the format for each interview round (AI autonomous interviews, human recruiter meetings, or practical assignments) and define minimum passing thresholds."
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
                A descriptive title used for internal reporting and visible to applicants on invitation portals.
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
                  ScalePods AI uses this JD to automatically generate custom candidate evaluation scores (0-100).
                </p>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                  <Upload className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Upload Document
                  <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" disabled />
                </label>
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
                  {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => {
                    const over = n > tierConfig.maxRounds;
                    const hardStop = tierConfig.overageBehavior === "hard_stop";
                    return (
                      <option key={n} value={n} disabled={hardStop && over} className="bg-card text-foreground dark:bg-gray-900">
                        {n} {n === 1 ? "Round (Single stage screening)" : `Rounds (Multi-stage evaluation)`}
                        {over ? (hardStop ? ` — (Requires plan upgrade)` : " — (Billed as metered overage)") : ""}
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
                    Target Start Date
                  </label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-xl text-foreground"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">Intake begins</span>
                </div>
                <div>
                  <label
                    htmlFor="end-date"
                    className="mb-1.5 block text-xs font-semibold text-foreground"
                  >
                    Target End Date
                  </label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-xl text-foreground"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">Decisions deadline</span>
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
                Each round operates sequentially. Candidates must score at or above the designated <strong>Minimum Passing Score</strong> to automatically unlock and advance to the next round.
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
                lockText={!tierConfig.whatsapp ? "Available on the Basic plan and above" : undefined}
                onCheckedChange={setWhatsappOn}
              />
              <ChannelToggle
                label="AI Voice Screening Phone Call"
                description="ScalePods conversational AI initiates a 5-minute automated phone screening ahead of Round 1 to verify candidate communication and availability."
                checked={voiceOn}
                disabled={!tierConfig.voiceScreening}
                lockText={!tierConfig.voiceScreening ? "Available on the Basic plan and above" : undefined}
                onCheckedChange={setVoiceOn}
              />
            </div>

            <div className="pt-4 border-t border-border space-y-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Automated Candidate Communication Cadence
                </h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Here is the sequence of touchpoints and notifications candidates will receive based on your active channels and plan tier:
              </p>
              <div className="mt-3">
                <CadencePreview rows={previewRows} />
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
        <span>Campaigns are powered by ScalePods automated AI screening and evaluation pipelines.</span>
      </div>
    </div>
  );
}
