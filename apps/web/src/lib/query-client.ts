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
        retry: 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}
