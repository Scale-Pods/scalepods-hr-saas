import { cn } from "@/lib/utils";

const STEPS = ["Basics", "Rounds", "Reach-out"];

export function StepsBar({ step }: { step: number }) {
  return (
    <ol
      className="flex gap-1 rounded-full bg-fill-quaternary p-1"
      aria-label="Campaign builder steps"
    >
      {STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === step ? "step" : undefined}
          className={cn(
            "flex-1 rounded-full px-3 py-2 text-center text-xs font-medium transition-colors",
            i === step
              ? "bg-glass-strong text-foreground shadow-sm"
              : i < step
                ? "text-primary"
                : "text-muted-foreground",
          )}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}
