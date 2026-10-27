import { type RoundType, type TeamMemberRow, type Tier, tierAtLeast } from "@scalepods/core";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  Lock,
  PhoneCall,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface TeamMemberOption {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  calendar_status?: string;
  google_email?: string | null;
}

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
    value: "ai_voice_call",
    label: "AI Voice Call Screening",
    desc: "Autonomous conversational AI places an outbound phone call to assess competencies, communication, and candidate fit.",
    icon: <PhoneCall className="h-4 w-4 text-emerald-500" />,
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
  teamMembers: TeamMemberOption[];
  onChange: (patch: Partial<RoundDraft>) => void;
}) {
  const growthPlus = tierAtLeast(tier as Tier, "growth");
  const basicPlus = tierAtLeast(tier as Tier, "basic");
  const live =
    round.round_type === "ai_interview" ||
    round.round_type === "human_interview" ||
    round.round_type === "ai_voice_call";
  const activeOption = ROUND_TYPE_OPTIONS.find((o) => o.value === round.round_type);

  // Dynamic round type guard: If account tier does not support assignments or voice calls, fallback to ai_interview
  useEffect(() => {
    if (!growthPlus && round.round_type === "assignment") {
      onChange({ round_type: "ai_interview" });
    }
    if (!basicPlus && round.round_type === "ai_voice_call") {
      onChange({ round_type: "ai_interview" });
    }
  }, [growthPlus, basicPlus, round.round_type, onChange]);

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
      </div>

      <div className="grid gap-5">
        {/* Round Type Selector */}
        <div>
          <label
            htmlFor={`rt-${index}`}
            className="mb-1.5 block text-xs font-semibold text-foreground"
          >
            Interview Format & Evaluation Method
          </label>
          <Select
            value={round.round_type}
            onValueChange={(val) => onChange({ round_type: val as RoundType })}
          >
            <SelectTrigger id={`rt-${index}`} className="rounded-xl">
              <SelectValue placeholder="Select interview format" />
            </SelectTrigger>
            <SelectContent className="border-border bg-card">
              {ROUND_TYPE_OPTIONS.map((opt) => {
                const locked =
                  (opt.value === "assignment" && !growthPlus) ||
                  (opt.value === "ai_voice_call" && !basicPlus);
                const lockTier = opt.value === "assignment" ? "Growth" : "Basic";
                return (
                  <SelectItem key={opt.value} value={opt.value} disabled={locked}>
                    {opt.label} {locked ? `— (Upgrade to ${lockTier} tier)` : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            {activeOption?.desc}
          </p>
          {!basicPlus && (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 text-[11px]">
                <Lock className="h-3 w-3 shrink-0" />
                AI Voice Calls & Assignments
              </span>
              <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium border border-border/40">
                Available on Basic & above
              </span>
            </div>
          )}
        </div>

        {/* AI Voice Screening Information Banner */}
        {round.round_type === "ai_voice_call" ? (
          <div className="rounded-xl bg-emerald-500/10 p-4 border border-emerald-500/20 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
              <PhoneCall className="h-4 w-4 shrink-0" />
              <span>Autonomous AI Phone Screening</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When candidates advance to this round, Dialnexa automatically places an outbound call
              to their phone during the daily window. The call audio is recorded and an AI scorecard
              with communication and qualification ratings is generated for your post-round review.
            </p>
          </div>
        ) : null}

        {/* Human Interviewer Field */}
        {round.round_type === "human_interview" ? (
          <div className="sm:col-span-2 rounded-xl bg-accent/40 p-4 border border-primary/20 space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor={`int-${index}`}
                className="block text-xs font-semibold text-foreground"
              >
                Assigned Team Interviewer *
              </label>
              <Link
                href="/settings?from=campaign_wizard"
                target="_blank"
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              >
                Manage teammates <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            {teamMembers.length > 0 ? (
              <div className="space-y-2">
                <Select
                  value={round.interviewer_email || "unassigned"}
                  onValueChange={(val) =>
                    onChange({ interviewer_email: val === "unassigned" ? "" : val })
                  }
                >
                  <SelectTrigger id={`int-${index}`} className="rounded-xl">
                    <SelectValue placeholder="Select a team member as interviewer…" />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card">
                    <SelectItem value="unassigned">Select a team member as interviewer…</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.email}>
                        {m.name} ({m.email}){" "}
                        {m.calendar_status === "active" ? "— 🟢 Calendar Connected" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const selected = teamMembers.find(
                    (m) => m.email.toLowerCase() === round.interviewer_email.toLowerCase(),
                  );
                  if (!selected) {
                    return (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
                        Only teammates added to your workspace can be selected as interviewers.
                      </p>
                    );
                  }
                  if (selected.calendar_status === "active") {
                    return (
                      <p className="text-xs text-emerald-500 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        Google Calendar connected ({selected.google_email || selected.email}).
                        Candidates will auto-book against live free slots.
                      </p>
                    );
                  }
                  return (
                    <p className="text-xs text-amber-500 font-medium flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      Google Calendar not connected yet for this teammate. They can connect it in
                      Settings.
                    </p>
                  );
                })()}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  No team members added yet
                </div>
                <p className="text-xs text-muted-foreground">
                  Live human interviews require an assigned team member from your workspace. Add
                  your teammates in Settings to enable this round.
                </p>
                <Link
                  href="/settings?from=campaign_wizard"
                  target="_blank"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  Go to Settings &rarr; Add Teammate
                </Link>
              </div>
            )}
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
