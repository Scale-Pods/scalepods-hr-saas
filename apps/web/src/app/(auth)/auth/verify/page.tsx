"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabaseBrowser } from "@/lib/supabase/client";

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    const code = params.get("code");
    const type = params.get("type");

    if (!code) {
      setStatus("error");
      return;
    }

    const supabase = supabaseBrowser();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setStatus("error");
        showErrorToast(error.message);
      } else {
        setStatus("done");
        showToast(type === "recovery" ? "Password updated — signing you in." : "Email verified!", {
          kind: "success",
        });
        router.replace("/dashboard");
      }
    });
  }, [params, router]);

  if (status === "loading") {
    return (
      <Card className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#090d16] p-0 shadow-2xl">
        <CardContent className="flex flex-col items-center gap-3 p-8">
          <Skeleton className="h-5 w-48 bg-white/10" />
          <p className="text-sm text-slate-400">Verifying your link…</p>
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#090d16] p-0 shadow-2xl">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-slate-300">
            This link may have expired or is invalid. Try signing in again.
          </p>
          <a
            href="/auth"
            className="mt-3 inline-block text-sm font-semibold text-blue-400 hover:text-blue-300 hover:underline"
          >
            Go to sign in
          </a>
        </CardContent>
      </Card>
    );
  }

  return null;
}

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060913] p-4 text-white">
      <Suspense
        fallback={
          <Card className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#090d16] p-0 shadow-2xl">
            <CardContent className="flex flex-col items-center gap-3 p-8">
              <Skeleton className="h-5 w-48" />
              <p className="text-sm text-slate-400">Loading…</p>
            </CardContent>
          </Card>
        }
      >
        <VerifyInner />
      </Suspense>
    </div>
  );
}
