import type { CadenceChannel, CadenceRenderRow, CadenceTimingWarning } from "@scalepods/core";
import { AlertTriangle, Check, Clock, Lock, MessageSquare, Phone, Plus, X } from "lucide-react";
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
  email: { label: "Email", icon: null },
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
        className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/25 cursor-help"
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
        <span className="text-[11px] text-muted-foreground font-medium">
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
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-[11px]">Day</span>
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
                className="h-7 w-12 text-xs text-center font-mono px-1"
              />
              <span className="text-muted-foreground text-[11px]">at</span>
              <Input
                type="time"
                value={sendTimeVal}
                onChange={(e) =>
                  onChangeTiming?.(stageKey, {
                    sendTime: e.target.value,
                  })
                }
                className="h-7 w-[78px] text-xs text-center font-mono px-1"
              />
            </div>
            {renderWarning(stageKey, "dayOffset")}
            {renderWarning(stageKey, "sendTime")}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-mono">
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
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <div className="flex items-center gap-1">
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
                className="h-7 w-12 text-xs text-center font-mono px-1"
              />
              <span className="text-muted-foreground text-[11px]">hrs before (or</span>
              <Input
                type="time"
                value={sendTimeVal}
                onChange={(e) =>
                  onChangeTiming?.(stageKey, {
                    sendTime: e.target.value,
                  })
                }
                className="h-7 w-[78px] text-xs text-center font-mono px-1"
                title="Target dispatch clock time"
              />
              <span className="text-muted-foreground text-[11px]">)</span>
            </div>
            {renderWarning(stageKey, "hoursBefore")}
            {renderWarning(stageKey, "sendTime")}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-mono">
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
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground text-[11px]">At</span>
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
              className="h-7 w-[82px] text-xs text-center font-mono px-1"
            />
            <span className="text-muted-foreground text-[11px]">local</span>
            {renderWarning(stageKey, "sendTime")}
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-mono">{sendTimeVal} local</span>
          {renderWarning(stageKey, "sendTime")}
        </div>
      );
    }

    if (stageKey === "assignment_deadline_24h") {
      const val = timing.hoursBefore ?? 24;
      const sendTimeVal = timing.sendTime ?? "09:00";
      if (canEditTiming && editable && enabled) {
        return (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <div className="flex items-center gap-1">
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
                className="h-7 w-12 text-xs text-center font-mono px-1"
              />
              <span className="text-muted-foreground text-[11px]">hrs before (or</span>
              <Input
                type="time"
                value={sendTimeVal}
                onChange={(e) =>
                  onChangeTiming?.(stageKey, {
                    sendTime: e.target.value,
                  })
                }
                className="h-7 w-[78px] text-xs text-center font-mono px-1"
                title="Target dispatch clock time"
              />
              <span className="text-muted-foreground text-[11px]">)</span>
            </div>
            {renderWarning(stageKey, "hoursBefore")}
            {renderWarning(stageKey, "sendTime")}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-mono">
            {val}h before due (at {sendTimeVal})
          </span>
          {renderWarning(stageKey, "hoursBefore")}
          {renderWarning(stageKey, "sendTime")}
        </div>
      );
    }

    return (
      <span className="text-[11px] text-muted-foreground/70 italic">Default event trigger</span>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/50">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/80 bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-24 font-semibold text-foreground">Day</TableHead>
            <TableHead className="font-semibold text-foreground">Stage</TableHead>
            <TableHead className="w-64 font-semibold text-foreground">Schedule / Timing</TableHead>
            <TableHead className="font-semibold text-foreground">Channels sent</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ stage, enabled, channels }) => {
            const deactivatedChannels = stage.channels.filter((c) => !channels.includes(c));

            return (
              <TableRow
                key={stage.key}
                className={cn(
                  "transition-colors border-b border-border/60",
                  !enabled && "opacity-50 bg-muted/10",
                )}
              >
                <TableCell className="whitespace-nowrap text-xs font-mono font-medium text-muted-foreground">
                  {editable ? (
                    <Input
                      value={stage.dayLabel}
                      onChange={(e) => onChangeDayLabel?.(stage.key, e.target.value)}
                      className="h-7 w-20 text-xs font-mono px-2 bg-transparent border-transparent hover:border-input focus:border-input transition-colors"
                    />
                  ) : (
                    stage.dayLabel
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    {editable ? (
                      <Checkbox
                        checked={enabled}
                        onCheckedChange={(checked) => onToggleStage?.(stage.key, checked === true)}
                      />
                    ) : (
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full transition-colors",
                          enabled
                            ? "bg-emerald-500 shadow-xs shadow-emerald-500/50"
                            : "bg-muted-foreground/30",
                        )}
                      />
                    )}
                    <div>
                      {editable ? (
                        <Input
                          value={stage.label}
                          onChange={(e) => onChangeLabel?.(stage.key, e.target.value)}
                          className={cn(
                            "h-7 text-xs px-2 mb-1 bg-transparent border-transparent hover:border-input focus:border-input transition-colors max-w-[220px]",
                            enabled ? "text-foreground" : "text-muted-foreground",
                          )}
                        />
                      ) : (
                        <p
                          className={cn(
                            "text-xs font-semibold",
                            enabled ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {stage.label}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {stage.description}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="align-middle">
                  {renderTimingCell(stage.key, enabled)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
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
            <TableRow className="border-b-0 bg-card/40 hover:bg-card/40">
              <TableCell className="align-top pt-4">
                <Input
                  placeholder="e.g. Day 7"
                  className="h-8 w-20 text-xs font-mono"
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                />
              </TableCell>
              <TableCell className="align-top pt-4" colSpan={2}>
                <Input
                  placeholder="Custom reminder name..."
                  className="h-8 text-xs max-w-[280px]"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </TableCell>
              <TableCell className="align-top pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
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
      <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-3.5 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 text-[11px]">
          {canEditTiming ? (
            <>
              <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
              Timing and reminder intervals are recruiter-configurable
            </>
          ) : (
            <>
              <Lock className="h-3 w-3 shrink-0" />
              Recruiter-configurable timing & schedule intervals
            </>
          )}
        </span>
        <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium border border-border/40">
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
          "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/60 select-none",
          editable && "hover:bg-muted cursor-pointer transition-colors",
        )}
        title={`${meta.label} is deactivated for this campaign`}
      >
        <X className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" />
        {Icon ? <Icon className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" /> : null}
        {meta.label}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={!editable}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400",
        editable && "hover:bg-emerald-500/20 cursor-pointer transition-colors",
      )}
    >
      <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
      {Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
      {meta.label}
    </button>
  );
}
