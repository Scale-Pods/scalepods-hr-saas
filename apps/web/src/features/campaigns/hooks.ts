"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCampaignDetail, fetchCampaigns, updateCampaignStatus } from "./api";

export const campaignsKey = ["campaigns", "list"] as const;

export function useCampaigns() {
  return useQuery({
    queryKey: campaignsKey,
    queryFn: fetchCampaigns,
    staleTime: 5_000,
    refetchInterval: 6_000,
  });
}

export function useCampaignDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["campaigns", "detail", id],
    queryFn: () => fetchCampaignDetail(id as string),
    enabled: Boolean(id),
    staleTime: 4_000,
    refetchInterval: 5_000,
  });
}

export function useToggleCampaignStatus(
  campaignId: string,
  currentStatus: string,
  accountId: string | undefined,
  accessToken: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!accountId) throw new Error("Account not loaded");
      return updateCampaignStatus(campaignId, currentStatus, accountId, accessToken);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", campaignId] });
      queryClient.invalidateQueries({ queryKey: campaignsKey });
    },
  });
}
