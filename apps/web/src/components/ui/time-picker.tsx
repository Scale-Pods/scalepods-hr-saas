"use client";

import { Clock } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TimePickerProps {
  value?: string; // "HH:mm" (24-hour format, e.g. "09:00", "17:30")
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  size?: "default" | "sm";
}

/** Converts "HH:mm" 24h string into 12h parts */
function parseTime(timeStr?: string): { hour12: number; minute: number; period: "AM" | "PM" } {
  if (!timeStr?.includes(":")) {
    return { hour12: 9, minute: 0, period: "AM" };
  }
  const [hStr, mStr] = timeStr.split(":");
  const h24 = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;

  if (Number.isNaN(h24)) return { hour12: 9, minute: 0, period: "AM" };

  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;

  return { hour12, minute: m, period };
}

/** Formats 12h parts into standard 24h "HH:mm" */
function to24HourString(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h24 = hour12 % 12;
  if (period === "PM") h24 += 12;
  const hStr = String(h24).padStart(2, "0");
  const mStr = String(minute).padStart(2, "0");
  return `${hStr}:${mStr}`;
}

/** Formats 24h "HH:mm" string into friendly "hh:mm A" */
function formatDisplayTime(timeStr?: string): string {
  if (!timeStr) return "";
  const { hour12, minute, period } = parseTime(timeStr);
  const mStr = String(minute).padStart(2, "0");
  return `${String(hour12).padStart(2, "0")}:${mStr} ${period}`;
}

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 15, 30, 45];
const PRESETS = [
  { label: "9:00 AM", value: "09:00" },
  { label: "10:00 AM", value: "10:00" },
  { label: "1:00 PM", value: "13:00" },
  { label: "2:00 PM", value: "14:00" },
  { label: "5:00 PM", value: "17:00" },
  { label: "6:00 PM", value: "18:00" },
];

export function TimePicker({
  value,
  onChange,
  placeholder = "Select time",
  disabled = false,
  className,
  id,
  size = "default",
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const { hour12, minute, period } = React.useMemo(() => parseTime(value), [value]);

  const updateHour = (h: number) => {
    onChange(to24HourString(h, minute, period));
  };

  const updateMinute = (m: number) => {
    onChange(to24HourString(hour12, m, period));
  };

  const updatePeriod = (p: "AM" | "PM") => {
    onChange(to24HourString(hour12, minute, p));
  };

  const displayTime = React.useMemo(() => formatDisplayTime(value), [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-between rounded-xl border border-border bg-card text-left font-mono shadow-xs transition-colors hover:bg-muted/50",
            size === "sm" ? "h-7 text-xs px-2.5" : "h-10 text-sm px-3",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{displayTime || placeholder}</span>
          <Clock
            className={cn(
              "shrink-0 text-muted-foreground transition-colors group-hover:text-foreground",
              size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
            )}
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-72 p-3.5 rounded-2xl border border-border bg-card shadow-2xl z-[70] space-y-3.5 text-foreground"
        align="start"
      >
        {/* Header Preview */}
        <div className="flex items-center justify-between rounded-xl bg-muted/40 p-2.5 border border-border/60">
          <div className="flex items-baseline gap-1 font-mono text-xl font-bold tracking-tight text-foreground">
            <span>{String(hour12).padStart(2, "0")}</span>
            <span className="text-muted-foreground animate-pulse">:</span>
            <span>{String(minute).padStart(2, "0")}</span>
            <span className="ml-1 text-xs font-semibold text-primary">{period}</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-background/80 p-0.5 border border-border">
            <button
              type="button"
              onClick={() => updatePeriod("AM")}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-semibold transition-all",
                period === "AM"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => updatePeriod("PM")}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-semibold transition-all",
                period === "PM"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              PM
            </button>
          </div>
        </div>

        {/* Hours Selector */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hour
          </span>
          <div className="grid grid-cols-6 gap-1">
            {HOURS.map((h) => {
              const isSelected = hour12 === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => updateHour(h)}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg text-xs font-mono font-medium transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-muted/30 hover:bg-muted text-foreground border border-transparent hover:border-border",
                  )}
                >
                  {h}
                </button>
              );
            })}
          </div>
        </div>

        {/* Minutes Selector */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Minute
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {MINUTES.map((m) => {
              const isSelected = minute === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateMinute(m)}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg text-xs font-mono font-medium transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-muted/30 hover:bg-muted text-foreground border border-transparent hover:border-border",
                  )}
                >
                  :{String(m).padStart(2, "0")}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Workday Presets */}
        <div className="pt-2 border-t border-border space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Common Hours
          </span>
          <div className="grid grid-cols-3 gap-1">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onChange(preset.value)}
                className={cn(
                  "rounded-md py-1 px-1.5 text-[11px] font-mono transition-colors text-center border",
                  value === preset.value
                    ? "bg-primary/10 border-primary text-primary font-semibold"
                    : "bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Done Button */}
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(false)}
          className="w-full rounded-xl text-xs font-semibold"
        >
          Set Time
        </Button>
      </PopoverContent>
    </Popover>
  );
}
