"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCandidateProfile } from "./api";

export function useCandidateProfile(
  id: string | undefined,
  tier: string,
  campaignId?: string | null,
  accountId?: string | null,
) {
  return useQuery({
    queryKey: ["candidates", "profile", id, accountId ?? "anon", campaignId ?? "default"],
    queryFn: () => fetchCandidateProfile(id as string, tier, campaignId, accountId),
    enabled: Boolean(id),
    staleTime: 4_000,
    refetchInterval: 5_000,
  });
}
