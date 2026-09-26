import { type RoundType, type TeamMemberRow, type Tier, tierAtLeast } from "@scalepods/core";
import { Bot, FileText, Info, Sliders, UserCheck } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface RoundDraft {
  id: string;
  round_type: RoundType;
  interviewer_email: string;
  cutoff_score: number;
  daily_start_time: string;
  daily_end_time: string;
  brief_text: string;
  assignment_deadline_hours: number;
}

export const DEFAULT_ROUND: RoundDraft = {
  id: "round-default",
  round_type: "ai_interview",
  interviewer_email: "",
  cutoff_score: 70,
  daily_start_time: "09:00",
  daily_end_time: "18:00",
  brief_text: "",
  assignment_deadline_hours: 72,
};

let draftSequence = 0;

export function makeRound(): RoundDraft {
  draftSequence += 1;
  return { ...DEFAULT_ROUND, id: `round-${draftSequence}` };
}

export const ROUND_TYPE_OPTIONS: {
  value: RoundType;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "ai_interview",
    label: "Live AI Interview",
    desc: "Autonomous conversational AI assesses technical competencies and core fit 24/7.",
    icon: <Bot className="h-4 w-4 text-cyan-500" />,
  },
  {
    value: "human_interview",
    label: "Live Human Interview",
    desc: "Scheduled video panel or recruiter conversation with automated calendar sync.",
    icon: <UserCheck className="h-4 w-4 text-blue-500" />,
  },
  {
    value: "assignment",
    label: "Practical Assignment",
    desc: "Take-home challenge or project brief with deadline tracking and automated reminder cadence.",
    icon: <FileText className="h-4 w-4 text-purple-500" />,
  },
];

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function RoundEditor({
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
  const growthPlus = tierAtLeast(tier as Tier, "growth");
  const live = round.round_type === "ai_interview" || round.round_type === "human_interview";
  const activeOption = ROUND_TYPE_OPTIONS.find((o) => o.value === round.round_type);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
      {/* Round Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <h4 className="text-base font-semibold text-foreground">
            Round {index + 1}: {activeOption?.label || "Interview Stage"}
          </h4>
        </div>
        <span className="rounded-full bg-accent/80 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
          Passing Cutoff: {round.cutoff_score}/100
        </span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Round Type Selector */}
        <div>
          <label
            htmlFor={`rt-${index}`}
            className="mb-1.5 block text-xs font-semibold text-foreground"
          >
            Interview Format & Evaluation Method
          </label>
          <select
            id={`rt-${index}`}
            value={round.round_type}
            onChange={(e) => onChange({ round_type: e.target.value as RoundType })}
            className={cn(
              "flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors",
              "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
              "dark:bg-card dark:text-foreground",
            )}
          >
            {ROUND_TYPE_OPTIONS.map((opt) => {
              const locked = opt.value === "assignment" && !growthPlus;
              return (
                <option
                  key={opt.value}
                  value={opt.value}
                  disabled={locked}
                  className="bg-card text-foreground dark:bg-gray-900"
                >
                  {opt.label} {locked ? "— (Upgrade to Growth tier)" : ""}
                </option>
              );
            })}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            {activeOption?.desc}
          </p>
        </div>

        {/* Passing Score Slider */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor={`cut-${index}`}
              className="text-xs font-semibold text-foreground flex items-center gap-1.5"
            >
              <Sliders className="h-3.5 w-3.5 text-primary" />
              Minimum Passing Score
            </label>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-foreground">
              {round.cutoff_score} / 100
            </span>
          </div>

          <div className="pt-2 pb-1">
            <Slider
              value={[round.cutoff_score]}
              onValueChange={(v) => onChange({ cutoff_score: v[0] ?? 70 })}
              min={0}
              max={100}
              step={1}
              aria-label={`Round ${index + 1} cutoff`}
            />
          </div>

          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-muted-foreground">
              Candidates meeting or exceeding this threshold advance.
            </p>
            <input
              type="number"
              min={0}
              max={100}
              value={round.cutoff_score}
              onChange={(e) => onChange({ cutoff_score: clamp(Number(e.target.value)) })}
              className="w-16 rounded-lg border border-border bg-card px-2 py-1 text-right text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary"
              aria-label={`Round ${index + 1} cutoff numeric`}
            />
          </div>
        </div>

        {/* Human Interviewer Field */}
        {round.round_type === "human_interview" ? (
          <div className="sm:col-span-2 rounded-xl bg-accent/40 p-4 border border-primary/20 space-y-2">
            <label htmlFor={`int-${index}`} className="block text-xs font-semibold text-foreground">
              Assigned Lead Interviewer Email *
            </label>
            {teamMembers.length > 0 ? (
              <select
                id={`int-${index}`}
                value={round.interviewer_email}
                onChange={(e) => onChange({ interviewer_email: e.target.value })}
                className={cn(
                  "flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors",
                  "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
                  "dark:bg-card dark:text-foreground",
                )}
              >
                <option value="" className="bg-card text-foreground dark:bg-gray-900">
                  Select an interviewer from your team…
                </option>
                {teamMembers.map((m) => (
                  <option
                    key={m.id}
                    value={m.email}
                    className="bg-card text-foreground dark:bg-gray-900"
                  >
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`int-${index}`}
                placeholder="e.g., alex.lead@company.com"
                value={round.interviewer_email}
                onChange={(e) => onChange({ interviewer_email: e.target.value })}
                className="bg-card"
              />
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
              Calendar invites and video interview links will be scheduled against this interviewer.
            </p>
          </div>
        ) : null}

        {/* Daily Time Window for Live Interviews */}
        {live ? (
          <div className="sm:col-span-2 grid grid-cols-2 gap-4 rounded-xl border border-border p-4 bg-muted/30">
            <div>
              <label
                htmlFor={`ts-${index}`}
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Daily Window: Available From
              </label>
              <Input
                id={`ts-${index}`}
                type="time"
                value={round.daily_start_time}
                onChange={(e) => onChange({ daily_start_time: e.target.value })}
                className="bg-card"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Earliest daily interview slot
              </span>
            </div>
            <div>
              <label
                htmlFor={`te-${index}`}
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Daily Window: Available Until
              </label>
              <Input
                id={`te-${index}`}
                type="time"
                value={round.daily_end_time}
                onChange={(e) => onChange({ daily_end_time: e.target.value })}
                className="bg-card"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Latest daily interview slot
              </span>
            </div>
          </div>
        ) : null}

        {/* Assignment Brief Field */}
        {round.round_type === "assignment" ? (
          <div className="sm:col-span-2 space-y-3 rounded-xl border border-border p-4 bg-muted/30">
            <div>
              <label
                htmlFor={`brief-${index}`}
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Assignment Prompt & Submission Guidelines *
              </label>
              <Textarea
                id={`brief-${index}`}
                rows={5}
                placeholder="Explain the practical problem or project challenge. Detail deliverables required (e.g. GitHub link, Figma file, slide deck) and scoring expectations..."
                value={round.brief_text}
                onChange={(e) => onChange({ brief_text: e.target.value })}
                className="bg-card"
              />
            </div>
            <div>
              <label
                htmlFor={`dh-${index}`}
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Submission Deadline (Hours)
              </label>
              <Input
                id={`dh-${index}`}
                type="number"
                min={12}
                max={336}
                value={round.assignment_deadline_hours}
                onChange={(e) =>
                  onChange({ assignment_deadline_hours: Number(e.target.value) || 72 })
                }
                className="w-36 bg-card"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Candidates must submit their completed work within this time window (e.g. 72 hours =
                3 days).
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
