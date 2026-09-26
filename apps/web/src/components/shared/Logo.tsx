import Image from "next/image";
import { cn } from "@/lib/utils";

export interface LogoProps {
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
  className?: string;
  priority?: boolean;
}

/** ScalePods brand logo matching the reference zip file. Inverted in dark mode. */
export function Logo({
  variant = "full",
  size = "md",
  className,
  priority = false,
}: LogoProps) {
  if (variant === "mark") {
    const px = size === "sm" ? 22 : size === "lg" ? 34 : 28;
    return (
      <Image
        src="/brand/scalepods-logo.png"
        alt="ScalePods"
        width={px}
        height={px}
        priority={priority}
        className={cn("shrink-0 object-contain dark:brightness-0 dark:invert", className)}
      />
    );
  }

  // Full navbar logo image matching the reference zip file (scalepods-navbar-logo.png)
  const height = size === "sm" ? 24 : size === "lg" ? 34 : 28;
  return (
    <Image
      src="/brand/scalepods-navbar-logo.png"
      alt="ScalePods"
      width={130}
      height={height}
      priority={priority}
      className={cn(
        "h-7 w-auto object-contain dark:brightness-0 dark:invert transition-all",
        size === "sm" && "h-6",
        size === "lg" && "h-8",
        className,
      )}
    />
  );
}
