"use client";

import { limitLabel, TIER_LIMITS, type Tier, type TierLimits, tierAtLeast } from "@scalepods/core";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Info, Loader2, Receipt, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { RazorpayInvoiceItem } from "@/app/api/razorpay/invoices/route";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useAccount } from "@/features/account/hooks";
import { useSession } from "@/features/auth/hooks";
import { useReports } from "@/features/dashboard/hooks";
import { reconcileUsage } from "@/features/dashboard/usage";
import { cn } from "@/lib/utils";

const TIER_ORDER_COMPARE: Tier[] = ["free", "basic", "growth", "enterprise"];

const BILLING_STATUS_TONE: Record<
  string,
  {
    variant: "default" | "secondary" | "destructive" | "outline";
    className?: string;
    label: string;
  }
> = {
  active: { variant: "secondary", className: "bg-success/15 text-success", label: "Active" },
  trialing: { variant: "default", label: "Trialing" },
  past_due: { variant: "secondary", className: "bg-warning/15 text-warning", label: "Past due" },
  canceled: { variant: "destructive", label: "Canceled" },
  incomplete: {
    variant: "secondary",
    className: "bg-warning/15 text-warning",
    label: "Incomplete",
  },
};

const COMPARE_METRICS: {
  key: keyof TierLimits;
  label: string;
  format: (t: TierLimits) => string;
}[] = [
  { key: "maxRounds", label: "Rounds / campaign", format: (t) => String(t.maxRounds) },
  {
    key: "activeCampaigns",
    label: "Active campaigns",
    format: (t) => limitLabel(t.activeCampaigns),
  },
  {
    key: "resumesScreened",
    label: "Resume screens / mo",
    format: (t) => limitLabel(t.resumesScreened),
  },
  { key: "aiInterview", label: "AI interviews / mo", format: (t) => limitLabel(t.aiInterview) },
  {
    key: "aiVoiceScreening",
    label: "Voice screens / mo",
    format: (t) => limitLabel(t.aiVoiceScreening),
  },
  {
    key: "scheduledRound",
    label: "Scheduled rounds / mo",
    format: (t) => limitLabel(t.scheduledRound),
  },
  {
    key: "offersPerMonth",
    label: "Offer letters / mo",
    format: (t) => limitLabel(t.offersPerMonth),
  },
];

function getInvoiceStatusMeta(status: string) {
  switch (status.toLowerCase()) {
    case "paid":
      return { label: "Paid", className: "bg-success/15 text-success border-success/30" };
    case "issued":
      return { label: "Pending", className: "bg-warning/15 text-warning border-warning/30" };
    case "cancelled":
    case "canceled":
      return {
        label: "Canceled",
        className: "bg-destructive/15 text-destructive border-destructive/30",
      };
    case "expired":
      return { label: "Expired", className: "bg-muted text-muted-foreground border-border" };
    default:
      return { label: status, className: "bg-muted text-muted-foreground border-border" };
  }
}

