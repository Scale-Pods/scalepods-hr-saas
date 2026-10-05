"use client";

import { AppShell, type BillingStatus } from "@/components/shared/AppShell";
import { OnboardingModal } from "@/components/shared/OnboardingModal";
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
  const { account, accountLoading, refreshAccount } = useAccount();

  const showOnboarding = !accountLoading && Boolean(account) && !account?.company_name;

  return (
    <AppShell
      tier={account?.tier ?? "free"}
      billingStatus={toBillingStatus(account?.billing_status)}
      userName={account?.name}
      companyName={account?.company_name}
    >
      {children}
      <OnboardingModal
        open={showOnboarding}
        initialUserName={account?.name ?? ""}
        initialCompanyName={account?.company_name ?? ""}
        onComplete={refreshAccount}
      />
    </AppShell>
  );
}
