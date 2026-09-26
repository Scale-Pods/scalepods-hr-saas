"use client";

import { AuthError } from "@supabase/supabase-js";
import {
  BarChart3,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Lock,
  Mail,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadingScreen } from "@/components/shared/LoadingScreen";
import { showToast } from "@/components/shared/TierLimitToast";
import { useSession } from "@/features/auth/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

const features = [
  {
    icon: <Cpu className="h-5 w-5" />,
    title: "AI-Powered Screening",
    desc: "Automatically score resumes and rank candidates against your JD.",
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: "Real-time Analytics",
    desc: "Track funnel conversion, time-to-hire, and pipeline health live.",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Multi-round Campaigns",
    desc: "AI interviews, assignments & human rounds — all in one workflow.",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "n8n Automation",
    desc: "Every step is backed by a powerful no-code automation engine.",
  },
];

const stats = [
  { label: "Candidates screened", value: "1.2M+" },
  { label: "Avg. time saved / hire", value: "18 hrs" },
  { label: "Offer acceptance rate", value: "94%" },
];

export default function AuthPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (isPending) {
    return <LoadingScreen message="Establishing secure connection..." />;
  }

  if (session) {
    router.replace("/dashboard");
    return <LoadingScreen message="Redirecting to dashboard..." />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          router.push("/dashboard");
        } else {
          showToast("Check your inbox — verify your email to finish signing up.", { kind: "info" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
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
    const supabase = supabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { queryParams: { access_type: "offline", prompt: "consent" } },
    });
  };

  return (
    <div className="auth-split">
      {/* ── Left: Marketing panel ── */}
      <div className="auth-marketing">
        <div className="relative z-10">
          {/* Logo */}
          <div className="group mb-12 flex items-center">
            <div className="relative cursor-pointer transition-all duration-700 ease-in-out group-hover:scale-110">
              <div className="absolute inset-0 animate-pulse rounded-full bg-blue-500/20 blur-xl transition-all duration-500 group-hover:bg-blue-400/40 group-hover:blur-2xl" />
              <img
                src="/brand/scalepods-navbar-logo.png"
                alt="ScalePods"
                className="relative h-10 w-auto object-contain brightness-0 invert drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] transition-all duration-500 group-hover:drop-shadow-[0_0_15px_rgba(59,130,246,0.8)]"
              />
            </div>
          </div>

          {/* Badge */}
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            <span className="text-xs font-semibold text-blue-400">Version 2.0 · Now live</span>
          </div>

          {/* Headline */}
          <h1 className="mb-4 text-4xl font-bold leading-[1.1] tracking-[-0.03em] text-white">
            Scale your hiring.{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Intelligently.
            </span>
          </h1>
          <p className="mb-10 text-base leading-relaxed text-white/60">
            The AI-powered recruitment platform that automates screening, scores candidates, and
            closes talent 10× faster than traditional tools.
          </p>

          {/* Stats row */}
          <div className="mb-10 flex gap-6">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-bold tracking-[-0.03em] text-white">{s.value}</p>
                <p className="mt-0.5 text-xs text-white/40">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Feature list */}
          <div className="space-y-4">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-blue-400">
                  {f.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/90">{f.title}</p>
                  <p className="text-xs text-white/45">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Social proof */}
          <div className="mt-12 flex items-center gap-3 border-t border-white/[0.08] pt-6">
            <div className="flex -space-x-2">
              {["SJ", "MK", "AR", "TC"].map((initials) => (
                <div
                  key={initials}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-900 bg-gradient-to-br from-blue-500 to-cyan-500 text-[10px] font-bold text-white"
                >
                  {initials}
                </div>
              ))}
            </div>
            <p className="text-xs text-white/40">Trusted by hyper-growth teams globally</p>
          </div>
        </div>
      </div>

      {/* ── Right: Auth form panel ── */}
      <div className="auth-form-panel">
        <div className="w-full max-w-sm">
          <div className="text-center">
            <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mb-8 text-sm text-slate-400">
              {mode === "signin"
                ? "Sign in to your recruiting workspace."
                : "Start screening candidates in minutes."}
            </p>
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={google}
            className="mb-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-white/[0.09] hover:border-white/25 active:scale-[0.99]"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
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
            Continue with Google
          </button>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#090d16] px-3 text-xs uppercase tracking-widest text-slate-500">
                or
              </span>
            </div>
          </div>

          {/* Email/password form */}
          <form onSubmit={submit} className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs font-medium text-destructive"
              >
                {errorMsg}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-200"
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
                className="w-full rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:bg-white/[0.08] focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-200"
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
                  className="w-full rounded-xl border border-white/15 bg-white/[0.05] py-2.5 pl-3.5 pr-10 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:bg-white/[0.08] focus:ring-2 focus:ring-blue-500/20"
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

            {mode === "signin" && (
              <div className="flex justify-end">
                <a
                  href="/auth/reset"
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Forgot password?
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 active:scale-[0.99]"
            >
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in to Dashboard"
                  : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-400">
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
            <p className="mt-3 text-center text-[11px] text-slate-500">
              Free plan · No credit card required · Upgrade anytime
            </p>
          )}

          {/* Trust signals */}
          <div className="mt-8 flex items-center justify-center gap-4 border-t border-white/10 pt-6">
            {[
              {
                icon: <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />,
                label: "SOC 2 compliant",
              },
              { icon: <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />, label: "GDPR ready" },
              {
                icon: <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />,
                label: "99.9% uptime",
              },
            ].map((t) => (
              <div key={t.label} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                {t.icon}
                {t.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