export default function BillingPage() {
  const { account, refreshAccount } = useAccount();
  const { data: session } = useSession();
  const { data: reports } = useReports(account?.id);
  const tier = (account?.tier ?? "free") as Tier;
  const billingStatus = account?.billing_status ?? "active";

  const [compareOpen, setCompareOpen] = useState(false);

  // Preload Razorpay checkout script in the background
  useEffect(() => {
    loadRazorpayCheckoutScript();
  }, []);

  const { data: invoices, isLoading: invoicesLoading } = useQuery<RazorpayInvoiceItem[]>({
    queryKey: ["razorpay-invoices", account?.id],
    queryFn: async () => {
      const res = await fetch("/api/razorpay/invoices", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load invoices");
      const json = await res.json();
      return json.invoices || [];
    },
    enabled: !!account?.id,
  });

  const statusMeta = BILLING_STATUS_TONE[billingStatus] ?? BILLING_STATUS_TONE.active;

  const reconciled = reconcileUsage(reports?.usage, tier);
  const usageRows = [
    {
      label: "AI interviews",
      used: reconciled.ai_interview.used,
      granted: reconciled.ai_interview.granted,
    },
    {
      label: "Voice screens",
      used: reconciled.ai_voice_screening.used,
      granted: reconciled.ai_voice_screening.granted,
    },
    {
      label: "Scheduled rounds",
      used: reconciled.scheduled_round.used,
      granted: reconciled.scheduled_round.granted,
    },
  ];

  const scrollToInvoices = () => {
    document.getElementById("invoice-history")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage & billing"
        subtitle={
          <>
            Current plan{" "}
            <Badge variant="secondary" className="bg-primary/15 text-primary">
              {TIER_LIMITS[tier].label}
            </Badge>
            <Badge variant={statusMeta.variant} className={cn("ml-1", statusMeta.className)}>
              {statusMeta.label}
            </Badge>
          </>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={scrollToInvoices}>
              Invoices <Receipt className="h-3.5 w-3.5 ml-1.5" aria-hidden />
            </Button>
            {tier !== "enterprise" ? (
              <Button onClick={() => setCompareOpen(true)}>
                <Zap className="h-4 w-4" aria-hidden /> Upgrade
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setCompareOpen(true)}>
                Compare plans
              </Button>
            )}
          </div>
        }
      />

      <SectionCard title="Your usage" subtitle="Used vs. granted this month · red past 90%">
        <div className="space-y-4">
          {usageRows.map((r) => {
            const pct = r.granted ? Math.min(100, Math.round((r.used / r.granted) * 100)) : 0;
            return (
              <div key={r.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{r.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {r.used} / {r.granted ?? "—"}
                  </span>
                </div>
                <Progress
                  value={pct}
                  className={cn("h-2", pct > 90 && "bg-destructive/20 [&>div]:bg-destructive")}
                />
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div id="invoice-history">
        <SectionCard
          title="Invoice history"
          subtitle="View and download receipts for all your subscription payments"
        >
          {invoicesLoading ? (
            <div className="py-8 flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading invoices...
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No invoices generated yet. Invoices appear here automatically once your subscription
              is billed.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/70 text-muted-foreground">
                    <th className="pb-2.5 font-medium">Date</th>
                    <th className="pb-2.5 font-medium">Description</th>
                    <th className="pb-2.5 font-medium">Amount</th>
                    <th className="pb-2.5 font-medium">Status</th>
                    <th className="pb-2.5 font-medium text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {invoices.map((inv) => {
                    const formattedDate = inv.date
                      ? new Date(inv.date * 1000).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—";

                    const formattedAmount =
                      inv.currency === "INR"
                        ? `₹${(inv.amount / 100).toFixed(2)}`
                        : `$${(inv.amount / 100).toFixed(2)}`;

                    return (
                      <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 font-medium text-foreground">{formattedDate}</td>
                        <td className="py-3 text-muted-foreground">{inv.description}</td>
                        <td className="py-3 tabular-nums font-medium text-foreground">
                          {formattedAmount}
                        </td>
                        <td className="py-3">
                          {(() => {
                            const meta = getInvoiceStatusMeta(inv.status);
                            return (
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] font-medium border", meta.className)}
                              >
                                {meta.label}
                              </Badge>
                            );
                          })()}
                        </td>
                        <td className="py-3 text-right">
                          {inv.url ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-primary hover:text-primary"
                              asChild
                            >
                              <a href={inv.url} target="_blank" rel="noopener noreferrer">
                                {inv.status === "paid" ? "View / PDF" : "Pay / View"}{" "}
                                <ExternalLink className="ml-1 h-3 w-3" />
                              </a>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {tier !== "free" && (
        <SectionCard
          title="Subscription & Downgrade Policy"
          subtitle="Information on plan adjustments and renewal cycles"
        >
          <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/30 p-4 text-xs text-muted-foreground">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="font-medium text-foreground">
                Current Plan: <span className="capitalize">{TIER_LIMITS[tier].label}</span>
              </p>
              <p className="leading-relaxed">
                If you wish to downgrade your plan, you can do that at the end of your billing
                period (at the end of the month or at the end of your subscription cycle). Mid-cycle
                downgrades are restricted so your current allowance and features remain fully
                accessible through the paid period.
              </p>
              {account?.next_billing_date && (
                <p className="text-muted-foreground/80 pt-0.5">
                  Next renewal / billing date:{" "}
                  <strong className="text-foreground">
                    {new Date(account.next_billing_date).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </strong>
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      <TierCompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        currentTier={tier}
        accessToken={session?.access_token}
        onPlanUpdated={refreshAccount}
      />
    </div>
  );
}

function loadRazorpayCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);

    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) return resolve(true);

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const PLAN_PRICING_DISPLAY: Record<Tier, { price: string; period: string }> = {
  free: { price: "₹0", period: "forever" },
  basic: { price: "₹1", period: "/ month" },
  growth: { price: "₹2", period: "/ month" },
  enterprise: { price: "₹3", period: "/ month" },
};

function TierCompareModal({
  open,
  onClose,
  currentTier,
  accessToken,
  onPlanUpdated,
}: {
  open: boolean;
  onClose: () => void;
  currentTier: Tier;
  accessToken?: string;
  onPlanUpdated?: () => void;
}) {
  const [subscribingTier, setSubscribingTier] = useState<Tier | null>(null);

  const handleUpgrade = async (t: Tier) => {
    const currentIndex = TIER_ORDER_COMPARE.indexOf(currentTier);
    const targetIndex = TIER_ORDER_COMPARE.indexOf(t);
    if (targetIndex <= currentIndex) return;
    setSubscribingTier(t);

    try {
      const scriptReady = await loadRazorpayCheckoutScript();
      if (!scriptReady) {
        toast.error("Could not load Razorpay checkout script. Please check your connection.");
        setSubscribingTier(null);
        return;
      }

      const res = await fetch("/api/razorpay/create-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ tier: t }),
      });

      const data = await res.json();
      if (!res.ok || !data.subscription_id) {
        toast.error(data.error || "Failed to initialize Razorpay subscription.");
        setSubscribingTier(null);
        return;
      }

      const RazorpayConstructor = (
        window as unknown as {
          Razorpay: new (options: Record<string, unknown>) => { open: () => void };
        }
      ).Razorpay;

      const limits = TIER_LIMITS[t];
      const rzp = new RazorpayConstructor({
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: "ScalePods HR SaaS",
        description: `${limits.label} Plan Subscription`,
        prefill: {
          name: data.customer_name || "",
          email: data.customer_email || "",
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
              },
              body: JSON.stringify({
                ...response,
                tier: t,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              toast.success(`Subscribed to ${limits.label} plan successfully!`);
              onPlanUpdated?.();
              onClose();
            } else {
              toast.error(verifyData.error || "Payment verification failed.");
            }
          } catch {
            toast.error("Payment confirmation failed. Webhook will process your order shortly.");
          } finally {
            setSubscribingTier(null);
          }
        },
        modal: {
          ondismiss: () => {
            setSubscribingTier(null);
          },
        },
        theme: {
          color: "#4f46e5",
        },
      });

      rzp.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error initiating checkout.");
      setSubscribingTier(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>Compare plans</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TIER_ORDER_COMPARE.map((t) => {
              const limits = TIER_LIMITS[t];
              const isCurrent = t === currentTier;
              const isBusy = subscribingTier === t;
              const pricing = PLAN_PRICING_DISPLAY[t];
              const currentIndex = TIER_ORDER_COMPARE.indexOf(currentTier);
              const targetIndex = TIER_ORDER_COMPARE.indexOf(t);
              const isDowngrade = targetIndex < currentIndex;

              return (
                <div
                  key={t}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border p-4",
                    isCurrent
                      ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
                      : "border-border",
                  )}
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <p className="font-semibold text-foreground text-base">{limits.label}</p>
                      </div>
                      {isCurrent ? (
                        <Badge
                          variant="secondary"
                          className="bg-primary/15 text-primary text-[10px]"
                        >
                          Current
                        </Badge>
                      ) : null}
                    </div>

                    <div className="my-1 flex items-baseline gap-1">
                      <span className="text-xl font-bold tracking-tight text-foreground">
                        {pricing.price}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{pricing.period}</span>
                    </div>

                    <p className="text-[11px] text-muted-foreground pb-3 border-b border-border/50">
                      {t === "free"
                        ? "Basic plan to get started"
                        : t === "basic"
                          ? "Ideal for individual recruiters"
                          : t === "growth"
                            ? "Best for growing agencies"
                            : "Custom solutions for large orgs"}
                    </p>
                  </div>
                  <ul className="space-y-3 text-xs text-muted-foreground mt-2">
                    {COMPARE_METRICS.slice(0, 4).map((m) => (
                      <li key={m.key} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          <strong className="font-medium text-foreground">
                            {m.format(limits)}
                          </strong>{" "}
                          {m.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-4 mt-auto">
                    {isCurrent ? (
                      <Button variant="outline" className="w-full rounded-full" size="sm" disabled>
                        Current plan
                      </Button>
                    ) : isDowngrade ? (
                      <div className="space-y-1 text-center">
                        <Button
                          variant="outline"
                          className="w-full rounded-full opacity-50 cursor-not-allowed"
                          size="sm"
                          disabled
                        >
                          Included
                        </Button>
                        <p className="text-[10px] text-muted-foreground">Downgrade at period end</p>
                      </div>
                    ) : (
                      <Button
                        variant="default"
                        className="w-full rounded-full shadow-sm"
                        size="sm"
                        disabled={subscribingTier !== null}
                        onClick={() => handleUpgrade(t)}
                      >
                        {isBusy ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          "Upgrade"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {currentTier !== "free" && (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Plan Downgrade Policy</p>
              <p className="mt-0.5 leading-relaxed">
                If you want to downgrade your plan, you can do that at the end of the billing period
                (at the end of the month or at the end of your subscription). Please contact support
                before your next billing date to schedule a downgrade.
              </p>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Usage gates are indicative here; the credit guard enforces limits server-side.
          {tierAtLeast(currentTier, "growth") ? " SMS & overage true-up are Enterprise-only." : ""}
        </p>
      </DialogContent>
    </Dialog>
  );
}
