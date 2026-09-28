import type { CadenceRenderRow } from "@scalepods/core";
import { Check, MessageSquare, Phone, X } from "lucide-react";
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

export function CadencePreview({ rows }: { rows: CadenceRenderRow[] }) {
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
                  {stage.dayLabel}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full transition-colors",
                        enabled ? "bg-emerald-500 shadow-xs shadow-emerald-500/50" : "bg-muted-foreground/30",
                      )}
                    />
                    <div>
                      <p className={cn("text-xs font-semibold", enabled ? "text-foreground" : "text-muted-foreground")}>
                        {stage.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">{stage.description}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Active channels with green tick */}
                    {channels.map((c) => (
                      <ChannelPill key={c} channel={c} active />
                    ))}

                    {/* Deactivated channels without green tick (struck-through, muted) */}
                    {deactivatedChannels.map((c) => (
                      <ChannelPill key={c} channel={c} active={false} />
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
        </TableBody>
      </Table>
    </div>
  );
}

function ChannelPill({
  channel,
  active = true,
}: {
  channel: "email" | "whatsapp" | "voice_call";
  active?: boolean;
}) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;

  if (!active) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/60 line-through select-none"
        title={`${meta.label} is deactivated for this campaign`}
      >
        <X className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" />
        {Icon ? <Icon className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" /> : null}
        {meta.label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
      <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" />
      {Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
      {meta.label}
    </span>
  );
}
