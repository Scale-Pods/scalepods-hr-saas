import { cn } from "@/lib/utils";

const STEPS = ["Basics", "Rounds", "Reach-out"];

export function StepsBar({ step }: { step: number }) {
  return (
    <ol className="flex gap-2" aria-label="Campaign builder steps">
      {STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === step ? "step" : undefined}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-center text-xs font-medium transition-colors",
            i === step
              ? "bg-primary text-primary-foreground"
              : i < step
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground",
          )}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}
