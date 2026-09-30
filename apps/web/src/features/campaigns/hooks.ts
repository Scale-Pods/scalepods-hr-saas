"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteCampaign, fetchCampaignDetail, fetchCampaigns, updateCampaignStatus } from "./api";

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

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      accountId,
      accessToken,
    }: {
      campaignId: string;
      accountId?: string;
      accessToken?: string;
    }) => deleteCampaign(campaignId, accountId, accessToken),
    onSuccess: (_, { campaignId }) => {
      queryClient.removeQueries({ queryKey: ["campaigns", "detail", campaignId] });
      queryClient.invalidateQueries({ queryKey: campaignsKey });
    },
  });
}

export function useToggleCampaignStatus(
  campaignId: string,
  currentStatus: string,
  accountId: string | undefined,
  accessToken: string | undefined,
) {
  const queryClient = useQueryClient();
  const nextStatus = currentStatus === "on" ? "paused" : "on";
  return useMutation({
    mutationFn: () => {
      if (!accountId) throw new Error("Account not loaded");
      return updateCampaignStatus(campaignId, nextStatus, accountId, accessToken);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", campaignId] });
      queryClient.invalidateQueries({ queryKey: campaignsKey });
    },
  });
}

export function useUpdateCampaignStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      campaignId,
      newStatus,
      accountId,
      accessToken,
    }: {
      campaignId: string;
      newStatus: "on" | "paused" | "off";
      accountId?: string;
      accessToken?: string;
    }) => updateCampaignStatus(campaignId, newStatus, accountId, accessToken),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", "detail", campaignId] });
      queryClient.invalidateQueries({ queryKey: campaignsKey });
    },
  });
}
