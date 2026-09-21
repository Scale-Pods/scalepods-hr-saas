import { useCallback, useEffect, useState } from "react";
import { Zap, ExternalLink } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { browserClient } from "../lib/supabase";
import { callEdge, EdgeError } from "../lib/edge";
import { callWebhook } from "../lib/n8n";
import {
  reportsSchema,
  type Reports,
  TIER_LIMITS,
  limitLabel,
  tierAtLeast,
  type Tier,
  type TierLimits,
} from "@scalepods/core";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { UsageBar } from "../components/ui/ProgressBar";
import { Input } from "../components/ui/Input";
import { showErrorToast } from "../hooks/useToast";

const TIER_ORDER_COMPARE: Tier[] = ["free", "basic", "growth", "enterprise"];

const BILLING_STATUS_TONE: Record<
  string,
  { tone: "neutral" | "success" | "warning" | "danger" | "accent"; label: string }
> = {
  active: { tone: "success", label: "Active" },
  trialing: { tone: "accent", label: "Trialing" },
  past_due: { tone: "warning", label: "Past due" },
  canceled: { tone: "danger", label: "Canceled" },
  incomplete: { tone: "warning", label: "Incomplete" },
};

const COMPARE_METRICS: { key: keyof TierLimits; label: string; format: (v: TierLimits) => string }[] = [
  { key: "maxRounds", label: "Rounds per campaign", format: (t) => String(t.maxRounds) },
  { key: "activeCampaigns", label: "Active campaigns", format: (t) => limitLabel(t.activeCampaigns) },
  { key: "resumesScreened", label: "Resume screenings / mo", format: (t) => limitLabel(t.resumesScreened) },
  { key: "aiInterview", label: "AI interviews / mo", format: (t) => limitLabel(t.aiInterview) },
  { key: "aiVoiceScreening", label: "Voice screens / mo", format: (t) => limitLabel(t.aiVoiceScreening) },
  { key: "scheduledRound", label: "Scheduled rounds / mo", format: (t) => limitLabel(t.scheduledRound) },
  { key: "offersPerMonth", label: "Offer letters / mo", format: (t) => limitLabel(t.offersPerMonth) },
];

const FEATURE_ROWS: { label: string; ok: (t: TierLimits) => boolean }[] = [
  { label: "WhatsApp outreach", ok: (t) => t.whatsapp },
  { label: "Automated voice screening", ok: (t) => t.voiceScreening },
  { label: "Assignment rounds", ok: (t) => t.assignment },
  { label: "Custom sending identity", ok: (t) => t.customIdentity },
  { label: "SMS channel", ok: (t) => t.sms },
];

export function BillingPage() {
  const { account, user } = useAuth();
  const supabase = browserClient();
  const tier = account?.tier ?? "free";

  const [compareOpen, setCompareOpen] = useState(false);
  const [reports, setReports] = useState<Reports | null>(null);
  const [topupQty, setTopupQty] = useState(5);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);

  const loadReports = useCallback(async () => {
    if (!user?.id) return;
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await callWebhook<unknown>("reports", {
        method: "GET",
        query: { account_id: user.id },
        accessToken: token,
      });
      setReports(reportsSchema.parse(res));
    } catch {
      setReports(null);
    }
  }, [user?.id, supabase]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const startTopup = async () => {
    if (!user) return;
    setCheckoutBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await callEdge<{ url?: string; error?: string }>("checkout", {
        body: { account_id: user.id, credit_type: "ai_interview", quantity: topupQty },
        accessToken: token,
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
    if (!user) return;
    setPortalBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await callEdge<{ url?: string; error?: string }>("portal", {
        body: { account_id: user.id },
        accessToken: token,
      });
      if (res.url) window.location.assign(res.url);
      else showErrorToast(res.error ?? "Could not open billing portal.");
    } catch (err) {
      showErrorToast(err instanceof EdgeError ? err.message : err);
    } finally {
      setPortalBusy(false);
    }
  };

  const rows = [
    { label: "AI interviews", used: reports?.usage?.ai_interview?.used ?? 0, granted: reports?.usage?.ai_interview?.granted ?? null, fallback: TIER_LIMITS[tier].aiInterview },
    { label: "Voice screens", used: reports?.usage?.ai_voice_screening?.used ?? 0, granted: reports?.usage?.ai_voice_screening?.granted ?? null, fallback: TIER_LIMITS[tier].aiVoiceScreening },
    { label: "Scheduled rounds", used: reports?.usage?.scheduled_round?.used ?? 0, granted: reports?.usage?.scheduled_round?.granted ?? null, fallback: TIER_LIMITS[tier].scheduledRound },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Usage & billing</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Current plan{" "}
            <Badge tone="accent" className="ml-1">
              {TIER_LIMITS[tier].label}
            </Badge>
            <Badge
              tone={BILLING_STATUS_TONE[account?.billing_status ?? "active"]?.tone ?? "neutral"}
              className="ml-1"
            >
              {BILLING_STATUS_TONE[account?.billing_status ?? "active"]?.label ?? "Active"}
            </Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openPortal} loading={portalBusy}>
            Invoices <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button onClick={() => setCompareOpen(true)}>
            <Zap className="h-4 w-4" aria-hidden /> Upgrade
          </Button>
        </div>
      </div>

      {!reports ? (
        <Card>
          <CardHeader title="Your usage" subtitle="The reporting workflow (11) hasn't responded - showing plan allowances." />
          <div className="space-y-4">
            {rows.map((r) => (
              <UsageBar key={r.label} label={r.label} used={r.used} granted={r.fallback!} sub={`${TIER_LIMITS[tier].label} allowance`} />
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Your usage" subtitle="Used vs. granted this month · red past 90%" />
          <div className="space-y-4">
            {rows.map((r) => (
              <UsageBar key={r.label} label={r.label} used={r.used} granted={r.granted ?? r.fallback ?? null} />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Top up AI interviews"
          subtitle="Buy a pack of prepaid AI interview credits. Billed via Stripe Checkout."
        />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Credits</label>
            <Input
              type="number"
              min={1}
              max={100}
              value={topupQty}
              onChange={(e) => setTopupQty(Math.max(1, Math.min(100, Number(e.target.value))))}
              className="w-28"
            />
          </div>
          <Button onClick={() => void startTopup()} loading={checkoutBusy}>
            Purchase {topupQty} credits
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Consumption order: rolled-over credits, then this month's allowance, then purchased top-ups
          (expiring-soonest-first).
        </p>
      </Card>

      <Card>
        <CardHeader title="Invoice history" subtitle="Powered by the Stripe Customer Portal." />
        <p className="text-sm text-muted-foreground">
          Manage invoices, payment methods, and subscription changes in the portal. If no Stripe
          customer exists yet, the portal link will say so.
        </p>
      </Card>

      <TierCompareModal open={compareOpen} onClose={() => setCompareOpen(false)} currentTier={tier} />
    </div>
  );
}

function TierCompareModal({ open, onClose, currentTier }: { open: boolean; onClose: () => void; currentTier: Tier }) {
  return (
    <Modal open={open} onClose={onClose} title="Compare plans" wide>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Feature</th>
              {TIER_ORDER_COMPARE.map((t) => (
                <th key={t} className="px-2 py-2 font-medium">
                  <div className={t === currentTier ? "text-accent-foreground" : ""}>
                    {TIER_LIMITS[t].label}
                    {t === currentTier && <span className="ml-1">· you</span>}
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
    </Modal>
  );
}