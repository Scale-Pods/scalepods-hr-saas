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
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <Skeleton className="h-5 w-48" />
          <p className="text-sm text-muted-foreground">Verifying your link…</p>
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">
            This link may have expired or is invalid. Try signing in again.
          </p>
          <a
            href="/auth"
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
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
    <Suspense
      fallback={
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <Skeleton className="h-5 w-48" />
            <p className="text-sm text-muted-foreground">Loading…</p>
          </CardContent>
        </Card>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}
