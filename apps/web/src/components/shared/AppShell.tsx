"use client";

import type { Tier } from "@scalepods/core";
import { initials, TIER_LIMITS } from "@scalepods/core";
import { ChevronsLeft, ChevronsRight, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSession, useSignOut } from "@/features/auth/hooks";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/stores/sidebar";
import { Logo } from "./Logo";
import { NavList } from "./NavList";
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

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="border-b border-sidebar-border px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Logo />
          {!collapsed ? (
            <span className="text-base font-semibold text-sidebar-foreground">ScalePods</span>
          ) : null}
        </Link>
      </div>
      <div className="flex-1 px-3 py-3">
        <NavList
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
      <div className="border-t border-sidebar-border p-3">
        <div
          className={cn(
            "mb-2 flex items-center gap-2 rounded-xl bg-sidebar-accent p-2",
            collapsed && "justify-center bg-transparent p-0",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-white">
            {initials(email)}
          </span>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-sidebar-foreground">{email}</p>
              <p className="text-[11px] text-sidebar-foreground/55">{tierLabel} plan</p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {!collapsed ? <span>Sign out</span> : null}
        </button>
      </div>
      <button
        type="button"
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
          "fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-border transition-[width] duration-200 lg:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {sidebar}
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo size="sm" />
          <span className="text-sm font-semibold text-foreground">ScalePods</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Toggle navigation">
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 border-sidebar-border bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <header
        className={cn(
          "sticky top-0 z-20 hidden items-center justify-between gap-3 border-b border-border bg-card px-6 py-3 lg:flex",
          collapsed ? "lg:ml-16" : "lg:ml-60",
        )}
      >
        <Badge variant="secondary">{tierLabel} plan</Badge>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <main className={cn(collapsed ? "lg:pl-16" : "lg:pl-60")}>
        {billingStatus === "past_due" ? (
          <div className="flex items-center justify-center gap-2 bg-accent px-4 py-2 text-center text-xs font-medium text-accent-foreground">
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
          <div className="flex items-center justify-center gap-2 bg-muted px-4 py-2 text-center text-xs font-medium text-muted-foreground">
            <span>
              Your plan is canceled, so the account is read-only.{" "}
              <Link href="/billing" className="underline underline-offset-2">
                Reactivate a plan
              </Link>{" "}
              to create campaigns or schedule rounds.
            </span>
          </div>
        ) : null}
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
