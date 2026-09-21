import { Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
  const row = (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
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

  if (disabled && lockText) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("opacity-80")}>{row}</div>
        </TooltipTrigger>
        <TooltipContent side="left">
          <div className="flex items-center gap-1.5">
            <Lock className="h-3 w-3" aria-hidden />
            {lockText}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return row;
}
