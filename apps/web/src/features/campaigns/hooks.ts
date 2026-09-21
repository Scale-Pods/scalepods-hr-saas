"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCampaigns } from "./api";

export const campaignsKey = ["campaigns", "list"] as const;

export function useCampaigns() {
  return useQuery({
    queryKey: campaignsKey,
    queryFn: fetchCampaigns,
    staleTime: 30_000,
  });
}
