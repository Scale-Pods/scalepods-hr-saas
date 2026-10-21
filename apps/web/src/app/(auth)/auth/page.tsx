"use client";

import { AuthError } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LegalModal } from "@/components/legal/LegalModal";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { showToast } from "@/components/shared/TierLimitToast";
import { useSession } from "@/features/auth/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

function AuthInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasNext = Boolean(searchParams.get("next"));
  const modeParam = searchParams.get("mode");
  const { data: session, isPending } = useSession();
  const [mode, setMode] = useState<Mode>(modeParam === "signup" ? "signup" : "signin");

  useEffect(() => {
    if (modeParam === "signup" || modeParam === "signin") {
      setMode(modeParam);
    }
  }, [modeParam]);
  const [userName, setUserName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [signupSuccessEmail, setSignupSuccessEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<"privacy" | "terms">("privacy");

  const openLegal = (tab: "privacy" | "terms") => {
    setLegalTab(tab);
    setLegalModalOpen(true);
  };

  const resendEmail = async () => {
    if (!signupSuccessEmail) return;
    setResending(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: signupSuccessEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      showToast("Verification email resent! Check your inbox.", { kind: "success" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to resend email.", { kind: "error" });
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    // If bounced here with ?next=..., the server indicated this request is unauthenticated.
    // Never auto-redirect to avoid infinite loop.
    if (session && !hasNext) {
      router.replace("/dashboard");
    }
  }, [session, router, hasNext]);

  if (isPending) {
    return <LoadingScreen message="Establishing secure connection..." />;
  }

  if (session && !hasNext) {
    return <LoadingScreen message="Redirecting to dashboard..." />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      if (mode === "signup") {
        const trimmedName = userName.trim();
        const trimmedCompany = companyName.trim();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              name: trimmedName,
              full_name: trimmedName,
              company_name: trimmedCompany,
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          if (trimmedName || trimmedCompany) {
            await supabase
              .from("accounts")
              .update({
                name: trimmedName || null,
                company_name: trimmedCompany || null,
              })
              .eq("id", data.session.user.id);
          }
          router.push("/dashboard");
        } else {
          setSignupSuccessEmail(email);
          showToast("Verification link sent! Check your inbox.", { kind: "success" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const target = searchParams.get("next") || "/dashboard";
        router.push(target);
      }
    } catch (err) {
      const msg =
        err instanceof AuthError
          ? err.message
          : err instanceof Error
            ? err.message
            : "An unexpected error occurred. Please try again.";
      setErrorMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          queryParams: { access_type: "offline", prompt: "consent" },
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setErrorMsg(error.message);
        setBusy(false);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to initiate Google sign in. Please try again.";
      setErrorMsg(msg);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080D1A] flex flex-col justify-between selection:bg-blue-500 selection:text-white relative overflow-hidden">
      {/* Ambient modern SaaS Grid & Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px] opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_25%,#000_60%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-100px] left-1/2 -translate-x-1/2 w-[900px] h-[520px] bg-gradient-to-b from-blue-600/20 via-cyan-500/10 to-transparent blur-3xl -z-0"
      />

      {/* ── Modern SaaS Floating Header (Clean & Uncluttered) ── */}
      <header className="relative z-20 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center">
            <img
              src="/brand/scalepods-navbar-logo.png"
              alt="ScalePods"
              className="h-8 sm:h-9 w-auto object-contain brightness-0 invert drop-shadow-[0_0_12px_rgba(59,130,246,0.35)]"
            />
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            Talent Intelligence Platform
          </span>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/80 hover:border-slate-600 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white transition active:scale-[0.99]"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-blue-400" />
          <span>Back to Home</span>
        </Link>
      </header>

      {/* ── Main Centered Content (Dedicated Standalone Auth Card) ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center py-8 px-4 sm:px-6">
        <div className="w-full max-w-md">
          {/* ── Login / Signup Card ── */}
          <div className="w-full rounded-3xl border border-slate-700/60 bg-[#0E1628]/95 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl shadow-blue-950/60 ring-1 ring-white/10 relative overflow-hidden">
            <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />
            {signupSuccessEmail ? (
              <div className="text-center my-auto">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-lg shadow-blue-500/20">
                    <Mail className="h-7 w-7 animate-pulse text-blue-400" />
                  </div>
                  <h2 className="mb-2 text-2xl font-bold tracking-tight text-white">
                    Check your email
                  </h2>
                  <p className="mb-4 text-xs text-slate-300 leading-relaxed">
                    We sent an account confirmation link to{" "}
                    <span className="font-semibold text-white">{signupSuccessEmail}</span>.
                  </p>
                  <div className="mb-5 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 text-left text-xs text-slate-400 space-y-1">
                    <p className="font-medium text-slate-200 mb-1">Didn&apos;t receive the email?</p>
                    <p>• Wait 1–2 minutes for delivery</p>
                    <p>• Check your Spam or Promotions folder</p>
                    <p>• Ensure your email was entered accurately</p>
                  </div>
                  <button
                    type="button"
                    disabled={resending}
                    onClick={resendEmail}
                    className="mb-3 w-full rounded-xl border border-slate-700/70 bg-slate-800/60 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 hover:border-slate-600 disabled:opacity-50 active:scale-[0.99]"
                  >
                    {resending ? "Sending link..." : "Resend Verification Email"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSignupSuccessEmail(null);
                      setMode("signin");
                    }}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <div className="flex flex-col justify-between h-full">
                  {/* Mode Tab Switcher */}
                    <div className="flex items-center justify-center mb-3 sm:mb-4">
                      <div className="inline-flex rounded-xl bg-slate-900/80 p-1 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setMode("signin");
                            setErrorMsg(null);
                          }}
                          className={`rounded-lg px-3.5 py-1 text-xs font-semibold transition-all ${
                            mode === "signin"
                              ? "bg-blue-600 text-white shadow-sm"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Sign In
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMode("signup");
                            setErrorMsg(null);
                          }}
                          className={`rounded-lg px-3.5 py-1 text-xs font-semibold transition-all ${
                            mode === "signup"
                              ? "bg-blue-600 text-white shadow-sm"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          Create Account
                        </button>
                      </div>
                    </div>

                    <div className="text-center mb-3 sm:mb-4">
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                        {mode === "signin" ? "Welcome back" : "Create your account"}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {mode === "signin"
                          ? "Sign in to your recruiting workspace."
                          : "Start screening candidates in minutes."}
                      </p>
                    </div>

                    {errorMsg && (
                      <div
                        role="alert"
                        className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs font-medium text-destructive"
                      >
                        {errorMsg}
                      </div>
                    )}

                    {/* Google OAuth Button */}
                    <button
                      type="button"
                      onClick={google}
                      disabled={busy}
                      className="mb-3 flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-slate-800/80 hover:border-slate-600 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                    {busy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-blue-400" aria-hidden />
                        <span>Connecting to Google...</span>
                      </>
                    ) : (
                      <>
                        <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
                          <path
                            fill="#4285F4"
                            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
                          />
                          <path
                            fill="#34A853"
                            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
                          />
                          <path
                            fill="#EA4335"
                            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
                          />
                        </svg>
                        <span>Continue with Google</span>
                      </>
                    )}
                  </button>

                  <div className="relative mb-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-700/60" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-[#0E1628] px-3 text-[11px] uppercase tracking-widest text-slate-500">
                        or
                      </span>
                    </div>
                  </div>

                  {/* Email & Password Form */}
                  <form onSubmit={submit} className="space-y-3.5">
                    {mode === "signup" && (
                      <>
                        <div>
                          <label
                            htmlFor="userName"
                            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300"
                          >
                            <User className="h-3.5 w-3.5 text-blue-400" aria-hidden />
                            Your full name
                          </label>
                          <input
                            id="userName"
                            type="text"
                            required
                            placeholder="e.g. Alex Morgan"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            className="w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3.5 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="companyName"
                            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300"
                          >
                            <Building2 className="h-3.5 w-3.5 text-blue-400" aria-hidden />
                            Company name
                          </label>
                          <input
                            id="companyName"
                            type="text"
                            required
                            placeholder="e.g. Acme Corp"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3.5 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label
                        htmlFor="email"
                        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300"
                      >
                        <Mail className="h-3.5 w-3.5 text-blue-400" aria-hidden />
                        Work email
                      </label>
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3.5 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="password"
                        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300"
                      >
                        <Lock className="h-3.5 w-3.5 text-blue-400" aria-hidden />
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete={mode === "signin" ? "current-password" : "new-password"}
                          required
                          minLength={8}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full rounded-xl border border-slate-700/60 bg-slate-900/60 py-2 pl-3.5 pr-10 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {mode === "signin" && (
                      <div className="flex justify-end pt-0.5">
                        <a
                          href="/auth/reset"
                          className="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          Forgot password?
                        </a>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition active:scale-[0.99] disabled:opacity-50"
                    >
                      {busy
                        ? "Please wait…"
                        : mode === "signin"
                          ? "Sign in to Dashboard"
                          : "Create account"}
                    </button>
                  </form>

                  <p className="mt-4 text-center text-xs text-slate-400">
                    {mode === "signin" ? "New to ScalePods?" : "Already have an account?"}{" "}
                    <button
                      type="button"
                      className="font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                      onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                    >
                      {mode === "signin" ? "Create account" : "Sign in"}
                    </button>
                  </p>

                  {mode === "signup" && (
                    <p className="mt-2 text-center text-[11px] text-slate-500">
                      Free plan · No credit card required · Upgrade anytime
                    </p>
                  )}

                  {/* Legal Consent Line */}
                  <p className="mt-4 text-center text-[11px] text-slate-400">
                    By continuing, you agree to ScalePods{" "}
                    <button
                      type="button"
                      onClick={() => openLegal("terms")}
                      className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                    >
                      Terms of Service
                    </button>{" "}
                    and{" "}
                    <button
                      type="button"
                      onClick={() => openLegal("privacy")}
                      className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                    >
                      Privacy Policy
                    </button>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>

      {/* ── Sleek Minimal Auth Footer ── */}
      <footer className="relative z-20 py-4 text-center text-[11px] text-slate-500">
        © {new Date().getFullYear()} ScalePods AI Infrastructure. All rights reserved.
      </footer>

      {/* Interactive ScalePods Legal Dialog */}
      <LegalModal
        open={legalModalOpen}
        onOpenChange={setLegalModalOpen}
        tab={legalTab}
        onTabChange={setLegalTab}
      />
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Establishing secure connection..." />}>
      <AuthInner />
    </Suspense>
  );
}
