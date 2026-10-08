import { BookOpen } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface HowToCreateButtonProps {
  className?: string;
  target?: string;
  rel?: string;
}

export default function HowToCreateButton({ className, target, rel }: HowToCreateButtonProps) {
  return (
    <Link
      href="/guide/create-campaign"
      target={target}
      rel={target === "_blank" ? (rel ?? "noopener noreferrer") : rel}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[#2f6bff]/40 bg-[#2f6bff]/10 px-3.5 py-1.5 text-xs font-semibold text-[#60a5fa] hover:bg-[#2f6bff]/20 hover:border-[#2f6bff]/60 hover:text-white transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]/50",
        className,
      )}
    >
      <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>How to create a campaign</span>
    </Link>
  );
}

export { HowToCreateButton };
