import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { anonClient } from "../../lib/supabase";
import { Logo } from "../../components/Logo";

export function useCandidateToken(): string {
  const [params] = useSearchParams();
  return params.get("tok") ?? "";
}

/** Anonymous candidate-page shell - thin, mobile-first, no recruiter chrome. */
export function CandidateShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Logo size="sm" />
          <span className="text-sm font-semibold text-foreground">ScalePods</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-2xl px-4 pb-8 text-center text-xs text-muted-foreground">
        Powered by ScalePods
      </footer>
    </div>
  );
}

export function ErrorCard({ message, title }: { message?: string; title?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center shadow-sm">
      <h1 className="text-sm font-semibold text-foreground">{title ?? "This link isn't working"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {message ?? "The link may have expired or the token is missing. Ask the recruiter for a fresh link."}
      </p>
    </div>
  );
}

/** Runs a token-gated RPC on the anonymous client, normalising errors to Error. */
export async function candidateRpc<T>(
  fn: (client: ReturnType<typeof anonClient>) => Promise<{ data: T; error: unknown }>
): Promise<T> {
  const { data, error } = await fn(anonClient());
  if (error) throw error as Error;
  return data as T;
}