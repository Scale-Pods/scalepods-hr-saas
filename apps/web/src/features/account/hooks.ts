"use client";

import type { CompanyDomainsRow } from "@scalepods/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSession } from "@/features/auth/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchAccount } from "./api";

export const accountKey = (userId: string | undefined) => ["account", userId] as const;
export const domainKey = (domain: string | undefined | null) => ["company_domain", domain] as const;

/**
 * Hook to retrieve domain restrictions and exhaustion status.
 */
export function useCompanyDomain(domain: string | null | undefined) {
  return useQuery({
    queryKey: domainKey(domain),
    queryFn: async (): Promise<CompanyDomainsRow | null> => {
      if (!domain) return null;
      const { data, error } = await supabaseBrowser()
        .from("company_domains")
        .select(
          "domain, tier, is_free_tier_exhausted, is_exempt, exhausted_at, primary_account_id, created_at, updated_at",
        )
        .eq("domain", domain)
        .maybeSingle();
      if (error) {
        console.warn("[useCompanyDomain] Failed to fetch domain state:", error);
        return null;
      }
      return (data as CompanyDomainsRow | null) ?? null;
    },
    enabled: Boolean(domain),
    staleTime: 30_000,
    refetchOnMount: true,
  });
}

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
    // Cache account details across page transitions for fast shell rendering
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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
