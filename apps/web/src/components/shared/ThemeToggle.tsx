"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ThemeChoice = "light" | "dark" | "system";

const OPTIONS: { value: ThemeChoice; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes cannot know the resolved theme until after hydration, so keep
  // the control inert until mounted to avoid a server/client mismatch.
  useEffect(() => setMounted(true), []);

  return (
    <fieldset
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5",
        className,
      )}
    >
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = mounted && option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            disabled={!mounted}
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-60",
              selected
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}
    </fieldset>
  );
}
