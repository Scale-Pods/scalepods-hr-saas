"use client";

import type { SessionContext } from "@scalepods/core";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchSessionContext } from "@/features/candidate/api";

function ErrorCard({ message }: { message?: string }) {
  return (
    <div className="glass-surface rounded-[24px] p-6 text-center">
      <h1 className="text-2xl font-bold tracking-[-0.022em] text-foreground">
        This link isn&apos;t working
      </h1>
      <p className="mt-1.5 text-sm text-label-secondary">
        {message ?? "The link may have expired. Ask the recruiter for a fresh link."}
      </p>
    </div>
  );
}

export default function InterviewThanksPage() {
  const { session_id } = useParams<{ session_id: string }>();
  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session_id) return;
    let cancelled = false;
    fetchSessionContext(session_id)
      .then((c) => {
        if (!cancelled) setCtx(c);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Link invalid or expired.");
      });
    return () => {
      cancelled = true;
    };
  }, [session_id]);

  const nRounds = ctx?.campaign.number_of_rounds ?? 0;
  const n = ctx?.round.round_number ?? 0;

  if (error) return <ErrorCard message={error} />;

  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fill-quaternary/70 text-2xl">
        🎉
      </div>
      <h1 className="text-2xl font-bold tracking-[-0.022em] text-foreground">
        You&apos;re all done!
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-label-secondary">
        {ctx
          ? n >= nRounds
            ? "That was your last round — the recruiter will be in touch soon."
            : `Round ${n} of ${nRounds} complete. The recruiter will email you within 3 business days; if you pass, you'll get a link to the next step.`
          : "Thanks for your time. The recruiter will be in touch soon."}
      </p>
    </div>
  );
}
