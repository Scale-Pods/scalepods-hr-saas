"use client";

import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { CampaignCreateWizard } from "@/components/campaigns/CampaignCreateWizard";

function CampaignNewContent() {
  const router = useRouter();

  return (
    <CampaignCreateWizard
      onCancel={() => router.push("/campaigns")}
      onSuccess={(id) => {
        if (id) router.push(`/campaigns/${id}`);
        else router.push("/campaigns");
      }}
    />
  );
}

export default function CampaignNewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <CampaignNewContent />
    </Suspense>
  );
}
