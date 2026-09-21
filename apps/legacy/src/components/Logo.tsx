import { cn } from "../lib/cn";

const BRAND_MARK = "/brand/scalepods-logo.png";

const SIZES = {
  sm: { px: 24 },
  md: { px: 28 },
  lg: { px: 36 },
} as const;

/**
 * ScalePods brand mark. Renders the official logo asset; pass `src` to use a
 * custom asset instead. The mark is inverted in dark mode, matching scalepods.co.
 */
export function Logo({
  size = "md",
  src,
  className,
}: {
  size?: keyof typeof SIZES;
  src?: string;
  className?: string;
}) {
  const conf = SIZES[size];
  return (
    <img
      src={src ?? BRAND_MARK}
      alt="ScalePods"
      style={{ width: conf.px, height: conf.px }}
      className={cn("shrink-0 object-contain dark:invert", className)}
    />
  );
}