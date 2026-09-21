import type { LucideIcon } from "lucide-react";
import { FolderKanban, LayoutDashboard, Megaphone, Settings, Zap } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match the pathname exactly instead of also matching child routes. */
  exact?: boolean;
}

export const RECRUITER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/campaigns", label: "Campaigns", icon: FolderKanban },
  { href: "/campaigns/new", label: "New campaign", icon: Megaphone },
  { href: "/billing", label: "Usage & billing", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
