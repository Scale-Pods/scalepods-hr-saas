"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchLedger } from "@/features/dashboard/api";

export const notificationsKeys = {
  decisions: ["notifications", "decisions"] as const,
};

/** Latest decision_ledger rows for the notification bell (45s stale, 60s poll). */
export function useDecisions() {
  return useQuery({
    queryKey: notificationsKeys.decisions,
    queryFn: () => fetchLedger(25),
    staleTime: 45_000,
    refetchInterval: 60_000,
  });
}
