import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
} from "react-router-dom";
import {
  ChevronsLeft,
  ChevronsRight,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/cn";
import { TIER_LIMITS, initials } from "@scalepods/core";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";
import { Badge } from "./ui/Badge";
import { Tooltip } from "./ui/Tooltip";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/campaigns", label: "Campaigns", icon: FolderKanban, end: false },
  { to: "/campaigns/new", label: "New campaign", icon: Megaphone, end: false },
  { to: "/billing", label: "Usage & billing", icon: Zap, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

const COLLAPSE_KEY = "scale-pods-shell-collapsed";

function collapsedStored(): boolean {
  return localStorage.getItem(COLLAPSE_KEY) === "1";
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(collapsedStored);
  const { user, account, signOut } = useAuth();
  const navigate = useNavigate();
  const tier = account?.tier ?? "free";
  const tierLabel = TIER_LIMITS[tier]?.label ?? tier;
  const billingStatus = account?.billing_status ?? "active";

  const toggleCollapsed = () =>
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {collapsed ? (
        <div className="mx-3 mb-1 h-px bg-sidebar-border" />
      ) : (
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
          Recruiter
        </p>
      )}
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              collapsed && "justify-center px-2",
              isActive
                ? "bg-sidebar-primary text-white shadow-sm shadow-black/20"
                : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )
          }
        >
          <Tooltip side="right" disabled={!collapsed} label={item.label}>
            <span
              className={cn(
                "flex items-center gap-2.5",
                collapsed && "justify-center"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              <span
                className={cn(
                  "transition-opacity",
                  collapsed && "hidden"
                )}
              >
                {item.label}
              </span>
            </span>
          </Tooltip>
        </NavLink>
      ))}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-4 py-4">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <Logo />
          <span
            className={cn(
              "text-base font-semibold text-sidebar-foreground",
              collapsed && "hidden"
            )}
          >
            ScalePods
          </span>
        </Link>
      </div>
      <div className="flex-1 px-3">{nav}</div>
      <div className="border-t border-sidebar-border p-3">
        <div className={cn("mb-2 flex items-center gap-2 rounded-xl bg-sidebar-accent p-2", collapsed && "justify-center bg-transparent p-0")}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-white">
            {initials(user?.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-sidebar-foreground">
              {user?.email}
            </p>
            <p className="text-[11px] text-sidebar-foreground/55">{tierLabel} plan</p>
          </div>
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate("/auth");
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className={cn("transition-opacity", collapsed && "opacity-0")}>
            Sign out
          </span>
        </button>
      </div>
      <button
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden w-full items-center justify-center border-t border-sidebar-border py-2 text-muted-foreground hover:text-foreground lg:flex"
      >
        {collapsed ? (
          <ChevronsRight className="h-4 w-4" aria-hidden />
        ) : (
          <ChevronsLeft className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {sidebar}
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <Logo size="sm" />
          <span className="text-sm font-semibold text-foreground">ScalePods</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation"
            className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>
      <header
        className={cn(
          "sticky top-0 z-20 hidden items-center justify-between gap-3 border-b border-border bg-card/80 px-6 py-3 backdrop-blur lg:flex",
          collapsed ? "lg:ml-16" : "lg:ml-60"
        )}
      >
        <Badge tone="accent">{tierLabel} plan</Badge>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-60 bg-sidebar shadow-xl">
            {sidebar}
          </div>
        </div>
      )}
      <main className={cn(collapsed ? "lg:pl-16" : "lg:pl-60")}>
        {billingStatus === "past_due" && (
          <div className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-center text-xs font-medium text-warning">
            <span>
              Your billing is past due.{" "}
              <Link to="/billing" className="underline underline-offset-2">
                Update payment details
              </Link>{" "}
              to keep campaigns running.
            </span>
          </div>
        )}
        {billingStatus === "canceled" && (
          <div className="flex items-center justify-center gap-2 bg-muted px-4 py-2 text-center text-xs font-medium text-muted-foreground">
            <span>
              Your plan is canceled, so the account is read-only.{" "}
              <Link to="/billing" className="underline underline-offset-2">
                Reactivate a plan
              </Link>{" "}
              to create campaigns or schedule rounds.
            </span>
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}