import { QueryClient } from "@tanstack/react-query";

/**
 * One QueryClient factory with the app-wide defaults. Server-state reads
 * (Supabase AND webhooks) all go through TanStack Query so loading/error/retry
 * behaves identically everywhere.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
