"use client";

import { useRouter } from "next/navigation";
import { CampaignCreateWizard } from "@/components/campaigns/CampaignCreateWizard";

export default function CampaignNewPage() {
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
