"use client";

import { CampaignCreateWizard } from "@/components/campaigns/CampaignCreateWizard";
import { useRouter } from "next/navigation";

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
