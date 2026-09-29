import type { CadenceChannel, CadenceRenderRow } from "@scalepods/core";
import { Check, MessageSquare, Phone, Plus, X } from "lucide-react";
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

export interface CadencePreviewProps {
  rows: CadenceRenderRow[];
  editable?: boolean;
  onToggleStage?: (stageKey: string, enabled: boolean) => void;
  onToggleChannel?: (stageKey: string, channel: CadenceChannel, enabled: boolean) => void;
  onChangeDayLabel?: (stageKey: string, newDayLabel: string) => void;
  onChangeLabel?: (stageKey: string, newLabel: string) => void;
  onAddCustomStage?: (dayLabel: string, label: string) => void;
}

export function CadencePreview({
  rows,
  editable,
  onToggleStage,
  onToggleChannel,
  onChangeDayLabel,
  onChangeLabel,
  onAddCustomStage,
}: CadencePreviewProps) {
  const [newDay, setNewDay] = useState("");
  const [newLabel, setNewLabel] = useState("");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/50">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/80 bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-28 font-semibold text-foreground">Day</TableHead>
            <TableHead className="font-semibold text-foreground">Stage</TableHead>
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
                      className="h-7 w-24 text-xs font-mono px-2 bg-transparent border-transparent hover:border-input focus:border-input transition-colors"
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
                            "h-7 text-xs px-2 mb-1 bg-transparent border-transparent hover:border-input focus:border-input transition-colors max-w-[240px]",
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

                    {/* Deactivated channels without green tick (struck-through, muted) */}
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
                  className="h-8 w-24 text-xs font-mono"
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                />
              </TableCell>
              <TableCell className="align-top pt-4">
                <Input
                  placeholder="Custom reminder name..."
                  className="h-8 text-xs max-w-[240px]"
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
