"use client";

import { ArrowLeft, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (error) throw error;
      setSent(true);
      showToast("Check your inbox for a password reset link.", { kind: "info" });
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dark min-h-screen bg-[#080D1A] flex flex-col justify-between selection:bg-blue-500 selection:text-white relative overflow-hidden">
      {/* Ambient modern SaaS Grid & Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px] opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_25%,#000_60%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-100px] left-1/2 -translate-x-1/2 w-[900px] h-[520px] bg-gradient-to-b from-blue-600/20 via-cyan-500/10 to-transparent blur-3xl -z-0"
      />

      {/* Floating Header */}
      <header className="relative z-20 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center">
            {/* biome-ignore lint/performance/noImgElement: static navbar brand logo */}
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
          href="/auth"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/80 hover:border-slate-600 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white transition active:scale-[0.99]"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-blue-400" />
          <span>Back to Sign In</span>
        </Link>
      </header>

      {/* Main Centered Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center py-8 px-4 sm:px-6">
        <div className="w-full max-w-md">
          <div className="w-full rounded-3xl border border-slate-700/60 bg-[#0E1628]/95 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl shadow-blue-950/60 ring-1 ring-white/10 relative overflow-hidden">
            <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />

            {sent ? (
              <div className="text-center my-auto">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-lg shadow-blue-500/20">
                  <Mail className="h-7 w-7 text-blue-400" />
                </div>
                <h2 className="mb-2 text-2xl font-bold tracking-tight text-white">
                  Check your email
                </h2>
                <p className="mb-5 text-xs text-slate-300 leading-relaxed">
                  If an account exists for <span className="font-semibold text-white">{email}</span>
                  , we&apos;ve sent password reset instructions to your inbox.
                </p>
                <div className="mb-6 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 text-left text-xs text-slate-400 space-y-1">
                  <p className="font-medium text-slate-200 mb-1">Didn&apos;t receive the link?</p>
                  <p>• Wait 1–2 minutes for delivery</p>
                  <p>• Check your Spam or Promotions folder</p>
                  <p>• Ensure your email was entered accurately</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="mb-3 w-full rounded-xl border border-slate-700/70 bg-slate-800/60 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 hover:border-slate-600 active:scale-[0.99]"
                >
                  Try another email
                </button>
                <Link
                  href="/auth"
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline inline-block mt-2"
                >
                  Return to Sign In
                </Link>
              </div>
            ) : (
              <div>
                <div className="text-center mb-6">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                    Reset your password
                  </h2>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Enter the email address associated with your account and we&apos;ll send you a
                    secure link to reset your password.
                  </p>
                </div>

                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="reset-email"
                      className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300"
                    >
                      <Mail className="h-3.5 w-3.5 text-blue-400" aria-hidden />
                      Work email
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3.5 py-2 text-sm !text-white text-white !placeholder-slate-400 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-slate-900 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-white" />
                        <span>Sending reset link...</span>
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </button>
                </form>

                <p className="mt-5 text-center text-xs text-slate-400">
                  Remember your password?{" "}
                  <Link
                    href="/auth"
                    className="font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-4 text-center text-[11px] text-slate-500">
        © {new Date().getFullYear()} ScalePods. All rights reserved.
      </footer>
    </div>
  );
}
