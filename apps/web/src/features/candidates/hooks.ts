"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCandidateProfile } from "./api";

export function useCandidateProfile(
  id: string | undefined,
  tier: string,
  campaignId?: string | null,
) {
  return useQuery({
    queryKey: ["candidates", "profile", id, campaignId ?? "default"],
    queryFn: () => fetchCandidateProfile(id as string, tier, campaignId),
    enabled: Boolean(id),
    staleTime: 4_000,
    refetchInterval: 5_000,
  });
}
