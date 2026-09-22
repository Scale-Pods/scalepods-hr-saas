"use client";

import { limitLabel, TIER_LIMITS, type Tier, type TierLimits, tierAtLeast } from "@scalepods/core";
import { ExternalLink, Zap } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { showErrorToast } from "@/components/shared/TierLimitToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAccount } from "@/features/account/hooks";
import { useSession } from "@/features/auth/hooks";
import { useReports } from "@/features/dashboard/hooks";
import { reconcileUsage } from "@/features/dashboard/usage";
import { callEdge, EdgeError } from "@/lib/edge";
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
  active: { variant: "secondary", className: "bg-success/10 text-success", label: "Active" },
  trialing: { variant: "default", label: "Trialing" },
  past_due: { variant: "secondary", className: "bg-warning/10 text-warning", label: "Past due" },
  canceled: { variant: "destructive", label: "Canceled" },
  incomplete: {
    variant: "secondary",
    className: "bg-warning/10 text-warning",
    label: "Incomplete",
  },
};

const COMPARE_METRICS: {
  key: keyof TierLimits;
  label: string;
  format: (t: TierLimits) => string;
}[] = [
  { key: "maxRounds", label: "Rounds per campaign", format: (t) => String(t.maxRounds) },
  {
    key: "activeCampaigns",
    label: "Active campaigns",
    format: (t) => limitLabel(t.activeCampaigns),
  },
  {
    key: "resumesScreened",
    label: "Resume screenings / mo",
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

const FEATURE_ROWS: { label: string; ok: (t: TierLimits) => boolean }[] = [
  { label: "WhatsApp outreach", ok: (t) => t.whatsapp },
  { label: "Automated voice screening", ok: (t) => t.voiceScreening },
  { label: "Assignment rounds", ok: (t) => t.assignment },
  { label: "Custom sending identity", ok: (t) => t.customIdentity },
  { label: "SMS channel", ok: (t) => t.sms },
];

export default function BillingPage() {
  const { account } = useAccount();
  const { data: session } = useSession();
  const { data: reports } = useReports(account?.id);
  const tier = (account?.tier ?? "free") as Tier;
  const billingStatus = account?.billing_status ?? "active";

  const [compareOpen, setCompareOpen] = useState(false);
  const [topupQty, setTopupQty] = useState(5);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

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

  const startTopup = async () => {
    if (!account?.id) return;
    setCheckoutBusy(true);
    try {
      const res = await callEdge<{ url?: string; error?: string }>("checkout", {
        body: { account_id: account.id, credit_type: "ai_interview", quantity: topupQty },
        accessToken: session?.access_token,
      });
      if (res.url) window.location.assign(res.url);
      else showErrorToast(res.error ?? "Could not create a checkout session.");
    } catch (err) {
      showErrorToast(err instanceof EdgeError ? err.message : err);
    } finally {
      setCheckoutBusy(false);
    }
  };

  const openPortal = async () => {
    if (!account?.id) return;
    setPortalBusy(true);
    try {
      const res = await callEdge<{ url?: string; error?: string }>("portal", {
        body: { account_id: account.id },
        accessToken: session?.access_token,
      });
      if (res.url) window.location.assign(res.url);
      else showErrorToast(res.error ?? "Could not open billing portal.");
    } catch (err) {
      showErrorToast(err instanceof EdgeError ? err.message : err);
    } finally {
      setPortalBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage & billing"
        subtitle={
          <>
            Current plan{" "}
            <Badge variant="secondary" className="bg-accent text-primary">
              {TIER_LIMITS[tier].label}
            </Badge>
            <Badge variant={statusMeta.variant} className={cn("ml-1", statusMeta.className)}>
              {statusMeta.label}
            </Badge>
          </>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openPortal} disabled={portalBusy}>
              Invoices <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button onClick={() => setCompareOpen(true)}>
              <Zap className="h-4 w-4" aria-hidden /> Upgrade
            </Button>
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

      <SectionCard
        title="Top up AI interviews"
        subtitle="Buy a pack of prepaid AI interview credits. Billed via Stripe Checkout."
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="topup-qty"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Credits
            </label>
            <Input
              id="topup-qty"
              type="number"
              min={1}
              max={100}
              value={topupQty}
              onChange={(e) => setTopupQty(Math.max(1, Math.min(100, Number(e.target.value))))}
              className="w-28"
            />
          </div>
          <Button onClick={startTopup} disabled={checkoutBusy}>
            Purchase {topupQty} credits
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Consumption order: rolled-over credits, then this month&apos;s allowance, then purchased
          top-ups (expiring-soonest-first).
        </p>
      </SectionCard>

      <SectionCard title="Invoice history" subtitle="Powered by the Stripe Customer Portal.">
        <p className="text-sm text-muted-foreground">
          Manage invoices, payment methods, and subscription changes in the portal. If no Stripe
          customer exists yet, the portal link will say so.
        </p>
      </SectionCard>

      <TierCompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        currentTier={tier}
      />
    </div>
  );
}

function TierCompareModal({
  open,
  onClose,
  currentTier,
}: {
  open: boolean;
  onClose: () => void;
  currentTier: Tier;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compare plans</DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Feature</th>
                {TIER_ORDER_COMPARE.map((t) => (
                  <th key={t} className="px-2 py-2 font-medium">
                    <div className={t === currentTier ? "text-primary font-semibold" : ""}>
                      {TIER_LIMITS[t].label}
                      {t === currentTier && <span className="ml-1 font-normal">· you</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COMPARE_METRICS.map((m) => (
                <tr key={m.key}>
                  <td className="py-2.5 pr-4 text-foreground">{m.label}</td>
                  {TIER_ORDER_COMPARE.map((t) => (
                    <td key={t} className="px-2 py-2.5 text-muted-foreground">
                      {m.format(TIER_LIMITS[t])}
                    </td>
                  ))}
                </tr>
              ))}
              {FEATURE_ROWS.map((f) => (
                <tr key={f.label}>
                  <td className="py-2.5 pr-4 text-foreground">{f.label}</td>
                  {TIER_ORDER_COMPARE.map((t) => (
                    <td key={t} className="px-2 py-2.5">
                      {f.ok(TIER_LIMITS[t]) ? (
                        <span className="text-success">✓</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Usage gates are indicative here; the credit guard enforces limits server-side.
          {tierAtLeast(currentTier, "growth") ? " SMS & overage true-up are Enterprise-only." : ""}
        </p>
      </DialogContent>
    </Dialog>
  );
}
