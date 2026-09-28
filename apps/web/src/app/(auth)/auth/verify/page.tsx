"use client";

import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabaseBrowser } from "@/lib/supabase/client";

function parseHashParams(): URLSearchParams {
  if (typeof window === "undefined" || !window.location.hash) {
    return new URLSearchParams();
  }
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"loading" | "need_new_password" | "done" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New password form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = supabaseBrowser();

    const hashParams = parseHashParams();
    const queryError = searchParams.get("error_description") || searchParams.get("error");
    const hashError = hashParams.get("error_description") || hashParams.get("error");
    const rawError = hashError || queryError;

    if (rawError) {
      const decoded = decodeURIComponent(rawError.replace(/\+/g, " "));
      setErrorMessage(decoded);
      setStatus("error");
      return;
    }

    const code = searchParams.get("code") || hashParams.get("code");
    const tokenHash = searchParams.get("token_hash") || hashParams.get("token_hash");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type = searchParams.get("type") || hashParams.get("type");
    const isRecovery = type === "recovery";

    // Listen for auth state changes (e.g. PASSWORD_RECOVERY event)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === "PASSWORD_RECOVERY" || (session && isRecovery)) {
        setStatus("need_new_password");
      }
    });

    const verify = async () => {
      try {
        // Flow 1: PKCE code exchange
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!isMounted) return;
          if (error) {
            setErrorMessage(error.message);
            setStatus("error");
            return;
          }
          if (isRecovery) {
            setStatus("need_new_password");
          } else {
            setStatus("done");
            showToast("Email verified successfully!", { kind: "success" });
            router.replace("/dashboard");
          }
          return;
        }

        // Flow 2: Token hash verification
        if (tokenHash) {
          const otpType = (type || "recovery") as "recovery" | "email" | "signup";
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          if (!isMounted) return;
          if (error) {
            setErrorMessage(error.message);
            setStatus("error");
            return;
          }
          if (isRecovery || otpType === "recovery") {
            setStatus("need_new_password");
          } else {
            setStatus("done");
            showToast("Email verified successfully!", { kind: "success" });
            router.replace("/dashboard");
          }
          return;
        }

        // Flow 3: Implicit hash tokens (access_token & refresh_token in hash)
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!isMounted) return;
          if (error) {
            setErrorMessage(error.message);
            setStatus("error");
            return;
          }
          if (isRecovery) {
            setStatus("need_new_password");
          } else {
            setStatus("done");
            showToast("Verified successfully!", { kind: "success" });
            router.replace("/dashboard");
          }
          return;
        }

        // Flow 4: Existing active session (Supabase client may have already processed URL tokens)
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session) {
          if (isRecovery) {
            setStatus("need_new_password");
            return;
          }
          setStatus("done");
          router.replace("/dashboard");
          return;
        }

        // If no code, token, or active session is found
        setErrorMessage("This verification or reset link is invalid or has expired.");
        setStatus("error");
      } catch (err) {
        if (!isMounted) return;
        setErrorMessage(err instanceof Error ? err.message : "Authentication failed.");
        setStatus("error");
      }
    };

    void verify();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [searchParams, router]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (newPassword.length < 8) {
      setFormError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      // Revoke the temporary recovery session so the user must authenticate explicitly
      await supabase.auth.signOut();

      showToast("Password updated successfully! Please sign in with your new password.", {
        kind: "success",
      });
      setStatus("done");
      router.replace("/auth");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update password.";
      setFormError(msg);
      showErrorToast(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <Card className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#090d16] p-0 shadow-2xl">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
          <p className="text-sm font-medium text-white">Verifying your link…</p>
          <p className="text-xs text-slate-400">Please wait while we validate your credentials.</p>
        </CardContent>
      </Card>
    );
  }

  if (status === "need_new_password") {
    return (
      <Card className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#090d16] p-0 shadow-2xl">
        <CardContent className="p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-400">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Set new password</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Enter your new password below to secure and access your account.
          </p>

          {formError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="new-password"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-200"
              >
                <Lock className="h-3.5 w-3.5 text-blue-400" aria-hidden />
                New password
              </label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded-xl border-white/15 bg-white/[0.05] py-2.5 pl-3.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-200"
              >
                <Lock className="h-3.5 w-3.5 text-blue-400" aria-hidden />
                Confirm password
              </label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-xl border-white/15 bg-white/[0.05] py-2.5 px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 py-2.5 font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-500 hover:to-cyan-500"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Updating…
                </span>
              ) : (
                "Update password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#090d16] p-0 shadow-2xl">
        <CardContent className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-400">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">Invalid or Expired Link</h2>
          <p className="mt-2 text-sm text-slate-400">
            {errorMessage ||
              "This link may have expired or is invalid. Reset links are single-use."}
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <Button
              asChild
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 py-2.5 font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-500 hover:to-cyan-500"
            >
              <Link href="/auth/reset">Request a new reset link</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="w-full rounded-xl border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
            >
              <Link href="/auth">Back to sign in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#090d16] p-0 shadow-2xl">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-white">Success!</h2>
        <p className="text-xs text-slate-400">Redirecting to sign in…</p>
      </CardContent>
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060913] p-4 text-white">
      <Suspense
        fallback={
          <Card className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#090d16] p-0 shadow-2xl">
            <CardContent className="flex flex-col items-center gap-3 p-8">
              <Skeleton className="h-5 w-48 bg-white/10" />
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
