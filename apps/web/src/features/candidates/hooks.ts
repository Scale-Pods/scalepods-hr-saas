"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCandidateProfile } from "./api";

export function useCandidateProfile(id: string | undefined, tier: string) {
  return useQuery({
    queryKey: ["candidates", "profile", id],
    queryFn: () => fetchCandidateProfile(id as string, tier),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}
