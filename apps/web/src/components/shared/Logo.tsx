import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: 24,
  md: 28,
  lg: 36,
} as const;

export interface LogoProps {
  size?: keyof typeof SIZES;
  className?: string;
}

/** ScalePods brand mark. Inverted in dark mode, matching scalepods.co. */
export function Logo({ size = "md", className }: LogoProps) {
  const px = SIZES[size];
  return (
    <Image
      src="/brand/scalepods-logo.png"
      alt="ScalePods"
      width={px}
      height={px}
      className={cn("shrink-0 object-contain dark:invert", className)}
    />
  );
}
