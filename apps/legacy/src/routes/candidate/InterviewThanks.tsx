import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { anonClient } from "../../lib/supabase";
import { sessionContextSchema, type SessionContext } from "@scalepods/core";
import { CandidateShell, ErrorCard, useCandidateToken } from "./shared";

export function InterviewThanksPage() {
  const { session_id } = useParams();
  const token = useCandidateToken();
  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session_id || !token) return;
    let cancelled = false;
    anonClient()
      .rpc("get_session_context", { p_session_id: session_id, p_token: token })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message ?? "Link invalid or expired.");
          return;
        }
        const parsed = sessionContextSchema.safeParse(data);
        if (parsed.success) setCtx(parsed.data);
      });
    return () => { cancelled = true; };
  }, [session_id, token]);

  const nRounds = ctx?.campaign.number_of_rounds ?? 0;
  const n = ctx?.round.round_number ?? 0;

  return (
    <CandidateShell>
      {error ? (
        <ErrorCard message={error} />
      ) : (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl">
            🎉
          </div>
          <h1 className="text-lg font-semibold text-foreground">You're all done!</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {ctx
              ? n >= nRounds
                ? "That was your last round — the recruiter will be in touch soon."
                : `Round ${n} of ${nRounds} complete. The recruiter will email you within 3 business days; if you pass, you'll get a link to the next step.`
              : "Thanks for your time. The recruiter will be in touch soon."}
          </p>
          {ctx ? (
            <a
              href="/"
              className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary"
            >
              Back to ScalePods
            </a>
          ) : null}
        </div>
      )}
    </CandidateShell>
  );
}