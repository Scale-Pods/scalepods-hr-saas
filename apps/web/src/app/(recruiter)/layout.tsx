"use client";

import { isDomainExempt } from "@scalepods/core";
import { usePathname, useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";
import { ScalePodsDashboardChat } from "@/components/agent/ScalePodsDashboardChat";
import { AppShell, type BillingStatus } from "@/components/shared/AppShell";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { OnboardingModal } from "@/components/shared/OnboardingModal";
import { useAccount, useCompanyDomain } from "@/features/account/hooks";

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
  const pathname = usePathname();
  const router = useRouter();
  const { account, accountLoading, refreshAccount } = useAccount();
  const { data: domainData } = useCompanyDomain(account?.company_domain);

  const isDomainLocked =
    Boolean(account) &&
    account?.tier === "free" &&
    Boolean(domainData?.is_free_tier_exhausted) &&
    !isDomainExempt(account?.company_domain || "");

  useEffect(() => {
    if (isDomainLocked && pathname !== "/billing") {
      router.replace("/billing?domain_locked=1");
    }
  }, [isDomainLocked, pathname, router]);

  const showOnboarding = !accountLoading && Boolean(account) && !account?.company_name;

  if (isDomainLocked && pathname !== "/billing") {
    return <LoadingScreen message="Free tier trial ended. Redirecting to billing..." />;
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <AppShell
        tier={account?.tier ?? "free"}
        billingStatus={toBillingStatus(account?.billing_status)}
        userName={account?.name}
        companyName={account?.company_name}
        nextBillingDate={account?.next_billing_date}
      >
        {children}
        <OnboardingModal
          open={showOnboarding}
          initialUserName={account?.name ?? ""}
          initialCompanyName={account?.company_name ?? ""}
          onComplete={refreshAccount}
        />
        <ScalePodsDashboardChat />
      </AppShell>
    </>
  );
}
