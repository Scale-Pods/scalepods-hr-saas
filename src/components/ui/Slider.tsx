import { cn } from "../../lib/cn";

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
    </div>
  );
}