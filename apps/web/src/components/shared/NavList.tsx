import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isNavItemActive, RECRUITER_NAV } from "./nav-items";

export interface NavListProps {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}

/**
 * Primary recruiter navigation. Takes `pathname` as a prop (instead of calling
 * `usePathname`) so active-state rendering is trivially testable and reusable
 * in both the desktop rail and the mobile sheet.
 */
export function NavList({ pathname, collapsed = false, onNavigate }: NavListProps) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {collapsed ? (
        <div className="mx-3 mb-1 h-px bg-sidebar-border" />
      ) : (
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
          Recruiter
        </p>
      )}
      {RECRUITER_NAV.map((item) => {
        const active = isNavItemActive(pathname, item);
        const Icon = item.icon;
        const label = (
          <span className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className={collapsed ? "hidden" : undefined}>{item.label}</span>
          </span>
        );

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              collapsed && "justify-center px-2",
              active
                ? "bg-accent text-accent-foreground dark:bg-sidebar-primary dark:text-white"
                : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{label}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              label
            )}
          </Link>
        );
      })}
    </nav>
  );
}
