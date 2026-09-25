import type { CadenceRenderRow } from "@scalepods/core";
import { Check, MessageSquare, Phone } from "lucide-react";
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
    <Table>
      <TableHeader>
        <TableRow className="bg-fill-quaternary/50">
          <TableHead>Day</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Channels sent</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ stage, enabled }) => (
          <TableRow key={stage.key} className={cn(!enabled && "opacity-50")}>
            <TableCell className="whitespace-nowrap text-xs text-label-secondary">
              {stage.dayLabel}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    enabled ? "bg-primary" : "bg-fill-quaternary",
                  )}
                />
                <div>
                  <p className="font-medium text-foreground">{stage.label}</p>
                  <p className="text-xs text-label-secondary">{stage.description}</p>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1.5">
                {stage.channels.map((c) => (
                  <ChannelPill key={c} channel={c} />
                ))}
                {stage.channels.length === 0 ? (
                  <span className="text-xs text-label-tertiary">Not sent on this plan</span>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ChannelPill({ channel }: { channel: "email" | "whatsapp" | "voice_call" }) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-fill-tertiary px-2 py-0.5 text-xs font-medium text-label-secondary">
      <Check className="h-3 w-3 text-success" aria-hidden />
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      {meta.label}
    </span>
  );
}
