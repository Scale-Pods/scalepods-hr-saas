import { Check, MessageSquare, Phone } from "lucide-react";
import type { CadenceRenderRow } from "../lib/cadence";
import { cn } from "../lib/cn";

const CHANNEL_META = {
  email: { label: "Email", icon: null },
  whatsapp: { label: "WhatsApp", icon: MessageSquare },
  voice_call: { label: "Voice", icon: Phone },
} as const;

/**
 * Read-only reach-out cadence preview: renders exactly what the account's tier
 * would actually send (email always, WhatsApp/voice filtered by tier gates).
 */
export function CadencePreview({ rows }: { rows: CadenceRenderRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Day</th>
            <th className="px-3 py-2 font-medium">Stage</th>
            <th className="px-3 py-2 font-medium">Channels sent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(({ stage, enabled }) => (
            <tr key={stage.key} className={cn(!enabled && "opacity-50")}>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                {stage.dayLabel}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      enabled ? "bg-primary" : "bg-muted"
                    )}
                  />
                  <div>
                    <p className="font-medium text-foreground">{stage.label}</p>
                    <p className="text-xs text-muted-foreground">{stage.description}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {stage.channels.map((c) => (
                    <ChannelPill key={c} channel={c} />
                  ))}
                  {stage.channels.length === 0 && (
                    <span className="text-xs text-muted-foreground">Not sent on this plan</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChannelPill({ channel }: { channel: "email" | "whatsapp" | "voice_call" }) {
  const meta = CHANNEL_META[channel];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Check className="h-3 w-3 text-success" aria-hidden />
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      {meta.label}
    </span>
  );
}