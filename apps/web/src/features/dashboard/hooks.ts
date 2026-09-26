"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/hooks";
import {
  fetchCandidateNames,
  fetchDashboardKpis,
  fetchLedger,
  fetchReports,
  fetchUpcomingInterviews,
} from "./api";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  kpis: ["dashboard", "kpis"] as const,
  upcoming: ["dashboard", "upcoming"] as const,
  ledger: ["dashboard", "ledger"] as const,
  names: (ids: string[]) => ["dashboard", "names", ids.join(",")] as const,
  reports: (accountId: string | undefined) => ["dashboard", "reports", accountId] as const,
};

export function useDashboardKpis() {
  return useQuery({
    queryKey: dashboardKeys.kpis,
    queryFn: fetchDashboardKpis,
    staleTime: 5_000,
    refetchInterval: 6_000,
  });
}

export function useUpcomingInterviews() {
  return useQuery({
    queryKey: dashboardKeys.upcoming,
    queryFn: fetchUpcomingInterviews,
    staleTime: 5_000,
    refetchInterval: 6_000,
  });
}

export function useLedger() {
  return useQuery({
    queryKey: dashboardKeys.ledger,
    queryFn: () => fetchLedger(200),
    staleTime: 4_000,
    refetchInterval: 5_000,
  });
}

/** Candidate display names, batched for whichever ids the dashboard shows. */
export function useCandidateNames(ids: string[]) {
  const unique = Array.from(new Set(ids)).sort();
  return useQuery({
    queryKey: dashboardKeys.names(unique),
    queryFn: () => fetchCandidateNames(unique),
    enabled: unique.length > 0,
    staleTime: 5 * 60_000,
  });
}

/**
 * Usage + reporting workflow. `retry: 0` keeps a dead workflow 11 from hammering
 * the backend; the page renders its "unavailable" card on error.
 */
export function useReports(accountId: string | undefined) {
  const { data: session } = useSession();
  const token = session?.access_token;
  return useQuery({
    queryKey: dashboardKeys.reports(accountId),
    queryFn: () => fetchReports(accountId as string, token),
    enabled: Boolean(accountId),
    retry: 0,
    staleTime: 60_000,
  });
}
