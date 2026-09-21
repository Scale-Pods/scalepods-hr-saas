"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSession } from "@/features/auth/hooks";
import { fetchAccount } from "./api";

export const accountKey = (userId: string | undefined) => ["account", userId] as const;

/**
 * The single source of truth for the caller's account (tier, billing status,
 * quiet hours). Keyed by user id so switching accounts never reuses a cached
 * row. Consumed by the recruiter layout to drive `AppShell` tier + banners.
 */
export function useAccount() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: accountKey(userId),
    queryFn: () => fetchAccount(userId as string),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });

  const refreshAccount = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: accountKey(userId) });
  }, [queryClient, userId]);

  return {
    ...query,
    account: query.data ?? null,
    accountLoading: Boolean(userId) && query.isPending,
    refreshAccount,
  };
}
