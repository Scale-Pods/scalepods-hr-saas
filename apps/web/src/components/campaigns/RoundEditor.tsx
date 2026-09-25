import { type RoundType, type TeamMemberRow, type Tier, tierAtLeast } from "@scalepods/core";
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

export const ROUND_TYPE_OPTIONS: { value: RoundType; label: string }[] = [
  { value: "ai_interview", label: "Live AI interview" },
  { value: "human_interview", label: "Live human interview" },
  { value: "assignment", label: "Assignment" },
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

  return (
    <div className="glass-surface p-4">
      <p className="mb-3 text-base font-semibold tracking-[-0.022em] text-foreground">
        Round {index + 1}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`rt-${index}`}
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Round type
          </label>
          <select
            id={`rt-${index}`}
            value={round.round_type}
            onChange={(e) => onChange({ round_type: e.target.value as RoundType })}
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors",
              "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
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
          </select>
        </div>
        <div>
          <label
            htmlFor={`cut-${index}`}
            className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground"
          >
            <span>Cutoff score</span>
            <span className="text-muted-foreground">{round.cutoff_score}</span>
          </label>
          <Slider
            value={[round.cutoff_score]}
            onValueChange={(v) => onChange({ cutoff_score: v[0] ?? 70 })}
            min={0}
            max={100}
            aria-label={`Round ${index + 1} cutoff`}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={round.cutoff_score}
            onChange={(e) => onChange({ cutoff_score: clamp(Number(e.target.value)) })}
            className="mt-1 w-24 rounded-md border border-input bg-card px-2 py-1 text-xs"
            aria-label={`Round ${index + 1} cutoff numeric`}
          />
        </div>
        {round.round_type === "human_interview" ? (
          <div className="sm:col-span-2">
            <label
              htmlFor={`int-${index}`}
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Interviewer email
            </label>
            {teamMembers.length > 0 ? (
              <select
                id={`int-${index}`}
                value={round.interviewer_email}
                onChange={(e) => onChange({ interviewer_email: e.target.value })}
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors",
                  "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                )}
              >
                <option value="">Select a teammate…</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.email}>
                    {m.name} · {m.email}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`int-${index}`}
                placeholder="interviewer@company.com"
                value={round.interviewer_email}
                onChange={(e) => onChange({ interviewer_email: e.target.value })}
              />
            )}
            {teamMembers.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                No teammates yet — add them in{" "}
                <Link href="/settings" className="font-medium text-primary hover:underline">
                  Settings
                </Link>
                , or type an email directly.
              </p>
            ) : null}
          </div>
        ) : null}
        {live ? (
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <div>
              <label
                htmlFor={`ts-${index}`}
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                Daily start
              </label>
              <Input
                id={`ts-${index}`}
                type="time"
                value={round.daily_start_time}
                onChange={(e) => onChange({ daily_start_time: e.target.value })}
              />
            </div>
            <div>
              <label
                htmlFor={`te-${index}`}
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                Daily end
              </label>
              <Input
                id={`te-${index}`}
                type="time"
                value={round.daily_end_time}
                onChange={(e) => onChange({ daily_end_time: e.target.value })}
              />
            </div>
          </div>
        ) : null}
        {round.round_type === "assignment" ? (
          <div className="space-y-3 sm:col-span-2">
            <div>
              <label
                htmlFor={`brief-${index}`}
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
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
              <label
                htmlFor={`deadline-${index}`}
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                Submission deadline (hours from invite)
              </label>
              <Input
                id={`deadline-${index}`}
                type="number"
                min={1}
                max={168}
                value={round.assignment_deadline_hours}
                onChange={(e) =>
                  onChange({
                    assignment_deadline_hours: Math.max(
                      1,
                      Math.min(168, Number(e.target.value) || 72),
                    ),
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Sent in the create-campaign payload; the backend currently uses a placeholder brief
                server-side.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
