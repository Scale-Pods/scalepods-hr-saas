import type { CadenceChannel, CadenceRenderRow, CadenceTimingWarning } from "@scalepods/core";
import {
  AlertTriangle,
  Check,
  Clock,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const CHANNEL_META = {
  email: { label: "Email", icon: Mail },
  whatsapp: { label: "WhatsApp", icon: MessageSquare },
  voice_call: { label: "Voice", icon: Phone },
} as const;

export interface CadenceTimingValues {
  hoursBefore?: number;
  sendHour?: number;
  dayOffset?: number;
  /** Recruiter-set dispatch clock time, e.g. "09:30". */
  sendTime?: string;
}

export interface CadencePreviewProps {
  rows: CadenceRenderRow[];
  editable?: boolean;
  canEditTiming?: boolean;
  /** Total campaign window in hours. When set, inputs are clamped to this window. */
  durationHours?: number | null;
  timingConfig?: Record<string, CadenceTimingValues>;
  /** Per-stage warnings returned by validateCadenceTiming(), keyed by stageKey. */
  timingWarnings?: Record<string, CadenceTimingWarning>;
  onToggleStage?: (stageKey: string, enabled: boolean) => void;
  onToggleChannel?: (stageKey: string, channel: CadenceChannel, enabled: boolean) => void;
  onChangeDayLabel?: (stageKey: string, newDayLabel: string) => void;
  onChangeLabel?: (stageKey: string, newLabel: string) => void;
  onChangeTiming?: (stageKey: string, timing: Partial<CadenceTimingValues>) => void;
  onAddCustomStage?: (dayLabel: string, label: string) => void;
}

export function CadencePreview({
  rows,
  editable,
  canEditTiming = false,
  durationHours,
  timingConfig = {},
  timingWarnings = {},
  onToggleStage,
  onToggleChannel,
  onChangeDayLabel,
  onChangeLabel,
  onChangeTiming,
  onAddCustomStage,
}: CadencePreviewProps) {
  const [newDay, setNewDay] = useState("");
  const [newLabel, setNewLabel] = useState("");

  /** Max value for hoursBefore inputs — never let a recruiter set a value that can't fire. */
  const maxHoursBefore = durationHours != null && durationHours > 0 ? durationHours - 1 : 168;
  const maxDayOffset =
    durationHours != null && durationHours > 0
      ? Math.max(0, Math.floor(durationHours / 24) - 1)
      : 30;

  /** Renders an inline amber warning for a timing field if it's outside the window. */
  const renderWarning = (stageKey: string, field: CadenceTimingWarning["field"]) => {
    const w = timingWarnings[stageKey];
    if (!w || w.field !== field) return null;
    return (
      <span
        title={w.message}
        className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/25 cursor-help whitespace-nowrap shrink-0"
      >
        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
        Won't send
      </span>
    );
  };

  const renderTimingCell = (stageKey: string, enabled: boolean) => {
    const timing = timingConfig[stageKey] || {};

    if (stageKey === "shortlist") {
      return (
        <span className="text-xs font-medium text-muted-foreground text-center block">
          Sent immediately (Day 0)
        </span>
      );
    }

    if (
      stageKey === "reminder_day1" ||
      stageKey === "reminder_day3" ||
      stageKey === "reminder_day5"
    ) {
      const defaultDay = stageKey === "reminder_day1" ? 1 : stageKey === "reminder_day3" ? 3 : 5;
      const val = timing.dayOffset ?? defaultDay;
      const sendTimeVal = timing.sendTime ?? "09:00";

      if (canEditTiming && editable && enabled) {
        return (
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-center">
            <div className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-2 py-1">
              <span className="text-muted-foreground text-xs font-medium">Day</span>
              <Input
                type="number"
                min={0}
                max={maxDayOffset}
                value={val}
                onChange={(e) =>
                  onChangeTiming?.(stageKey, {
                    dayOffset: Math.max(0, Math.min(maxDayOffset, Number(e.target.value))),
                  })
                }
                className="h-7 w-14 text-xs text-center font-mono px-1"
              />
              <span className="text-muted-foreground text-xs font-medium">at</span>
              <Input
                type="time"
                value={sendTimeVal}
                onChange={(e) =>
                  onChangeTiming?.(stageKey, {
                    sendTime: e.target.value,
                  })
                }
                className="h-7 w-24 text-xs text-center font-mono px-2"
              />
            </div>
            {renderWarning(stageKey, "dayOffset")}
            {renderWarning(stageKey, "sendTime")}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-center">
          <span className="text-xs text-foreground/90 font-mono text-center">
            {val} day{val === 1 ? "" : "s"} after invite at {sendTimeVal}
          </span>
          {renderWarning(stageKey, "dayOffset")}
          {renderWarning(stageKey, "sendTime")}
        </div>
      );
    }

    if (stageKey === "pre_interview_reminder") {
      const val = timing.hoursBefore ?? 24;
      const sendTimeVal = timing.sendTime ?? "09:00";
      if (canEditTiming && editable && enabled) {
        return (
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-center">
            <div className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-2 py-1">
              <Input
                type="number"
                min={1}
                max={maxHoursBefore}
                value={val}
                onChange={(e) =>
                  onChangeTiming?.(stageKey, {
                    hoursBefore: Math.max(1, Math.min(maxHoursBefore, Number(e.target.value))),
                  })
                }
                className="h-7 w-14 text-xs text-center font-mono px-1"
              />
              <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">
                hrs before slot (or
              </span>
              <Input
                type="time"
                value={sendTimeVal}
                onChange={(e) =>
                  onChangeTiming?.(stageKey, {
                    sendTime: e.target.value,
                  })
                }
                className="h-7 w-24 text-xs text-center font-mono px-2"
                title="Target dispatch clock time"
              />
              <span className="text-muted-foreground text-xs font-medium">)</span>
            </div>
            {renderWarning(stageKey, "hoursBefore")}
            {renderWarning(stageKey, "sendTime")}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-center">
          <span className="text-xs text-foreground/90 font-mono text-center">
            {val}h before slot (at {sendTimeVal})
          </span>
          {renderWarning(stageKey, "hoursBefore")}
          {renderWarning(stageKey, "sendTime")}
        </div>
      );
    }

    if (stageKey === "interview_day") {
      const sendTimeVal =
        timing.sendTime ?? `${(timing.sendHour ?? 9).toString().padStart(2, "0")}:00`;
      if (canEditTiming && editable && enabled) {
        return (
          <div className="flex items-center justify-center gap-1.5 text-xs text-center">
            <div className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-2 py-1">
              <span className="text-muted-foreground text-xs font-medium">At</span>
              <Input
                type="time"
                value={sendTimeVal}
                onChange={(e) => {
                  const sendTime = e.target.value;
                  const hour = parseInt(sendTime.split(":")[0], 10);
                  onChangeTiming?.(stageKey, {
                    sendTime,
                    sendHour: Number.isFinite(hour) ? hour : undefined,
                  });
                }}
                className="h-7 w-24 text-xs text-center font-mono px-2"
              />
              <span className="text-muted-foreground text-xs font-medium">local</span>
            </div>
            {renderWarning(stageKey, "sendTime")}
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center gap-1.5 text-center">
          <span className="text-xs text-foreground/90 font-mono text-center">
            {sendTimeVal} local
          </span>
          {renderWarning(stageKey, "sendTime")}
        </div>
      );
    }

    if (stageKey === "assignment_deadline_24h") {
      const val = timing.hoursBefore ?? 24;
      const sendTimeVal = timing.sendTime ?? "09:00";
      if (canEditTiming && editable && enabled) {
        return (
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-center">
            <div className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-2 py-1">
              <Input
                type="number"
                min={1}
                max={maxHoursBefore}
                value={val}
                onChange={(e) =>
                  onChangeTiming?.(stageKey, {
                    hoursBefore: Math.max(1, Math.min(maxHoursBefore, Number(e.target.value))),
                  })
                }
                className="h-7 w-14 text-xs text-center font-mono px-1"
              />
              <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">
                hrs before due (or
              </span>
              <Input
                type="time"
                value={sendTimeVal}
                onChange={(e) =>
                  onChangeTiming?.(stageKey, {
                    sendTime: e.target.value,
                  })
                }
                className="h-7 w-24 text-xs text-center font-mono px-2"
                title="Target dispatch clock time"
              />
              <span className="text-muted-foreground text-xs font-medium">)</span>
            </div>
            {renderWarning(stageKey, "hoursBefore")}
            {renderWarning(stageKey, "sendTime")}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-center">
          <span className="text-xs text-foreground/90 font-mono text-center">
            {val}h before due (at {sendTimeVal})
          </span>
          {renderWarning(stageKey, "hoursBefore")}
          {renderWarning(stageKey, "sendTime")}
        </div>
      );
    }

    return (
      <span className="text-xs text-muted-foreground/80 italic text-center block">
        Default event trigger
      </span>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60 shadow-xs">
      <Table className="min-w-[780px] w-full">
        <TableHeader>
          <TableRow className="border-b border-border/80 bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-52 min-w-[200px] font-semibold text-foreground text-center">
              Timeline
            </TableHead>
            <TableHead className="min-w-[220px] font-semibold text-foreground text-left">
              Stage
            </TableHead>
            <TableHead className="w-72 min-w-[260px] font-semibold text-foreground text-center">
              Schedule / Timing
            </TableHead>
            <TableHead className="min-w-[190px] font-semibold text-foreground text-center">
              Channels Sent
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ stage, enabled, channels }) => {
            const deactivatedChannels = stage.channels.filter((c) => !channels.includes(c));

            return (
              <TableRow
                key={stage.key}
                className={cn(
                  "transition-colors border-b border-border/60 hover:bg-muted/30",
                  !enabled && "opacity-50 bg-muted/10",
                )}
              >
                <TableCell className="w-52 min-w-[200px] whitespace-normal py-3 align-middle text-center">
                  {editable ? (
                    <Input
                      value={stage.dayLabel}
                      onChange={(e) => onChangeDayLabel?.(stage.key, e.target.value)}
                      className="h-8 w-[185px] rounded-full text-xs font-mono px-3 text-center mx-auto bg-muted/25 border-border/80 hover:border-primary/60 focus:border-primary focus:bg-background transition-colors"
                    />
                  ) : (
                    <span className="inline-flex items-center justify-center rounded-full bg-muted/50 px-3.5 py-1 text-xs font-mono font-medium text-foreground/90 border border-border/60 whitespace-nowrap min-w-[90px] mx-auto">
                      {stage.dayLabel}
                    </span>
                  )}
                </TableCell>
                <TableCell className="min-w-[220px] max-w-[340px] whitespace-normal py-3 align-middle text-left">
                  <div className="flex items-start gap-2.5">
                    {editable ? (
                      <Checkbox
                        checked={enabled}
                        onCheckedChange={(checked) => onToggleStage?.(stage.key, checked === true)}
                        className="mt-0.5"
                      />
                    ) : (
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full transition-colors",
                          enabled
                            ? "bg-emerald-500 shadow-xs shadow-emerald-500/50"
                            : "bg-muted-foreground/30",
                        )}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {editable ? (
                        <Input
                          value={stage.label}
                          onChange={(e) => onChangeLabel?.(stage.key, e.target.value)}
                          className={cn(
                            "h-7 text-xs px-2 mb-1.5 bg-transparent border-input/60 hover:border-input focus:border-input transition-colors w-full max-w-[280px]",
                            enabled ? "text-foreground font-medium" : "text-muted-foreground",
                          )}
                        />
                      ) : (
                        <p
                          className={cn(
                            "text-xs font-semibold leading-normal mb-0.5",
                            enabled ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {stage.label}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground leading-relaxed break-words">
                        {stage.description}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="w-72 min-w-[260px] whitespace-normal py-3 align-middle text-center">
                  {renderTimingCell(stage.key, enabled)}
                </TableCell>
                <TableCell className="min-w-[190px] whitespace-normal py-3 align-middle text-center">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {/* Active channels with green tick */}
                    {channels.map((c) => (
                      <ChannelPill
                        key={c}
                        channel={c}
                        active
                        editable={editable && enabled}
                        onToggle={() => onToggleChannel?.(stage.key, c, false)}
                      />
                    ))}

                    {/* Deactivated channels without green tick */}
                    {deactivatedChannels.map((c) => (
                      <ChannelPill
                        key={c}
                        channel={c}
                        active={false}
                        editable={editable && enabled}
                        onToggle={() => onToggleChannel?.(stage.key, c, true)}
                      />
                    ))}

                    {channels.length === 0 && (
                      <span className="text-[11px] font-medium text-muted-foreground/70 italic">
                        Disabled for this campaign
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}

          {editable && (
            <TableRow className="border-b-0 bg-muted/20 hover:bg-muted/20">
              <TableCell className="w-52 min-w-[200px] whitespace-normal py-3 align-middle text-center">
                <Input
                  placeholder="e.g. Day 7"
                  className="h-8 w-[185px] rounded-full text-xs font-mono px-3 text-center mx-auto"
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                />
              </TableCell>
              <TableCell className="whitespace-normal py-3 align-middle text-center" colSpan={2}>
                <Input
                  placeholder="Custom reminder stage name..."
                  className="h-8 text-xs w-full max-w-[340px] px-2 text-center mx-auto"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </TableCell>
              <TableCell className="whitespace-normal py-3 align-middle text-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-medium mx-auto"
                  onClick={() => {
                    if (newDay.trim() && newLabel.trim()) {
                      onAddCustomStage?.(newDay.trim(), newLabel.trim());
                      setNewDay("");
                      setNewLabel("");
                    }
                  }}
                  disabled={!newDay.trim() || !newLabel.trim()}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Step
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-center sm:justify-between gap-3 border-t border-border/40 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground text-center">
        <span className="flex items-center justify-center gap-1.5 text-[11px] text-center">
          {canEditTiming ? (
            <>
              <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Timing and reminder intervals are recruiter-configurable</span>
            </>
          ) : (
            <>
              <Lock className="h-3 w-3 shrink-0" />
              <span>Recruiter-configurable timing &amp; schedule intervals</span>
            </>
          )}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium border border-border/60 text-muted-foreground text-center">
          {canEditTiming ? "Timing enabled" : "Available on Growth & Enterprise"}
        </span>
      </div>
    </div>
  );
}

function ChannelPill({
  channel,
  active = true,
  editable,
  onToggle,
}: {
  channel: CadenceChannel;
  active?: boolean;
  editable?: boolean;
  onToggle?: () => void;
}) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;

  if (!active) {
    return (
      <button
        type="button"
        disabled={!editable}
        onClick={onToggle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground/60 select-none",
          editable && "hover:bg-muted cursor-pointer transition-colors",
        )}
        title={`${meta.label} is deactivated for this campaign`}
      >
        <X className="h-3 w-3 text-muted-foreground/50 shrink-0" aria-hidden="true" />
        {Icon ? (
          <Icon className="h-3 w-3 text-muted-foreground/50 shrink-0" aria-hidden="true" />
        ) : null}
        <span>{meta.label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={!editable}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400",
        editable && "hover:bg-emerald-500/20 cursor-pointer transition-colors",
      )}
    >
      <Check className="h-3 w-3 text-emerald-400 shrink-0" aria-hidden="true" />
      {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
      <span>{meta.label}</span>
    </button>
  );
}
