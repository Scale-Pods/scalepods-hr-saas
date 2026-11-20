"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchCandidateProfile } from "./api";

export function useCandidateProfile(
  id: string | undefined,
  tier: string,
  campaignId?: string | null,
  accountId?: string | null,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ["candidates", "profile", id, accountId ?? "default", campaignId ?? "default"],
    queryFn: () => fetchCandidateProfile(id as string, tier, campaignId, accountId),
    enabled: Boolean(id) && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: false,
  });
}
