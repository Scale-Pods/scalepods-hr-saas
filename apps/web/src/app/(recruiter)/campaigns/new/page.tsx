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
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CadencePreview } from "@/components/campaigns/CadencePreview";
import { ChannelToggle } from "@/components/campaigns/ChannelToggle";
import { DEFAULT_ROUND, type RoundDraft, RoundEditor } from "@/components/campaigns/RoundEditor";
import { StepsBar } from "@/components/campaigns/StepsBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { showErrorToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/features/account/hooks";
import { syncRoundCount } from "@/features/campaigns/rounds";
import { supabaseBrowser } from "@/lib/supabase/client";
import { callWorkflow } from "@/lib/webhooks";

interface CampaignCreated {
  campaign_id?: string;
  id?: string;
}

const STEPS = ["Basics", "Rounds", "Reach-out"];

export default function CampaignNewPage() {
  const router = useRouter();
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
    if (!name.trim()) return "Give the campaign a name.";
    if (!jdText.trim()) return "Paste or upload a job description.";
    if (endDate && startDate && endDate < startDate)
      return "End date must be after the start date.";
    return null;
  };

  const validateRounds = (): string | null => {
    for (let i = 0; i < numberOfRounds; i++) {
      const r = rounds[i];
      if (r.round_type === "human_interview" && !r.interviewer_email.trim()) {
        return `Round ${i + 1}: pick an interviewer email.`;
      }
      if (r.round_type === "assignment" && !r.brief_text.trim()) {
        return `Round ${i + 1}: add a brief for the assignment.`;
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
      if (createdId) router.push(`/campaigns/${createdId}`);
      else router.push("/dashboard");
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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New campaign"
        subtitle={`${tierConfig.label} plan · up to ${tierConfig.maxRounds} rounds per campaign`}
      />

      <StepsBar step={step} />

      <SectionCard
        title={STEPS[step]}
        subtitle={
          step === 0
            ? "Job basics. Enforceable limits are applied server-side; these options only filter what you can pick."
            : step === 1
              ? "Configure each round. All rounds converge on the same cutoff check."
              : "How candidates hear from you. Email is always on; other channels follow your plan."
        }
      >
        {step === 0 ? (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="campaign-name"
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                Campaign name
              </label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Senior Product Designer"
              />
            </div>
            <div>
              <label htmlFor="jd" className="mb-1 block text-xs font-medium text-muted-foreground">
                Job description
              </label>
              <Textarea
                id="jd"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                rows={8}
                placeholder="Paste the JD, or upload it below…"
              />
              <div className="mt-2 flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-separator bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-fill-tertiary">
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Upload JD
                  <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" disabled />
                </label>
                <span className="text-xs text-muted-foreground">
                  .pdf · .docx · .txt — extract coming soon, paste for now
                </span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rounds"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Number of rounds
                </label>
                <select
                  id="rounds"
                  value={numberOfRounds}
                  onChange={(e) => setNumberOfRounds(Number(e.target.value))}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => {
                    const over = n > tierConfig.maxRounds;
                    const hardStop = tierConfig.overageBehavior === "hard_stop";
                    return (
                      <option key={n} value={n} disabled={hardStop && over}>
                        {n}
                        {over ? (hardStop ? ` (upgrade for ${n})` : " (billed over cap)") : ""}
                      </option>
                    );
                  })}
                </select>
                {numberOfRounds > tierConfig.maxRounds ? (
                  <p className="mt-1 text-xs text-warning">
                    {tierConfig.overageBehavior === "metered"
                      ? `Over your included ${tierConfig.maxRounds} rounds — extra usage is billed.`
                      : `Your plan supports ${tierConfig.maxRounds} rounds. Upgrade to add more.`}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="start-date"
                    className="mb-1 block text-xs font-medium text-muted-foreground"
                  >
                    Start
                  </label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    htmlFor="end-date"
                    className="mb-1 block text-xs font-medium text-muted-foreground"
                  >
                    End
                  </label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-6">
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

        {step === 2 ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <ChannelToggle
                label="Email"
                description="Transactional email for all stages."
                checked
                disabled
                onCheckedChange={() => {}}
              />
              <ChannelToggle
                label="WhatsApp"
                description="Candidates receive WhatsApp reminders and links."
                checked={whatsappOn}
                disabled={!tierConfig.whatsapp}
                lockText={!tierConfig.whatsapp ? "Available on the Basic tier" : undefined}
                onCheckedChange={setWhatsappOn}
              />
              <ChannelToggle
                label="Voice screening call"
                description="Automated 5-minute screening call ahead of Round 1."
                checked={voiceOn}
                disabled={!tierConfig.voiceScreening}
                lockText={!tierConfig.voiceScreening ? "Available on the Basic tier" : undefined}
                onCheckedChange={setVoiceOn}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Cadence preview — what your plan actually sends
              </p>
              <CadencePreview rows={previewRows} />
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={canceled}>
              Continue <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : canceled ? (
            <Button
              disabled
              title="Your plan is canceled — reactivate it in Billing to create campaigns."
            >
              Create campaign
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Creating…" : "Create campaign"}
            </Button>
          )}
        </div>
      </SectionCard>
      <p className="text-center text-xs text-muted-foreground">
        Created via <code className="rounded bg-fill-tertiary px-1">POST /webhook/campaigns</code>{" "}
        (workflow 9).
      </p>
    </div>
  );
}
