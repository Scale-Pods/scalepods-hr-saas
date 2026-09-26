import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 py-2 text-sm text-foreground shadow-xs transition-all",
        "placeholder:text-muted-foreground/70",
        "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "selection:bg-primary selection:text-primary-foreground",
        "dark:bg-card dark:text-foreground dark:border-border",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
