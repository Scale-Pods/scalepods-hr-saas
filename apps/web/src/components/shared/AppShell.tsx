"use client";

import type { Tier } from "@scalepods/core";
import { initials, TIER_LIMITS } from "@scalepods/core";
import { ChevronsLeft, ChevronsRight, LogOut, Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSession, useSignOut } from "@/features/auth/hooks";

import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/stores/sidebar";
import { Logo } from "./Logo";
import { NavList } from "./NavList";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

export type BillingStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";

export interface AppShellProps {
  children: React.ReactNode;
  tier?: Tier;
  billingStatus?: BillingStatus;
}

export function AppShell({ children, tier = "free", billingStatus = "active" }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggleCollapsed = useSidebarStore((state) => state.toggle);
  const { data: session } = useSession();
  const signOut = useSignOut();

  const email = session?.user?.email;
  const tierLabel = TIER_LIMITS[tier]?.label ?? tier;

  const handleSignOut = async () => {
    await signOut.mutateAsync(undefined);
    router.push("/auth");
  };

  /** Sidebar inner content — shared between desktop and mobile sheet */
  const sidebar = (
    <div className="flex h-full flex-col py-7 px-3.5">
      {/* Logo */}
      <div
        className={cn(
          "mb-8 flex items-center border-b border-border pb-6",
          collapsed ? "justify-center" : "px-2",
        )}
      >
        {collapsed ? <Logo variant="mark" size="md" /> : <Logo variant="full" size="md" />}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto">
        <NavList
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>

      {/* Footer */}
      <div className="border-t border-border pt-4 space-y-1">
        <button
          type="button"
          onClick={handleSignOut}
          className={cn("nav-item w-full text-left", collapsed && "justify-center px-2")}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed ? <span>Sign out</span> : null}
        </button>
      </div>

      {/* User chip */}
      {!collapsed ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-full bg-fill-tertiary px-3 py-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {initials(email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-foreground">{email}</p>
            <p className="text-[11px] text-muted-foreground">{tierLabel} plan</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {initials(email)}
          </span>
        </div>
      )}

      {/* Collapse toggle — desktop only */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="mt-3 hidden w-full items-center justify-center rounded-full py-1.5 text-muted-foreground transition-colors hover:bg-fill-tertiary hover:text-foreground lg:flex"
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
    <div className="relative flex min-h-screen bg-background overflow-x-hidden">
      {/* Ambient background mesh glow */}
      <div className="pointer-events-none fixed -top-40 right-[-10%] z-0 h-[600px] w-[600px] rounded-full bg-blue-500/[0.04] blur-[120px] dark:bg-blue-600/[0.07]" />
      <div className="pointer-events-none fixed top-[45%] left-[-10%] z-0 h-[500px] w-[500px] rounded-full bg-cyan-500/[0.03] blur-[100px] dark:bg-cyan-600/[0.05]" />

      {/* Desktop sidebar — floating capsule */}
      <aside
        className={cn(
          "sidebar fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-300 lg:block",
          "m-5 h-[calc(100vh-40px)] rounded-[44px]",
          collapsed ? "w-[72px]" : "w-[220px]",
        )}
      >
        {sidebar}
      </aside>

      {/* Main content area */}
      <div
        className={cn(
          "relative z-10 flex flex-1 flex-col transition-[margin] duration-300 min-w-0",
          collapsed ? "lg:ml-[calc(72px+40px)]" : "lg:ml-[calc(220px+40px)]",
        )}
      >
        {/* Floating glass topbar — desktop */}
        <header className="sticky top-4 z-20 mx-5 hidden lg:block">
          <div className="sp-topbar flex items-center justify-between gap-4 px-5 py-3">
            {/* Left — breadcrumb */}
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">ScalePods</span>
              <span className="text-xs text-muted-foreground/50">/</span>
              <span className="text-xs font-semibold text-foreground capitalize">
                {pathname.split("/")[1] || "dashboard"}
              </span>
            </div>

            {/* Center — search with shortcut */}
            <div className="flex max-w-sm flex-1 items-center justify-between rounded-full bg-black/[0.03] px-3.5 py-1.5 transition-all focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/20 dark:bg-white/[0.05]">
              <div className="flex items-center gap-2.5 min-w-0">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate text-xs text-muted-foreground">
                  Search candidates, campaigns…
                </span>
              </div>
              <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-xs">
                ⌘K
              </kbd>
            </div>

            {/* Right — actions */}
            <div className="flex items-center gap-1.5">
              <NotificationBell />
              <ThemeToggle />
              <Badge
                variant="secondary"
                className="ml-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border border-border"
              >
                {tierLabel}
              </Badge>
            </div>
          </div>
        </header>

        {/* Mobile topbar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/90 backdrop-blur-md px-4 py-3 lg:hidden">
          <Link href="/dashboard" className="flex items-center">
            <Logo variant="full" size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Toggle navigation"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-fill-tertiary hover:text-foreground"
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="sidebar w-[220px] rounded-r-[44px] border-0 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                {sidebar}
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Billing banners */}
        {billingStatus === "past_due" ? (
          <div className="mx-5 mt-2 flex items-center justify-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-400 border border-amber-500/20">
            <span>
              Your billing is past due.{" "}
              <Link href="/billing" className="underline underline-offset-2">
                Update payment details
              </Link>{" "}
              to keep campaigns running.
            </span>
          </div>
        ) : null}
        {billingStatus === "canceled" ? (
          <div className="mx-5 mt-2 flex items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-2 text-center text-xs font-medium text-muted-foreground border border-border">
            <span>
              Your plan is canceled — account is read-only.{" "}
              <Link href="/billing" className="underline underline-offset-2">
                Reactivate a plan
              </Link>{" "}
              to resume.
            </span>
          </div>
        ) : null}

        {/* Page content */}
        <main className="flex-1 px-5 py-5 pt-6">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
