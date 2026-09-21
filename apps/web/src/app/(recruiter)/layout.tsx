"use client";

import { AppShell, type BillingStatus } from "@/components/shared/AppShell";
import { useAccount } from "@/features/account/hooks";

const BILLING_STATUSES: BillingStatus[] = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
];

function toBillingStatus(value: string | null | undefined): BillingStatus {
  return BILLING_STATUSES.includes(value as BillingStatus) ? (value as BillingStatus) : "active";
}

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const { account } = useAccount();

  return (
    <AppShell
      tier={account?.tier ?? "free"}
      billingStatus={toBillingStatus(account?.billing_status)}
    >
      {children}
    </AppShell>
  );
}
