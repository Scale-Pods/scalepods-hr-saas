import { Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export interface ChannelToggleProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  lockText?: string;
  onCheckedChange: (checked: boolean) => void;
}

export function ChannelToggle({
  label,
  description,
  checked,
  disabled,
  lockText,
  onCheckedChange,
}: ChannelToggleProps) {
  if (disabled && lockText) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 text-xs transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
            <Lock className="h-2.5 w-2.5" aria-hidden />
          </div>
          <span className="font-medium text-muted-foreground truncate">{label}</span>
        </div>
        <span className="shrink-0 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/40">
          {lockText}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-separator bg-card px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}
