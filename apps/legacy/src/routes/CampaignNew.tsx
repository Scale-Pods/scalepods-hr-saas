import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTierLimits } from "../hooks/useTierLimits";
import { browserClient } from "../lib/supabase";
import { campaignCreateSchema } from "../lib/schemas";
import { overageNotice, tierAtLeast } from "../lib/tier";
import { CADENCE_STAGES, cadenceForTier, type CadenceRenderRow } from "../lib/cadence";
import { extractTextFromFile } from "../lib/extract-text";
import type { RoundType, TeamMemberRow } from "../lib/types";
import { callWebhook } from "../lib/n8n";
import { showErrorToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import { Select } from "../components/ui/Select";
import { Slider } from "../components/ui/Slider";
import { Toggle } from "../components/ui/Toggle";
import { Tooltip } from "../components/ui/Tooltip";
import { CadencePreview } from "../components/CadencePreview";

interface RoundDraft {
  round_type: RoundType;
  interviewer_email: string;
  cutoff_score: number;
  daily_start_time: string;
  daily_end_time: string;
  brief_text: string;
  assignment_deadline_hours: number;
}

const DEFAULT_ROUND: RoundDraft = {
  round_type: "ai_interview",
  interviewer_email: "",
  cutoff_score: 70,
  daily_start_time: "09:00",
  daily_end_time: "18:00",
  brief_text: "",
  assignment_deadline_hours: 72,
};

const ROUND_TYPE_OPTIONS: { value: RoundType; label: string }[] = [
  { value: "ai_interview", label: "Live AI interview" },
  { value: "human_interview", label: "Live human interview" },
  { value: "assignment", label: "Assignment" },
];

const STEPS = ["Basics", "Rounds", "Reach-out"];

interface CampaignCreated {
  campaign_id?: string;
  id?: string;
}

export function CampaignNewPage() {
  const navigate = useNavigate();
  const { user, account } = useAuth();
  const supabase = browserClient();
  const tier = account?.tier ?? "free";
  const tierConfig = useTierLimits(tier);
  const canceled = account?.billing_status === "canceled";

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [jdText, setJdText] = useState("");
  const [jdBusy, setJdBusy] = useState(false);
  const [numberOfRounds, setNumberOfRounds] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rounds, setRounds] = useState<RoundDraft[]>([DEFAULT_ROUND]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [whatsappOn, setWhatsappOn] = useState(tierConfig.whatsapp);
  const [voiceOn, setVoiceOn] = useState(tierConfig.voiceScreening);

  useEffect(() => {
    supabase
      .from("team_members")
      .select("id,name,email,role")
      .order("name")
      .then(({ data, error }) => {
        if (!error && data) setTeamMembers(data as TeamMemberRow[]);
      });
  }, [supabase]);

  useEffect(() => {
    setRounds((prev) => {
      const next = Array.from({ length: numberOfRounds }, (_, i) => prev[i] ?? { ...DEFAULT_ROUND });
      return next;
    });
  }, [numberOfRounds]);

  const updateRound = (i: number, patch: Partial<RoundDraft>) =>
    setRounds((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const startUpload = async (file: File) => {
    setJdBusy(true);
    const res = await extractTextFromFile(file);
    setJdBusy(false);
    if ("text" in res) setJdText(res.text);
    else showErrorToast(res.error);
  };

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
      (a, b) => CADENCE_STAGES.findIndex((s) => s.key === a.stage.key) - CADENCE_STAGES.findIndex((s) => s.key === b.stage.key)
    );
  }, [rounds, numberOfRounds, tier]);

  const validateBasics = () => {
    if (!name.trim()) return "Give the campaign a name.";
    if (!jdText.trim()) return "Paste or upload a job description.";
    if (endDate && startDate && endDate < startDate) return "End date must be after the start date.";
    return null;
  };

  const validateRounds = () => {
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
      account_id: user!.id,
      name,
      jd_text: jdText,
      number_of_rounds: numberOfRounds,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      rounds: rounds.slice(0, numberOfRounds).map((r, i) => ({
        round_number: i + 1,
        round_type: r.round_type,
        interviewer_email: r.round_type === "human_interview" ? r.interviewer_email || null : undefined,
        cutoff_score: r.cutoff_score,
        daily_start_time:
          r.round_type === "ai_interview" || r.round_type === "human_interview" ? r.daily_start_time || null : undefined,
        daily_end_time:
          r.round_type === "ai_interview" || r.round_type === "human_interview" ? r.daily_end_time || null : undefined,
        brief_text: r.round_type === "assignment" ? r.brief_text.trim() || null : undefined,
        assignment_deadline_hours:
          r.round_type === "assignment" ? r.assignment_deadline_hours : undefined,
      })),
    };
    const parsed = campaignCreateSchema.safeParse(payload);
    if (!parsed.success) {
      showErrorToast(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · "));
      return;
    }
    setSubmitting(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      let createdId: string | null = null;
      const res = await callWebhook<CampaignCreated>("campaigns", {
        body: parsed.data,
        accessToken: token,
      });
      if (res && typeof res.campaign_id === "string") createdId = res.campaign_id;
      if (res && typeof res.id === "string") createdId = res.id;
      if (!createdId) {
        // Best-effort lookup of the newest campaign so we can redirect.
        const { data } = await supabase
          .from("campaigns")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        createdId = data?.id ?? null;
      }
      if (createdId) navigate(`/campaigns/${createdId}`);
      else navigate("/dashboard");
    } catch (err) {
      showErrorToast(err);
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step === 0 && validateBasics()) return showErrorToast(validateBasics()!);
    if (step === 1 && validateRounds()) return showErrorToast(validateRounds()!);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New campaign</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tierConfig.label} plan · up to {tierConfig.maxRounds} rounds per campaign
        </p>
      </div>

      <StepsBar step={step} />
      <Card>
        <CardHeader
          title={STEPS[step]}
          subtitle={
            step === 0
              ? "Job basics. Enforceable limits are applied server-side; these options only filter what you can pick."
              : step === 1
                ? "Configure each round. All rounds converge on the same cutoff check."
                : "How candidates hear from you. Email is always on; other channels follow your plan."
          }
        />

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label htmlFor="campaign-name" className="mb-1 block text-xs font-medium text-muted-foreground">
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
                <UploadResumeButton busy={jdBusy} onFile={startUpload} />
                <span className="text-xs text-muted-foreground">.pdf · .docx · .txt extracted in your browser</span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="rounds" className="mb-1 block text-xs font-medium text-muted-foreground">
                  Number of rounds
                </label>
                <Select
                  id="rounds"
                  value={numberOfRounds}
                  onChange={(e) => setNumberOfRounds(Number(e.target.value))}
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
                </Select>
                {numberOfRounds > tierConfig.maxRounds &&
                  (tierConfig.overageBehavior === "metered" ? (
                    <p className="mt-1 text-xs text-warning">
                      {overageNotice(tier, "maxRounds") ??
                        `Over your included ${tierConfig.maxRounds} rounds - extra usage is billed.`}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-warning">
                      Your plan supports {tierConfig.maxRounds} rounds. Upgrade to add more.
                    </p>
                  ))}
              </div>
              <div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="start-date" className="mb-1 block text-xs font-medium text-muted-foreground">
                      Start
                    </label>
                    <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="end-date" className="mb-1 block text-xs font-medium text-muted-foreground">
                      End
                    </label>
                    <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            {rounds.slice(0, numberOfRounds).map((r, i) => (
              <RoundEditor
                key={i}
                index={i}
                round={r}
                tier={tier}
                teamMembers={teamMembers}
                onChange={(patch) => updateRound(i, patch)}
              />
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-3">
              <ChannelToggle
                label="Email"
                desc="Transactional email for all stages."
                checked
                disabled
                locked={false}
              />
              <ChannelToggle
                label="WhatsApp"
                desc="Candidates receive WhatsApp reminders and links."
                checked={whatsappOn}
                disabled={!tierConfig.whatsapp}
                locked={!tierConfig.whatsapp}
                lockText="Available on the Basic tier"
                onChange={setWhatsappOn}
              />
              <ChannelToggle
                label="Voice screening call"
                desc="Automated 5-minute screening call ahead of Round 1."
                checked={voiceOn}
                disabled={!tierConfig.voiceScreening}
                locked={!tierConfig.voiceScreening}
                lockText="Available on the Basic tier"
                onChange={setVoiceOn}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Cadence preview — what your plan actually sends
              </p>
              <CadencePreview rows={previewRows} />
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={canceled}>
              Continue <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : canceled ? (
            <Button disabled title="Your plan is canceled - reactivate it in Billing to create campaigns.">
              Create campaign
            </Button>
          ) : (
            <Button onClick={submit} loading={submitting} disabled={submitting}>
              Create campaign
            </Button>
          )}
        </div>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Created via <code className="rounded bg-muted px-1">POST /webhook/campaigns</code> (workflow 9).
      </p>
    </div>
  );
}

function StepsBar({ step }: { step: number }) {
  return (
    <ol className="flex gap-2">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={`flex-1 rounded-lg px-3 py-2 text-center text-xs font-medium ${
            i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function RoundEditor({
  index,
  round,
  tier,
  teamMembers,
  onChange,
}: {
  index: number;
  round: RoundDraft;
  tier: string;
  teamMembers: TeamMemberRow[];
  onChange: (patch: Partial<RoundDraft>) => void;
}) {
  const growthPlus = tierAtLeast(tier as never, "growth");
  const live = round.round_type === "ai_interview" || round.round_type === "human_interview";

  return (
    <div className="rounded-xl border border-border bg-muted/50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Round {index + 1}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`rt-${index}`} className="mb-1 block text-xs font-medium text-muted-foreground">
            Round type
          </label>
          <Select
            id={`rt-${index}`}
            value={round.round_type}
            onChange={(e) => onChange({ round_type: e.target.value as RoundType })}
          >
            {ROUND_TYPE_OPTIONS.map((opt) => {
              const locked = opt.value === "assignment" && !growthPlus;
              return (
                <option key={opt.value} value={opt.value} disabled={locked}>
                  {opt.label}
                  {locked ? " · Available on Growth+" : ""}
                </option>
              );
            })}
          </Select>
        </div>
        <div>
          <label htmlFor={`cut-${index}`} className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Cutoff score</span>
            <span className="text-muted-foreground">{round.cutoff_score}</span>
          </label>
          <Slider
            value={round.cutoff_score}
            onChange={(v) => onChange({ cutoff_score: v })}
            min={0}
            max={100}
            label={`Round ${index + 1} cutoff`}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={round.cutoff_score}
            onChange={(e) => onChange({ cutoff_score: clamp(Number(e.target.value)) })}
            className="mt-1 w-24 rounded-md border border-input px-2 py-1 text-xs"
            aria-label={`Round ${index + 1} cutoff numeric`}
          />
        </div>
        {round.round_type === "human_interview" && (
          <div className="sm:col-span-2">
            <label htmlFor={`int-${index}`} className="mb-1 block text-xs font-medium text-muted-foreground">
              Interviewer email
            </label>
            {teamMembers.length > 0 ? (
              <Select
                id={`int-${index}`}
                value={round.interviewer_email}
                onChange={(e) => onChange({ interviewer_email: e.target.value })}
              >
                <option value="">Select a teammate…</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.email}>
                    {m.name} · {m.email}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={`int-${index}`}
                placeholder="interviewer@company.com"
                value={round.interviewer_email}
                onChange={(e) => onChange({ interviewer_email: e.target.value })}
              />
            )}
            {teamMembers.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No teammates yet — add them in{" "}
                <Link to="/settings" className="font-medium text-primary">
                  Settings
                </Link>
                , or type an email directly.
              </p>
            )}
          </div>
        )}
        {live && (
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <div>
              <label htmlFor={`ts-${index}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                Daily start
              </label>
              <Input id={`ts-${index}`} type="time" value={round.daily_start_time} onChange={(e) => onChange({ daily_start_time: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`te-${index}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                Daily end
              </label>
              <Input id={`te-${index}`} type="time" value={round.daily_end_time} onChange={(e) => onChange({ daily_end_time: e.target.value })} />
            </div>
          </div>
        )}
        {round.round_type === "assignment" && (
          <div className="space-y-3 sm:col-span-2">
            <div>
              <label htmlFor={`brief-${index}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                Assignment brief
              </label>
              <Textarea
                id={`brief-${index}`}
                value={round.brief_text}
                onChange={(e) => onChange({ brief_text: e.target.value })}
                rows={5}
                placeholder="Describe the take-home task, what success looks like, and how the work is submitted…"
              />
            </div>
            <div>
              <label htmlFor={`deadline-${index}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                Submission deadline (hours from invite)
              </label>
              <Input
                id={`deadline-${index}`}
                type="number"
                min={1}
                max={168}
                value={round.assignment_deadline_hours}
                onChange={(e) =>
                  onChange({ assignment_deadline_hours: Math.max(1, Math.min(168, Number(e.target.value) || 72)) })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Sent in the create-campaign payload; the backend currently uses a placeholder brief server-side.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelToggle({
  label,
  desc,
  checked,
  onChange,
  disabled,
  locked,
  lockText,
}: {
  label: string;
  desc: string;
  checked?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
  lockText?: string;
}) {
  const row = (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Toggle checked={checked ?? false} onChange={onChange ?? (() => {})} disabled={disabled} label={label} />
    </div>
  );
  if (locked)
    return (
      <Tooltip label={lockText ?? "Not available on this plan"}>
        <div className="opacity-80">{row}</div>
      </Tooltip>
    );
  return row;
}

function UploadResumeButton({ busy, onFile }: { busy: boolean; onFile: (f: File) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
      <Upload className="h-3.5 w-3.5" aria-hidden />
      {busy ? "Extracting…" : "Upload JD"}
      <input
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}